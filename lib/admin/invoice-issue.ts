import 'server-only'
import { sql } from '@/lib/db'
import { contactOfProject, loadFacts, type AdminFacts } from '@/lib/admin/memory/facts'
import { adminDb, type AdminQuery } from './db'
import { extraDepositsSql, invoicePaymentsSql, remainingToPay } from './project-payments'
import { invoiceTotal } from '@/lib/invoice-pdf/totals'
import type { PdfDocument, PdfInvoice } from '@/lib/invoice-pdf/render'
import { isKindsReady, loadProjectBilling } from './project-billing'
import {
  isInvoiceKind,
  kindItemDescription,
  resolveKindPlan,
  round2,
  type IssueKindInput,
  type KindPlan,
  type ProjectBilling,
  type Settlement,
} from './invoice-kinds'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import { isValidIco, lookupIco } from '@/lib/ares'
import type { PrefillSources } from './invoice-prefill'
import { absorbBillingIntoContact, type BillingValues } from './contact-sync'
import {
  DEFAULT_DUE_DAYS,
  EMPTY_ISSUER,
  issuerProfileSchema,
  type IssueInvoiceInput,
  type IssuerProfile,
} from './invoice-issue-schema'

/**
 * Vystavení faktury v adminu (AD12).
 *
 * Doklad vzniká funkcí `admin_invoice_issue` (migrace 107): číslo z řady
 * a řádek faktury v jedné transakci, pod zámkem jediného řádku nastavení.
 * Aplikace číslo nikdy nepočítá — kontrola v kódu by byla TOCTOU, přesně
 * jak to repo už jednou zažilo (migrace 046).
 *
 * **Vystavení nezakládá příjem.** Daňová evidence jede na hotovostním
 * principu (R-011): do ledgeru fakturu zapíše až `syncInvoiceTransaction`
 * ve chvíli, kdy dostane `paid_on`. Archiv cizích PDF se tím nemění.
 */

export type IssuerSettings = { profile: IssuerProfile; configured: boolean }

/**
 * Je v databázi migrace 107?
 *
 * Migrace pouští Kryštof, a může to být až po nasazení větve — stejná situace
 * jako u 105 v AD10. Dotazy na nové sloupce proto nejdou „naslepo": dokud
 * 107 nedoběhne, chová se admin přesně jako dřív (archiv cizích PDF) a jen
 * neukazuje vystavování. Výsledek se drží v paměti procesu, takže je to
 * jeden dotaz na studený start.
 */
let issuingReady: boolean | null = null

