import 'server-only'
import { adminDb } from './db'
import {
  issueErrorMessage,
  issuePayload,
  loadIssueDraft,
  loadIssuerProfile,
  prepareKindIssue,
} from './invoice-issue'
import { isKindsReady } from './project-billing'
import { billingOverview, isInvoiceKind, kindItemDescription, type InvoiceKind, type KindPlan } from './invoice-kinds'
import { issueInvoiceSchema } from './invoice-issue-schema'
import {
  draftGaps,
  gapsSentence,
  periodLabel,
  type DraftFields,
  type DraftSource,
  type RecurringFields,
} from './invoice-draft-schema'
import { invoiceTotal } from '@/lib/invoice-pdf/totals'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import { createNotification } from '@/lib/notifications'

/**
 * Koncepty faktur a pravidelné faktury (R-117).
 *
 * Koncept vznikne sám (hotová zakázka, asistent, pravidelná faktura) nebo
 * ručně, čeká ve Fakturách › Ke schválení a teprve kliknutím „Schválit
 * a poslat" dostane číslo z řady a odejde klientovi. Nic z tohohle souboru
 * neposílá e-mail — to dělá route handler, který umí vyrobit PDF.
 */

// ─── Je migrace 117 v databázi? ──────────────────────────────────────────────

let draftsReady: boolean | null = null

/**
 * Migraci pouští Kryštof a může to být až po nasazení. Do té doby se
 * Faktury chovají jako dřív a koncepty prostě nejsou — žádná stránka kvůli
 * chybějící tabulce nespadne.
 */
export async function isDraftsReady(): Promise<boolean> {
  if (draftsReady) return true
  const rows = await adminDb`SELECT to_regclass('public.invoice_drafts') IS NOT NULL AS ok`
  draftsReady = (rows[0] as { ok: boolean } | undefined)?.ok === true
  return draftsReady
}

/** Jen pro testy. */
export function resetDraftsReadyForTests(): void {
  draftsReady = null
}

// ─── Čtení ───────────────────────────────────────────────────────────────────

export type InvoiceDraft = DraftFields & {
  id: string
  source: DraftSource
  status: 'draft' | 'sending' | 'issued' | 'dismissed'
  projectLabel: string | null
  recurringLabel: string | null
  period: string | null
  total: number
  gaps: string[]
  createdAt: string
}

type DraftRow = {
  id: string
  source: DraftSource
  status: InvoiceDraft['status']
  project_id: string | null
  project_label: string | null
  recurring_label: string | null
  period: string | null
  counterparty: DraftFields['counterparty'] | null
  client_email: string
  items: DraftFields['items'] | null
  currency: string
  due_days: number
  supplied_on: string | null
  note: string
  created_at: string
  invoice_kind?: string | null
  share_percent?: number | null
}

const DRAFT_SELECT = `
  SELECT d.id::text, d.source, d.status, d.project_id::text, d.period,
         CASE WHEN p.id IS NULL THEN NULL
              WHEN p.description IS NULL OR p.description = '' THEN p.client_name
              ELSE p.client_name || ' — ' || p.description END AS project_label,
         r.label AS recurring_label,
         d.counterparty, d.client_email, d.items, d.currency, d.due_days,
         d.supplied_on::text AS supplied_on, d.note, d.created_at::text AS created_at,
         to_jsonb(d)->>'invoice_kind' AS invoice_kind, (to_jsonb(d)->>'share_percent')::float AS share_percent
  FROM invoice_drafts d
  LEFT JOIN projects p ON p.id = d.project_id
  LEFT JOIN invoice_recurring r ON r.id = d.recurring_id
`

/** „Sending" déle než pět minut = vystavení spadlo uprostřed; koncept se vrací. */
const STALE_SENDING = `(d.status = 'sending' AND d.updated_at < now() - interval '5 minutes')`