export async function isIssuingReady(): Promise<boolean> {
  if (issuingReady !== null) return issuingReady
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'number_seq'
        LIMIT 1
      `,
      params: [],
    },
  ])
  issuingReady = rows.length > 0
  return issuingReady
}

/** Jen pro testy — po doběhnutí migrace v testovací DB se zjištění musí zahodit. */
export function resetIssuingReadyForTests(): void {
  issuingReady = null
}

export async function loadIssuerProfile(): Promise<IssuerSettings> {
  if (!(await isIssuingReady())) return { profile: EMPTY_ISSUER, configured: false }
  const [rows] = await adminDb.batch([
    { text: `SELECT issuer_profile FROM admin_settings WHERE id = true LIMIT 1`, params: [] },
  ])
  const raw = (rows[0] as { issuer_profile: unknown } | undefined)?.issuer_profile
  const parsed = issuerProfileSchema.safeParse(raw)
  return parsed.success ? { profile: parsed.data, configured: true } : { profile: EMPTY_ISSUER, configured: false }
}

export async function saveIssuerProfile(profile: IssuerProfile): Promise<void> {
  await sql`
    INSERT INTO admin_settings (id, issuer_profile, updated_at)
    VALUES (true, ${JSON.stringify(profile)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET issuer_profile = EXCLUDED.issuer_profile, updated_at = now()
  `
}

/** Chyby, které databáze hlásí vlastním jménem — ať je uživatel pozná česky. */
export function issueErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('admin_invoice_sequence_full')) {
    return 'Řada faktur pro letošek je plná (999 faktur). Napište mi, založím další řadu.'
  }
  if (message.includes('admin_invoice_amount_mismatch')) {
    return 'Částka nesedí na položky. Zkontrolujte počty a ceny.'
  }
  if (message.includes('admin_invoice_locked')) {
    return 'Vystavenou fakturu už nejde měnit. Udělejte storno a vystavte novou.'
  }
  if (message.includes('admin_invoice_items')) return 'Faktura musí mít aspoň jednu položku, nejvíc padesát.'
  if ((err as { code?: string })?.code === '23505') return 'Tohle číslo faktury už v evidenci je.'
  return 'Fakturu se nepodařilo vystavit. Zkuste to prosím znovu.'
}

export type IssueResult = { id: string; number: string }

/**
 * Vystaví fakturu a vrátí její číslo. Profil dodavatele se na doklad uloží
 * jako **snímek** — pozdější změna profilu starší faktury nepřepíše.
 */
export async function issueInvoice(input: IssueInvoiceInput, issuer: IssuerProfile, plan: KindPlan | null = null): Promise<IssueResult> {
  const payload = issuePayload(input, issuer, plan)

  // Dva příkazy schválně: řádek vložený funkcí ještě není vidět ve snímku
  // téhož dotazu, takže `JOIN invoices` by vrátil prázdno.
  const issued = await sql`SELECT admin_invoice_issue(${JSON.stringify(payload)}::jsonb)::text AS id`
  const id = (issued[0] as { id: string } | undefined)?.id
  if (!id) throw new Error('admin_invoice_missing')

  const rows = await sql`SELECT invoice_number FROM invoices WHERE id = ${id} LIMIT 1`
  const number = (rows[0] as { invoice_number: string } | undefined)?.invoice_number
  if (!number) throw new Error('admin_invoice_missing')
  return { id, number }
}

/**
 * Oprava vystavené faktury (R-148): nová faktura a storno té staré **jedním
 * příkazem**. Datově měnící CTE stornuje starou, jen když je pořád platná
 * a nezaplacená; teprve pro ten jeden řádek se zavolá `admin_invoice_issue`.
 * Když starou mezitím někdo zaplatil nebo stornoval, nevznikne nic — žádná
 * nová faktura vedle platné staré, ani storno bez náhrady. Když neprojde
 * nová (částka, položky), padá celý příkaz a stará zůstane, jak byla.
 *
 * Zaplacení se neopravuje: zaplacená faktura je v ledgeru jako příjem a ten
 * by storno vrátilo. Tu opraví storno a nová faktura ručně, jako dřív.
 */
export async function issueCorrection(
  replacesId: string,
  input: IssueInvoiceInput,
  issuer: IssuerProfile,
  plan: KindPlan | null = null,
): Promise<IssueResult | null> {
  const payload = issuePayload(input, issuer, plan)
  const issued = await sql`
    WITH old AS (
      UPDATE invoices SET cancelled_at = now()
      WHERE id = ${replacesId}
        AND number_seq IS NOT NULL
        AND cancelled_at IS NULL
        AND paid_on IS NULL
      RETURNING id
    )
    SELECT admin_invoice_issue(${JSON.stringify(payload)}::jsonb)::text AS id FROM old
  `
  const id = (issued[0] as { id: string } | undefined)?.id
  if (!id) return null

  const rows = await sql`SELECT invoice_number FROM invoices WHERE id = ${id} LIMIT 1`
  const number = (rows[0] as { invoice_number: string } | undefined)?.invoice_number
  if (!number) throw new Error('admin_invoice_missing')
  return { id, number }
}

/** Co z opravované faktury jde do formuláře (R-148). */
export type CorrectionSource = {
  id: string
  number: string
  projectId: string | null
  counterparty: IssueDraft['counterparty']
  email: string
  suppliedOn: string | null
  dueOn: string | null
  currency: string
  note: string
  items: { description: string; quantity: number; unitPrice: number; vatRate?: 0 | 12 | 21 }[]
  kind: string | null
  percent: number | null
}

export type CorrectionLookup =
  | { ok: true; source: CorrectionSource }
  | { ok: false; reason: 'missing' | 'cancelled' | 'paid' }

/**
 * Opravit jde jen fakturu vystavenou tady, platnou a nezaplacenou — stejná
 * podmínka, jakou pak hlídá `issueCorrection` v databázi.
 */
export async function loadCorrectionSource(id: string): Promise<CorrectionLookup> {
  if (!(await isIssuingReady())) return { ok: false, reason: 'missing' }
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT i.id::text, i.invoice_number, i.project_id::text AS project_id,
               i.client_name, i.client_ico, i.client_dic, i.client_address,
               to_jsonb(i)->>'client_email' AS client_email,
               to_jsonb(i)->'client_contact' AS client_contact,
               i.supplied_on::text, i.due_on::text, i.currency, i.note, i.items,
               i.paid_on IS NOT NULL AS paid, i.cancelled_at IS NOT NULL AS cancelled,
               to_jsonb(i)->>'invoice_kind' AS invoice_kind,
               (to_jsonb(i)->>'share_percent')::float AS share_percent
        FROM invoices i
        WHERE i.id = $1 AND i.number_seq IS NOT NULL
        LIMIT 1
      `,
      params: [id],
    },
  ])
  const row = rows[0] as
    | {
        id: string
        invoice_number: string
        project_id: string | null
        client_name: string | null
        client_ico: string | null
        client_dic: string | null
        client_address: string | null
        client_email: string | null
        client_contact: PrintedContact | null
        supplied_on: string | null
        due_on: string | null
        currency: string
        note: string | null
        items: CorrectionSource['items'] | null
        paid: boolean
        cancelled: boolean
        invoice_kind: string | null
        share_percent: number | null
      }
    | undefined
  if (!row) return { ok: false, reason: 'missing' }
  if (row.cancelled) return { ok: false, reason: 'cancelled' }
  if (row.paid) return { ok: false, reason: 'paid' }
  return {
    ok: true,
    source: {
      id: row.id,
      number: row.invoice_number,
      projectId: row.project_id,
      counterparty: {
        name: row.client_name ?? '',
        address: row.client_address ?? '',
        ico: row.client_ico ?? '',
        dic: row.client_dic ?? '',
        phone: clean(row.client_contact?.phone),
      },
      email: clean(row.client_contact?.email) || clean(row.client_email),
      suppliedOn: row.supplied_on,
      dueOn: row.due_on,
      currency: row.currency,
      note: row.note ?? '',
      items: (row.items ?? []).map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        ...(item.vatRate === 0 || item.vatRate === 12 || item.vatRate === 21 ? { vatRate: item.vatRate } : {}),
      })),
      kind: row.invoice_kind,
      percent: row.share_percent,
    },
  }
}

/**
 * Tvar, kterému rozumí `admin_invoice_issue` (migrace 107). Samostatně proto,
 * že koncept faktury (R-117) vystavuje uvnitř jiného příkazu — koncept se
 * označí jako vystavený **v téže transakci**, ve které doklad vznikne.
 */
export function issuePayload(input: IssueInvoiceInput, issuer: IssuerProfile, plan: KindPlan | null = null): Record<string, unknown> {
  return {
    // Druh, procento a rozpis (R-143, migrace 132). Bez plánu se nic nepošle
    // a databáze bez migrace 132 nové klíče stejně ignoruje.
    ...(plan
      ? { invoice_kind: plan.kind, share_percent: plan.percent, settlement: plan.settlement }
      : {}),
    project_id: input.projectId,
    client_name: input.counterparty.name,
    client_ico: input.counterparty.ico,
    client_dic: input.counterparty.dic,
    client_address: input.counterparty.address,
    // Vytištěný kontakt odběratele (R-153, migrace 140). Databáze bez 140 klíč ignoruje.
    client_contact: { email: input.counterparty.email ?? '', phone: input.counterparty.phone ?? '' },
    issued_on: input.issuedOn,
    supplied_on: input.suppliedOn,
    due_on: input.dueOn,
    currency: input.currency,
    note: input.note,
    amount: invoiceTotal(input.items),
    items: input.items,
    issuer,
  }
}

export type PreparedIssue = { ok: true; input: IssueInvoiceInput; plan: KindPlan | null } | { ok: false; error: string }