function toDraft(row: DraftRow): InvoiceDraft {
  const fields: DraftFields = {
    projectId: row.project_id,
    counterparty: {
      name: row.counterparty?.name ?? '',
      address: row.counterparty?.address ?? '',
      ico: row.counterparty?.ico ?? '',
      dic: row.counterparty?.dic ?? '',
    },
    email: row.client_email ?? '',
    items: Array.isArray(row.items) ? row.items : [],
    currency: row.currency === 'EUR' ? 'EUR' : 'CZK',
    dueDays: Number(row.due_days ?? 14),
    suppliedOn: row.supplied_on ?? '',
    note: row.note ?? '',
    kind: isInvoiceKind(row.invoice_kind) ? row.invoice_kind : null,
    percent: row.share_percent == null ? null : Number(row.share_percent),
  }
  let total = 0
  try {
    total = invoiceTotal(fields.items)
  } catch {
    // Rozepsaná položka (nula kusů apod.) — součet se ukáže, až bude úplná.
    total = 0
  }
  return {
    ...fields,
    id: row.id,
    source: row.source,
    status: row.status === 'sending' ? 'draft' : row.status,
    projectLabel: row.project_label,
    recurringLabel: row.recurring_label,
    period: row.period,
    total,
    gaps: draftGaps(fields),
    createdAt: row.created_at,
  }
}

/** Koncepty, které čekají na schválení — nejnovější nahoře. */
export async function listOpenDrafts(): Promise<InvoiceDraft[]> {
  if (!(await isDraftsReady())) return []
  const [rows] = await adminDb.batch([
    { text: `${DRAFT_SELECT} WHERE d.status = 'draft' OR ${STALE_SENDING} ORDER BY d.created_at DESC LIMIT 100`, params: [] },
  ])
  return (rows as DraftRow[]).map(toDraft)
}

export async function getDraft(id: string): Promise<InvoiceDraft | null> {
  if (!(await isDraftsReady())) return null
  const [rows] = await adminDb.batch([{ text: `${DRAFT_SELECT} WHERE d.id = $1 LIMIT 1`, params: [id] }])
  const row = rows[0] as DraftRow | undefined
  return row ? toDraft(row) : null
}

// ─── Zápis ───────────────────────────────────────────────────────────────────

function fieldsParams(fields: DraftFields): unknown[] {
  return [
    fields.projectId,
    JSON.stringify(fields.counterparty),
    fields.email,
    JSON.stringify(fields.items),
    fields.currency,
    fields.dueDays,
    fields.suppliedOn === '' ? null : fields.suppliedOn,
    fields.note,
  ]
}

/** Ruční koncept nebo koncept od asistenta. Vrací id. */
export async function createDraft(source: 'manual' | 'assistant', fields: DraftFields): Promise<string> {
  const [rows] = await adminDb.batch([
    {
      text: `
        INSERT INTO invoice_drafts
          (source, project_id, counterparty, client_email, items, currency, due_days, supplied_on, note)
        VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8::date, $9)
        RETURNING id::text
      `,
      params: [source, ...fieldsParams(fields)],
    },
  ])
  const id = (rows[0] as { id: string } | undefined)?.id
  if (!id) throw new Error('invoice_draft_missing')
  await saveDraftKind(id, fields)
  return id
}

/**
 * Druh a procento konceptu (migrace 132). Zvlášť, ať ukládání konceptu
 * funguje i na databázi, kde 132 ještě není.
 */
async function saveDraftKind(id: string, fields: Pick<DraftFields, 'kind' | 'percent'>): Promise<void> {
  if (!(await isKindsReady())) return
  await adminDb`
    UPDATE invoice_drafts SET invoice_kind = ${fields.kind ?? null}, share_percent = ${fields.kind && fields.kind !== 'single' && fields.kind !== 'final' ? fields.percent ?? null : null}
    WHERE id = ${id}
  `
}