/**
 * Druh faktury → co se opravdu vystaví (R-143). Částku zálohové, částečné
 * a finální faktury počítá server z ceny zakázky a z toho, co je už
 * vyfakturované — položku z formuláře si nechá jen kvůli popisu.
 *
 * Bez migrace 132 jde vystavit jen faktura za celé dílo, a to jako dřív
 * (druh se neuloží). Jinak by zálohová faktura vyšla jako obyčejná.
 */
export async function prepareKindIssue(
  input: IssueInvoiceInput,
  kind: IssueKindInput,
  issuer: IssuerProfile,
  /** Opravovaná faktura (R-148): do rozpisu zakázky se už nepočítá. */
  replacesId: string | null = null,
): Promise<PreparedIssue> {
  const ready = await isKindsReady()
  if (!ready && kind.kind !== 'single') {
    return { ok: false, error: 'Zálohové, částečné a finální faktury se zapnou po spuštění migrace 132.' }
  }

  const billing = input.projectId ? await loadProjectBilling(input.projectId, replacesId) : null
  if (input.projectId && !billing) return { ok: false, error: 'Zakázka nenalezena.' }

  const resolved = resolveKindPlan(kind.kind, kind.percent, billing)
  if (!resolved.ok) return resolved
  const plan = resolved.plan
  if (plan.kind === 'single' || plan.amount === null || !billing) {
    return { ok: true, input, plan: ready ? plan : null }
  }

  if (input.currency !== 'CZK') {
    return { ok: false, error: 'Zálohová, částečná i finální faktura je v korunách, stejně jako cena zakázky.' }
  }

  const first = input.items[0]
  const vatRate = issuer.vatPayer ? (first?.vatRate ?? 21) : 0
  // U plátce je částka z procenta i s DPH — základ se dopočítá zpátky.
  const unitPrice = vatRate > 0 ? round2(plan.amount / (1 + vatRate / 100)) : plan.amount
  const items = [{
    description: first?.description.trim() || kindItemDescription(plan.kind, billing.description, plan.percent),
    quantity: 1,
    unitPrice,
    vatRate,
  }]
  const total = invoiceTotal(items)
  const settlement: Settlement | null = plan.settlement
    ? { ...plan.settlement, thisAmount: total, remainingAfter: round2(Math.max(0, plan.settlement.remainingAfter + plan.amount - total)) }
    : null

  return { ok: true, input: { ...input, items }, plan: { ...plan, amount: total, settlement } }
}

/**
 * Storno. Vystavený doklad se nepřepisuje (trigger v migraci 107), takže
 * oprava znamená zrušit tenhle a vystavit nový. Zaplacení se přitom vrací
 * zpět, aby stornovaná faktura nezůstala v ledgeru jako příjem.
 */
/** Storno dokladu. Dotaz, ne provedení — jde do jedné dávky se srovnáním ledgeru (AD13). */
export function cancelInvoiceQuery(id: string): AdminQuery {
  return {
    text: `UPDATE invoices SET paid_on = NULL, cancelled_at = now() WHERE id = $1 AND number_seq IS NOT NULL`,
    params: [id],
  }
}

export async function cancelInvoice(id: string): Promise<void> {
  await adminDb.batch([cancelInvoiceQuery(id)])
}

// ─── Předvyplnění ────────────────────────────────────────────────────────────

/**
 * Kořen kontaktu zakázky. Sloučený kontakt (AD09) ukazuje na toho, do koho byl
 * sloučen; řetěz je vždy plochý (R-095), takže stačí jeden skok. Funkce
 * `contacts_root` se schválně nepoužívá — předvyplnění má fungovat i na
 * databázi, kde migrace 104 teprve čeká.
 */
const CONTACT_ROOT = `coalesce((SELECT cc.merged_into FROM contacts cc WHERE cc.id = p.contact_id), p.contact_id)`

export type IssueDraft = {
  issuedOn: string
  suppliedOn: string
  dueOn: string
  /** Odběratel; telefon se tiskne na fakturu (R-153). */
  counterparty: { name: string; address: string; ico: string; dic: string; phone: string }
  /** Kam fakturu poslat: e-mail ze zakázky (R-117). Prázdné = zeptat se. */
  email: string
  /** Cena ze zakázky mínus zaplacená záloha; 0 = nic k předvyplnění. */
  amount: number
  projectId: string | null
  projectLabel: string | null
  /**
   * Co se u tohohle klienta obvykle fakturuje (AD15). Popis bere z poslední
   * vystavené faktury téhož kontaktu — spočítaný z historie, ne napsaný
   * modelem (R-085). Prázdné pole = fakturuje se mu poprvé.
   */
  items: { description: string; quantity: number; unitPrice: number; vatRate?: 0 | 12 | 21 }[]
  /** Cena zakázky, co je zaplacené a vyfakturované (R-143). Bez zakázky null. */
  billing: ProjectBilling | null
  /** Odkud jsou údaje odběratele (R-153). Bez zakázky null. */
  sources: PrefillSources | null
}

/**
 * Položky k předvyplnění. Když zakázka zná částku, je to jedna položka
 * s popisem z minula; bez částky se nabídnou celé položky z poslední
 * faktury. Všechno jde ve formuláři přepsat — je to nápověda, ne doklad.
 */
function suggestItems(facts: AdminFacts, amount: number): IssueDraft['items'] {
  const previous = facts.lastInvoiceItems
  if (amount > 0) {
    const description = previous[0]?.description ?? ''
    return description === '' ? [] : [{ description, quantity: 1, unitPrice: amount }]
  }
  return previous.slice(0, 5)
}

/**
 * Co jde vyplnit za uživatele: datum, splatnost +14 dní, odběratel a částka
 * ze zakázky po odečtení zálohy. Nic z toho není závazné — všechno jde ve
 * formuláři přepsat.
 *
 * Odběratel (R-153), u každého údaje první, který je k dispozici:
 * - jméno: poslední faktura klienta → rejstřík firem → firma u kontaktu
 *   → firma u zakázky → jméno ze zakázky,
 * - sídlo: poslední faktura → kontakt → rejstřík firem podle IČO,
 * - IČO a DIČ: poslední faktura → kontakt → (DIČ) rejstřík,
 * - e-mail: poslední faktura → zakázka → kontakt,
 * - telefon: poslední faktura → zakázka → kontakt.
 *
 * Rejstřík (`registry`) se ptá jen formulář — koncepty z cronu a asistent
 * do sítě nesahají. Nedostupný rejstřík nic neblokuje, pole zůstanou prázdná.
 * Volitelné sloupce se čtou přes `to_jsonb`, ať to běží i na databázi bez
 * migrací 104, 106, 117 a 140.
 */