/** Úprava konceptu. Vystavený nebo zahozený koncept se nemění. */
export async function updateDraft(id: string, fields: DraftFields): Promise<boolean> {
  const [rows] = await adminDb.batch([
    {
      text: `
        UPDATE invoice_drafts SET
          project_id = $2, counterparty = $3::jsonb, client_email = $4, items = $5::jsonb,
          currency = $6, due_days = $7, supplied_on = $8::date, note = $9, updated_at = now()
        WHERE id = $1 AND status = 'draft'
        RETURNING id
      `,
      params: [id, ...fieldsParams(fields)],
    },
  ])
  if (rows.length > 0) await saveDraftKind(id, fields)
  return rows.length > 0
}

export async function setDraftEmail(id: string, email: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE invoice_drafts SET client_email = ${email}, updated_at = now()
    WHERE id = ${id} AND status = 'draft' RETURNING id
  `
  return rows.length > 0
}

/** Zahodit. Řádek zůstává (a s ním zámek „hotová zakázka jednou"), Zpět ho vrátí. */
export async function dismissDraft(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE invoice_drafts SET status = 'dismissed', dismissed_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'draft' RETURNING id
  `
  return rows.length > 0
}

export async function restoreDraft(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE invoice_drafts SET status = 'draft', dismissed_at = NULL, updated_at = now()
    WHERE id = ${id} AND status = 'dismissed' RETURNING id
  `
  return rows.length > 0
}

/** „Zpět" u asistenta: koncept, který nikdo nevystavil, zmizí úplně. */
export async function deleteAssistantDraft(id: string): Promise<boolean> {
  const rows = await adminDb`
    DELETE FROM invoice_drafts WHERE id = ${id} AND source = 'assistant' AND status = 'draft' RETURNING id
  `
  return rows.length > 0
}

// ─── Automatika: hotová zakázka ──────────────────────────────────────────────

/**
 * Zakázka je hotová → koncept faktury na to, co zbývá. Připraví se jen
 * jednou (ani zahozený se nevrátí) a jen tehdy, když dává smysl:
 * - zakázka je pro klienta a pořád ve stavu „hotovo" (Zpět ji mohl vrátit),
 * - zbývá něco vyfakturovat (cena − zálohy − platné faktury, R-110, R-143).
 *
 * Od R-143 je to **finální faktura**, když už byla záloha nebo předchozí
 * faktura (odečte je), jinak faktura za celé dílo. Bez migrace 132 platí
 * původní pravidlo: k zakázce s fakturou se koncept nepřipravuje.
 *
 * Vrací id nového konceptu, nebo null.
 */
export async function prepareProjectDoneDraft(projectId: string): Promise<string | null> {
  if (!(await isDraftsReady())) return null
  const rows = await adminDb<{ ok: boolean }>`
    SELECT (p.status = 'done'
            AND coalesce(p.project_type, 'client') = 'client'
            AND NOT EXISTS (SELECT 1 FROM invoice_drafts d WHERE d.project_id = p.id AND d.source = 'project_done')
           ) AS ok
    FROM projects p WHERE p.id = ${projectId} LIMIT 1
  `
  if (rows[0]?.ok !== true) return null

  const [draft, issuer, kindsReady] = await Promise.all([loadIssueDraft(projectId), loadIssuerProfile(), isKindsReady()])
  const billing = draft.billing
  if (!billing) return null
  if (!kindsReady && billing.invoices.length > 0) return null

  const overview = billingOverview(billing)
  const amount = billing.price > 0 ? overview.free : 0
  if (amount <= 0) return null

  const kind: InvoiceKind | null = !kindsReady ? null : billing.paid > 0 || billing.invoices.length > 0 ? 'final' : 'single'
  const vatRate = issuer.profile.vatPayer ? 21 : 0
  const base = draft.items[0]?.description || projectDescription(draft.projectLabel)
  const description = kind === 'final' ? kindItemDescription('final', billing.description || base, overview.freePct) : base
  const fields: DraftFields = {
    projectId,
    counterparty: draft.counterparty,
    email: draft.email,
    items: [{ description, quantity: 1, unitPrice: amount, vatRate }],
    currency: 'CZK',
    dueDays: 14,
    suppliedOn: '',
    note: '',
    kind,
    percent: null,
  }

  // ON CONFLICT: dvě rychlé změny stavu za sebou nezaloží dva koncepty.
  const [inserted] = await adminDb.batch([
    {
      text: `
        INSERT INTO invoice_drafts
          (source, project_id, counterparty, client_email, items, currency, due_days, supplied_on, note)
        VALUES ('project_done', $1, $2::jsonb, $3, $4::jsonb, $5, $6, $7::date, $8)
        ON CONFLICT (project_id) WHERE source = 'project_done' DO NOTHING
        RETURNING id::text
      `,
      params: fieldsParams(fields),
    },
  ])
  const id = (inserted[0] as { id: string } | undefined)?.id ?? null
  if (id) await saveDraftKind(id, fields)
  return id
}

/**
 * Pro `after()` po změně stavu: počká na „Zpět" (stejný odklad jako e-mail
 * klientovi) a teprve pak koncept připraví — `prepareProjectDoneDraft` si
 * stav zakázky přečte znovu. Chyba se jen zaloguje, změnu stavu nezruší.
 */
export async function prepareProjectDoneDraftLater(projectId: string, delayMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, delayMs))
  try {
    const id = await prepareProjectDoneDraft(projectId)
    if (id) {
      await createNotification({
        type: 'invoice_draft',
        title: 'Faktura ke schválení',
        body: 'Zakázka je hotová, koncept faktury na to, co zbývá, čeká ve Fakturách.',
        link: '/dashboard/faktury',
      })
    }
  } catch (err) {
    console.error('[Faktury] Koncept k hotové zakázce se nepodařilo připravit.', err instanceof Error ? err.message : String(err))
  }
}

/** „Kavárna U Mostu — Nový web" → „Nový web". Bez popisu prázdné. */
function projectDescription(label: string | null): string {
  if (!label) return ''
  const parts = label.split(' — ')
  return parts.length > 1 ? parts.slice(1).join(' — ') : ''
}

// ─── Automatika: pravidelné faktury ──────────────────────────────────────────

/**
 * Jednou denně (cron `send-reminders`): každá aktivní pravidelná faktura,
 * jejíž den v měsíci už nastal, dostane koncept za tento měsíc. Nejvýš
 * jeden za měsíc — hlídá to unikátní index, takže opakovaný běh nic nezdvojí.
 *
 * Šablona založená až po svém dni v měsíci začne příštím měsícem — jinak by
 * vznikl koncept za měsíc, který už skoro skončil.
 */
export async function prepareRecurringDrafts(today = getPragueTodayISO()): Promise<number> {
  if (!(await isDraftsReady())) return 0
  const period = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const note = `Za období ${periodLabel(period)}.`
  const rows = await adminDb`
    INSERT INTO invoice_drafts
      (source, project_id, recurring_id, period, counterparty, client_email, items, currency, due_days, note)
    SELECT 'recurring', r.project_id, r.id, ${period}, r.counterparty, r.client_email, r.items,
           r.currency, r.due_days, ${note}
    FROM invoice_recurring r
    WHERE r.active
      AND r.day_of_month <= ${day}
      AND (to_char(r.created_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') < ${period}
           OR extract(day FROM r.created_at AT TIME ZONE 'Europe/Prague') <= r.day_of_month)
    ON CONFLICT (recurring_id, period) WHERE recurring_id IS NOT NULL DO NOTHING
    RETURNING id
  `
  return rows.length
}

export type RecurringInvoice = RecurringFields & {
  id: string
  active: boolean
  total: number
  projectLabel: string | null
  lastPeriod: string | null
}

export async function listRecurring(): Promise<RecurringInvoice[]> {
  if (!(await isDraftsReady())) return []
  const rows = await adminDb<{
    id: string
    label: string
    project_id: string | null
    project_label: string | null
    counterparty: RecurringFields['counterparty']
    client_email: string
    items: RecurringFields['items']
    currency: string
    due_days: number
    day_of_month: number
    active: boolean
    last_period: string | null
  }>`
    SELECT r.id::text, r.label, r.project_id::text, r.counterparty, r.client_email, r.items,
           r.currency, r.due_days, r.day_of_month, r.active,
           CASE WHEN p.id IS NULL THEN NULL ELSE p.client_name END AS project_label,
           (SELECT max(d.period) FROM invoice_drafts d WHERE d.recurring_id = r.id) AS last_period
    FROM invoice_recurring r
    LEFT JOIN projects p ON p.id = r.project_id
    ORDER BY r.active DESC, r.label
  `
  return rows.map(row => {
    let total = 0
    try {
      total = invoiceTotal(row.items)
    } catch {
      total = 0
    }
    return {
      id: row.id,
      label: row.label,
      projectId: row.project_id,
      projectLabel: row.project_label,
      counterparty: row.counterparty,
      email: row.client_email,
      items: row.items,
      currency: row.currency === 'EUR' ? 'EUR' : 'CZK',
      dueDays: row.due_days,
      dayOfMonth: row.day_of_month,
      active: row.active,
      total,
      lastPeriod: row.last_period,
    }
  })
}

export async function saveRecurring(id: string | null, fields: RecurringFields): Promise<string> {
  const params = [
    fields.label,
    fields.projectId,
    JSON.stringify(fields.counterparty),
    fields.email,
    JSON.stringify(fields.items),
    fields.currency,
    fields.dueDays,
    fields.dayOfMonth,
  ]
  const [rows] = await adminDb.batch([
    id === null
      ? {
          text: `
            INSERT INTO invoice_recurring
              (label, project_id, counterparty, client_email, items, currency, due_days, day_of_month)
            VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)
            RETURNING id::text
          `,
          params,
        }
      : {
          text: `
            UPDATE invoice_recurring SET
              label = $1, project_id = $2, counterparty = $3::jsonb, client_email = $4, items = $5::jsonb,
              currency = $6, due_days = $7, day_of_month = $8, updated_at = now()
            WHERE id = $9
            RETURNING id::text
          `,
          params: [...params, id],
        },
  ])
  const saved = (rows[0] as { id: string } | undefined)?.id
  if (!saved) throw new Error('invoice_recurring_missing')
  return saved
}

export async function setRecurringActive(id: string, active: boolean): Promise<boolean> {
  const rows = await adminDb`
    UPDATE invoice_recurring SET active = ${active}, updated_at = now() WHERE id = ${id} RETURNING id
  `
  return rows.length > 0
}

// ─── Schválení: vystavit ─────────────────────────────────────────────────────

export type IssueDraftResult =
  | { ok: true; invoiceId: string; number: string; email: string }
  | { ok: false; error: string; status: number; editHref?: string }

/**
 * Vystaví koncept. **Číslo dostane až tady** a koncept se označí jako
 * vystavený v témže příkazu, ve kterém doklad vznikne — dvojí kliknutí ani
 * spadlá funkce tak nemůžou vyrobit dvě faktury z jednoho konceptu.
 *
 * Postup: zamknout koncept (`draft` → `sending`), zkontrolovat úplnost,
 * jedním `UPDATE … admin_invoice_issue(…)` vystavit. Když cokoli selže,
 * koncept se vrátí do `draft` a nic nevznikne.
 */
export async function issueDraft(id: string, to?: string): Promise<IssueDraftResult> {
  if (!(await isDraftsReady())) return { ok: false, error: 'Koncepty faktur ještě nejsou zapnuté.', status: 404 }
  const editHref = `/dashboard/faktury/nova?koncept=${id}`

  const { profile, configured } = await loadIssuerProfile()
  if (!configured) {
    return { ok: false, error: 'Nejdřív vyplňte údaje dodavatele.', status: 400, editHref: '/dashboard/faktury/dodavatel' }
  }

  if (to !== undefined) await setDraftEmail(id, to)

  const [claimed] = await adminDb.batch([
    {
      text: `
        UPDATE invoice_drafts d SET status = 'sending', updated_at = now()
        WHERE d.id = $1 AND (d.status = 'draft' OR ${STALE_SENDING})
        RETURNING d.id::text, d.source, d.status, d.project_id::text, d.period,
                  NULL::text AS project_label, NULL::text AS recurring_label,
                  d.counterparty, d.client_email, d.items, d.currency, d.due_days,
                  d.supplied_on::text AS supplied_on, d.note, d.created_at::text AS created_at,
                  to_jsonb(d)->>'invoice_kind' AS invoice_kind, (to_jsonb(d)->>'share_percent')::float AS share_percent
      `,
      params: [id],
    },
  ])
  const row = claimed[0] as DraftRow | undefined
  if (!row) return { ok: false, error: 'Tenhle koncept už je vyřízený.', status: 409 }

  const release = () => adminDb`UPDATE invoice_drafts SET status = 'draft', updated_at = now() WHERE id = ${id} AND status = 'sending'`
  const draft = toDraft(row)

  if (draft.gaps.length > 0) {
    await release()
    return { ok: false, error: `V konceptu chybí ${gapsSentence(draft.gaps)}.`, status: 400, editHref }
  }

  const today = getPragueTodayISO()
  const parsed = issueInvoiceSchema.safeParse({
    projectId: draft.projectId,
    counterparty: draft.counterparty,
    issuedOn: today,
    suppliedOn: draft.suppliedOn || today,
    dueOn: addIsoDays(today, draft.dueDays),
    currency: draft.currency,
    items: draft.items.filter(item => item.description.trim() !== ''),
    note: draft.note,
  })
  if (!parsed.success) {
    await release()
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Něco v konceptu nesedí.', status: 400, editHref }
  }
  if (!profile.vatPayer && parsed.data.items.some(item => item.vatRate !== 0)) {
    await release()
    return { ok: false, error: 'Nejste plátce DPH, takže položky musí mít sazbu 0 %.', status: 400, editHref }
  }

  // Druh faktury (R-143): částka zálohové, částečné a finální se přepočítá
  // podle stavu zakázky teď, ne podle toho, kdy koncept vznikl. Koncept bez
  // druhu (z doby před R-143) se vystaví jako dřív.
  let toIssue = parsed.data
  let plan: KindPlan | null = null
  if (draft.kind) {
    if (draft.kind !== 'single' && parsed.data.items.length !== 1) {
      await release()
      return { ok: false, error: 'Zálohová, částečná i finální faktura má jednu položku.', status: 400, editHref }
    }
    const prepared = await prepareKindIssue(parsed.data, { kind: draft.kind, percent: draft.percent ?? null }, profile)
    if (!prepared.ok) {
      await release()
      return { ok: false, error: prepared.error, status: 400, editHref }
    }
    toIssue = prepared.input
    plan = prepared.plan
  }

  let invoiceId: string | undefined
  try {
    const issued = await adminDb<{ invoice_id: string }>`
      UPDATE invoice_drafts SET
        invoice_id = admin_invoice_issue(${JSON.stringify(issuePayload(toIssue, profile, plan))}::jsonb),
        status = 'issued', issued_at = now(), updated_at = now()
      WHERE id = ${id} AND status = 'sending'
      RETURNING invoice_id::text
    `
    invoiceId = issued[0]?.invoice_id
  } catch (err) {
    await release()
    return { ok: false, error: issueErrorMessage(err), status: 400, editHref }
  }
  if (!invoiceId) {
    await release()
    return { ok: false, error: 'Fakturu se nepodařilo vystavit. Zkuste to prosím znovu.', status: 500 }
  }

  const numbered = await adminDb<{ invoice_number: string }>`
    UPDATE invoices SET client_email = ${draft.email} WHERE id = ${invoiceId} RETURNING invoice_number
  `
  return { ok: true, invoiceId, number: numbered[0]?.invoice_number ?? '', email: draft.email }
}