export async function loadIssueDraft(
  projectId: string | null,
  options: { registry?: boolean; excludeInvoiceId?: string | null } = {},
): Promise<IssueDraft> {
  const today = getPragueTodayISO()
  const draft: IssueDraft = {
    issuedOn: today,
    suppliedOn: today,
    dueOn: addIsoDays(today, DEFAULT_DUE_DAYS),
    counterparty: { name: '', address: '', ico: '', dic: '', phone: '' },
    email: '',
    amount: 0,
    projectId,
    projectLabel: null,
    items: [],
    billing: null,
    sources: null,
  }
  if (!projectId) return draft

  const [projectRows, invoiceRows] = await adminDb.batch([
    {
      text: `
        SELECT p.client_name, p.client_email, p.description, p.price::float AS price,
               p.deposit_amount::float AS deposit_amount, p.deposit_paid, p.paid,
               ${extraDepositsSql('p')}::float AS extra_deposits,
               ${invoicePaymentsSql('p')}::float AS invoice_payments,
               to_jsonb(p) ->> 'company' AS project_company,
               to_jsonb(p) ->> 'client_phone' AS client_phone,
               c.ico AS contact_ico, c.dic AS contact_dic, c.company AS contact_company,
               to_jsonb(c) ->> 'email' AS contact_email,
               to_jsonb(c) ->> 'phone' AS contact_phone,
               to_jsonb(c) ->> 'address' AS contact_address
        FROM projects p
        LEFT JOIN contacts c ON c.id = ${CONTACT_ROOT}
        WHERE p.id = $1
        LIMIT 1
      `,
      params: [projectId],
    },
    {
      // Poslední doklad téhož kontaktu: odběratele stačí opsat jednou.
      // Stornovaný se nebere — bývá to právě ten s chybou.
      text: `
        SELECT i.client_name, i.client_ico, i.client_dic, i.client_address,
               to_jsonb(i) ->> 'client_email' AS client_email,
               to_jsonb(i) -> 'client_contact' AS client_contact
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE coalesce(${CONTACT_ROOT}, p.id) = (
                SELECT coalesce(${CONTACT_ROOT}, p.id) FROM projects p WHERE p.id = $1
              )
          AND i.client_name IS NOT NULL
          AND i.cancelled_at IS NULL
        ORDER BY i.issued_on DESC, i.created_at DESC
        LIMIT 1
      `,
      params: [projectId],
    },
  ])

  const project = projectRows[0] as
    | {
        client_name: string
        client_email: string | null
        description: string | null
        price: number | null
        deposit_amount: number | null
        deposit_paid: boolean
        paid: boolean | null
        extra_deposits: number | null
        invoice_payments: number | null
        project_company: string | null
        contact_ico: string | null
        contact_dic: string | null
        contact_company: string | null
        contact_email: string | null
        client_phone: string | null
        contact_phone: string | null
        contact_address: string | null
      }
    | undefined
  if (!project) return draft

  const last = invoiceRows[0] as
    | {
        client_name: string | null
        client_ico: string | null
        client_dic: string | null
        client_address: string | null
        client_email: string | null
        client_contact: PrintedContact | null
      }
    | undefined

  // Doplatek: cena − vlastní záloha − zálohy zapsané z Podnikání (R-110)
  // − už zaplacené faktury (R-125), ať druhá faktura nenabízí celou cenu znovu.
  draft.amount = remainingToPay({
    price: project.price,
    depositAmount: project.deposit_amount,
    depositPaid: project.deposit_paid,
    extraDeposits: Number(project.extra_deposits ?? 0),
    invoicePayments: Number(project.invoice_payments ?? 0),
    paid: project.paid === true,
  })
  draft.email =
    clean(last?.client_contact?.email) || clean(last?.client_email) || clean(project.client_email) || clean(project.contact_email)
  draft.projectLabel = project.description ? `${project.client_name} — ${project.description}` : project.client_name

  const counterparty = {
    name: clean(last?.client_name),
    address: clean(last?.client_address) || clean(project.contact_address),
    ico: clean(last?.client_ico) || clean(project.contact_ico),
    dic: clean(last?.client_dic) || clean(project.contact_dic),
    phone: clean(last?.client_contact?.phone) || clean(project.client_phone) || clean(project.contact_phone),
  }
  const sources: PrefillSources = { lastInvoice: last !== undefined, registry: false }

  // Sídlo podle IČO z rejstříku. Jméno z rejstříku je právní jméno, které na
  // fakturu patří; přednost má jen jméno z minulé faktury.
  if (options.registry && counterparty.address === '' && isValidIco(counterparty.ico)) {
    const found = await lookupIco(counterparty.ico)
    if (found.status === 'ok') {
      counterparty.address = found.subject.address
      counterparty.name ||= found.subject.name
      counterparty.dic ||= found.subject.dic
      sources.registry = found.subject.address !== ''
    }
  }
  counterparty.name ||= clean(project.contact_company) || clean(project.project_company) || project.client_name
  draft.counterparty = counterparty
  draft.sources = sources

  // Popis položky dřív nikdo nepředvyplňoval, takže se u stálého klienta
  // opisoval pokaždé znovu (zjištěno při průchodu AD12). Fakta vědí, co se
  // mu fakturovalo naposledy.
  const [facts, billing] = await Promise.all([
    contactOfProject(projectId).then(loadFacts),
    loadProjectBilling(projectId, options.excludeInvoiceId ?? null),
  ])
  draft.items = suggestItems(facts, draft.amount)
  draft.billing = billing
  return draft
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/** E-mail a telefon odběratele vytištěné na faktuře (migrace 140). */
type PrintedContact = { email?: string; phone?: string }

/**
 * Kontakt zakázky po vystavení faktury (R-153): údaje z faktury se zapíšou
 * do kontaktu a odtud propíšou dál. Pravidla drží `absorbBillingIntoContact`.
 * Bez kontaktu (zakázka ho nemá) se nic neděje.
 */
export async function rememberCounterpartyOnContact(
  projectId: string,
  issued: Partial<BillingValues>,
  prefilled: Partial<BillingValues> | null = null,
): Promise<void> {
  const [rows] = await adminDb.batch([
    { text: `SELECT ${CONTACT_ROOT}::text AS id FROM projects p WHERE p.id = $1`, params: [projectId] },
  ])
  const contactId = rows[0]?.id
  if (typeof contactId !== 'string' || contactId === '') return
  await absorbBillingIntoContact(contactId, issued, prefilled)
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export type IssuedInvoiceForPdf = { invoice: PdfInvoice; filename: string }

/**
 * Faktura vystavená v adminu ve tvaru, kterému rozumí sdílený renderer.
 * Archiv (`number_seq IS NULL`) tudy nechodí — ten má vlastní nahrané PDF.
 */
export async function loadIssuedInvoiceForPdf(id: string): Promise<IssuedInvoiceForPdf | null> {
  if (!(await isIssuingReady())) return null
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT invoice_number, client_name, client_ico, client_dic, client_address,
               to_jsonb(i)->'client_contact' AS client_contact,
               issued_on::text, supplied_on::text, due_on::text, paid_on::text,
               cancelled_at, amount::float AS amount, currency, items, issuer, note,
               to_jsonb(i)->>'invoice_kind' AS invoice_kind,
               (to_jsonb(i)->>'share_percent')::float AS share_percent,
               to_jsonb(i)->'settlement' AS settlement
        FROM invoices i
        WHERE id = $1 AND number_seq IS NOT NULL
        LIMIT 1
      `,
      params: [id],
    },
  ])

  const row = rows[0] as
    | {
        invoice_number: string
        client_name: string | null
        client_ico: string | null
        client_dic: string | null
        client_address: string | null
        client_contact: PrintedContact | null
        issued_on: string
        supplied_on: string | null
        due_on: string | null
        paid_on: string | null
        cancelled_at: string | null
        amount: number
        currency: string
        items: PdfInvoice['items']
        issuer: IssuerProfile
        note: string | null
        invoice_kind: string | null
        share_percent: number | null
        settlement: Settlement | null
      }
    | undefined
  if (!row) return null

  const document: PdfDocument | null = isInvoiceKind(row.invoice_kind)
    ? { kind: row.invoice_kind, percent: row.share_percent, settlement: row.settlement ?? null }
    : null

  const invoice: PdfInvoice = {
    number: row.invoice_number,
    issuer: {
      name: row.issuer.name,
      address: row.issuer.address,
      ico: row.issuer.ico,
      dic: row.issuer.dic,
      bank: row.issuer.bank,
      vatPayer: row.issuer.vatPayer,
      // Snímky před R-142 tyhle údaje nemají — pak se na faktuře netisknou.
      tradeName: row.issuer.tradeName ?? null,
      registry: row.issuer.registry ?? null,
      email: row.issuer.email ?? null,
      phone: row.issuer.phone ?? null,
      web: row.issuer.web ?? null,
    },
    counterparty: {
      name: row.client_name ?? '',
      address: row.client_address ?? '',
      ico: row.client_ico,
      dic: row.client_dic,
      email: clean(row.client_contact?.email) || null,
      phone: clean(row.client_contact?.phone) || null,
    },
    issuedOn: row.issued_on,
    suppliedOn: row.supplied_on ?? row.issued_on,
    dueOn: row.due_on ?? row.issued_on,
    paidOn: row.paid_on,
    amount: row.amount,
    currency: row.currency === 'EUR' ? 'EUR' : 'CZK',
    items: row.items ?? [],
    note: row.note ?? '',
    payable: row.paid_on === null && row.cancelled_at === null,
    cancelled: row.cancelled_at !== null,
    document,
  }

  return { invoice, filename: `faktura-${row.invoice_number}.pdf` }
}
