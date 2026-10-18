import 'server-only'
import type { WsContext } from './context'
import { q, wsDb, wsSystem, type WsRow } from './db'
import { toCsv, type CsvValue } from './csv'
import { createZip, type ZipEntry } from './zip'

// GDPR Workspace (S18, R-054): výmaz zákazníka, export všech dat účtu,
// zrušení účtu s 30denní lhůtou a denní úklid. Pravidla výmazu jsou
// v migraci 084 (jedna transakce v DB), tady jen volání a export.

// --- Výmaz zákazníka ------------------------------------------------------------

export type ErasedCounts = { requests: number; appointments: number; jobs: number; invoicesKept: number; draftsDeleted: number }

/** null = zákazník v účtu není. */
export async function eraseCustomer(ctx: WsContext, customerId: string): Promise<ErasedCounts | null> {
  const [row] = await wsDb(ctx)`SELECT ws.erase_customer(${ctx.accountId}, ${customerId}::uuid, ${ctx.userId}) AS r`
  const r = row?.r as Record<string, number> | null
  if (!r) return null
  return {
    requests: Number(r.requests),
    appointments: Number(r.appointments),
    jobs: Number(r.jobs),
    invoicesKept: Number(r.invoices_kept),
    draftsDeleted: Number(r.drafts_deleted),
  }
}

// --- Zrušení účtu -----------------------------------------------------------------

export const ACCOUNT_DELETE_DAYS = 30

export type AccountClosing = { requestedAt: Date; deleteAfter: Date } | null

export async function getAccountClosing(scope: { accountId: string }): Promise<AccountClosing> {
  const [r] = await wsDb(scope)<{ closing_requested_at: Date | null; delete_after: Date | null }>`
    SELECT closing_requested_at, delete_after FROM ws.accounts WHERE id = ${scope.accountId}`
  return r?.closing_requested_at && r.delete_after
    ? { requestedAt: new Date(r.closing_requested_at), deleteAfter: new Date(r.delete_after) }
    : null
}

/** Nastaví výmaz za 30 dní a archivuje byznysy. Předplatné ruší volající dřív (Stripe). */
export async function closeAccount(ctx: WsContext): Promise<Date | null> {
  const [row] = await wsDb(ctx)`SELECT ws.close_account(${ctx.accountId}, ${ctx.userId}) AS d`
  return row?.d ? new Date(row.d as string) : null
}

export async function reopenAccount(ctx: WsContext): Promise<boolean> {
  const [row] = await wsDb(ctx)`SELECT ws.reopen_account(${ctx.accountId}, ${ctx.userId}) AS ok`
  return Boolean(row?.ok)
}

/** Předplatná, která ještě můžou něco naúčtovat (zrušit před zavřením účtu). */
export async function liveSubscriptionIds(scope: { accountId: string }): Promise<string[]> {
  const rows = await wsDb(scope)<{ id: string }>`
    SELECT stripe_subscription_id AS id FROM ws.subscriptions
    WHERE account_id = ${scope.accountId} AND status IN ('trialing', 'active', 'past_due', 'unpaid', 'paused', 'incomplete')`
  return rows.map((r) => r.id)
}

// --- Denní úklid ------------------------------------------------------------------

export type GdprRun = { invoicesAnonymized: number; accountsDeleted: number; orgsFailed: number }

/**
 * Faktury po zákonné lhůtě a účty po 30 dnech. Organizaci v Clerku maže
 * `deleteOrg` (předává cron); její chyba výmaz dat nezastaví, jen se zapíše.
 */
export async function runDailyGdpr(deleteOrg: (orgId: string) => Promise<void>): Promise<GdprRun> {
  const [inv] = await wsSystem<{ n: number }>`SELECT ws.anonymize_expired_invoices() AS n`
  const purged = await wsSystem<{ account_id: string; clerk_org_id: string }>`SELECT account_id, clerk_org_id FROM ws.purge_closed_accounts()`
  let orgsFailed = 0
  for (const p of purged) {
    try {
      await deleteOrg(p.clerk_org_id)
    } catch (e) {
      orgsFailed++
      console.error('cron.ws-gdpr: organizaci se nepodařilo smazat', { accountId: p.account_id, error: e instanceof Error ? e.message : 'unknown' })
    }
  }
  return { invoicesAnonymized: Number(inv?.n ?? 0), accountsDeleted: purged.length, orgsFailed }
}

// --- Export -----------------------------------------------------------------------

type Sheet = { file: string; header: string[]; query: ReturnType<typeof q>; row: (r: WsRow) => CsvValue[] }

const v = (r: WsRow, k: string): CsvValue => r[k] as CsvValue

function sheets(a: string): Sheet[] {
  const biz = (alias: string) => `(SELECT slug FROM ws.businesses b WHERE b.account_id = ${alias}.account_id AND b.id = ${alias}.business_id)`
  return [
    {
      file: 'ucet.csv',
      header: ['nazev', 'ico', 'zalozeno'],
      query: q`SELECT name, ico, created_at FROM ws.accounts WHERE id = ${a}`,
      row: (r) => [v(r, 'name'), v(r, 'ico'), v(r, 'created_at')],
    },
    {
      file: 'clenove.csv',
      header: ['jmeno', 'email', 'role', 'pridan'],
      query: q`SELECT name, email, role, created_at FROM ws.members WHERE account_id = ${a} ORDER BY created_at`,
      row: (r) => [v(r, 'name'), v(r, 'email'), v(r, 'role') === 'owner' ? 'vlastník' : 'pracovník', v(r, 'created_at')],
    },
    {
      file: 'byznysy.csv',
      header: ['id', 'nazev', 'adresa_v_aplikaci', 'obor', 'barva', 'nastaveni', 'zalozeno'],
      query: q`SELECT id, name, slug, industry, color, settings, created_at FROM ws.businesses WHERE account_id = ${a} ORDER BY created_at`,
      row: (r) => [v(r, 'id'), v(r, 'name'), v(r, 'slug'), v(r, 'industry'), v(r, 'color'), v(r, 'settings'), v(r, 'created_at')],
    },
    {
      file: 'sluzby.csv',
      header: ['byznys', 'nazev', 'delka_min', 'cena', 'mena', 'aktivni', 'na_webu'],
      query: { text: `SELECT ${biz('s')} AS biz, name, duration_min, price, currency, active, show_on_web FROM ws.services s WHERE account_id = $1 ORDER BY biz, position`, params: [a] },
      row: (r) => [v(r, 'biz'), v(r, 'name'), v(r, 'duration_min'), v(r, 'price'), v(r, 'currency'), v(r, 'active'), v(r, 'show_on_web')],
    },
    {
      file: 'pracovnici.csv',
      header: ['byznys', 'jmeno', 'aktivni'],
      query: { text: `SELECT ${biz('s')} AS biz, name, active FROM ws.staff s WHERE account_id = $1 ORDER BY biz, position`, params: [a] },
      row: (r) => [v(r, 'biz'), v(r, 'name'), v(r, 'active')],
    },
    {
      file: 'zakaznici.csv',
      header: ['id', 'jmeno', 'telefon', 'email', 'narozeniny', 'poznamka', 'souhlas_s_nabidkami', 'odhlaseno', 'ukonceno', 'duvod_ukonceni', 'zalozeno'],
      query: q`SELECT id, name, phone, email, birthday::text, note, contact_consent_at, unsubscribed_at, ended_at, ended_reason, created_at
        FROM ws.customers WHERE account_id = ${a} ORDER BY created_at`,
      row: (r) => ['id', 'name', 'phone', 'email', 'birthday', 'note', 'contact_consent_at', 'unsubscribed_at', 'ended_at', 'ended_reason', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'zpravy-zakazniku.csv',
      header: ['id', 'byznys', 'zakaznik_id', 'typ', 'email', 'predmet', 'stav', 'odeslano', 'vytvoreno'],
      query: q`SELECT m.id, ${biz('m')} AS biz, m.customer_id, m.type, m.to_address, m.subject, m.status, m.sent_at, m.created_at
        FROM ws.outbound_messages m
        WHERE m.account_id = ${a} AND m.type IN ('customer_thanks', 'customer_booking', 'customer_offer', 'customer_job', 'customer_custom')
        ORDER BY m.created_at`,
      row: (r) => ['id', 'biz', 'customer_id', 'type', 'to_address', 'subject', 'status', 'sent_at', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'poptavky.csv',
      header: ['id', 'byznys', 'prijato', 'stav', 'zdroj', 'zakaznik_id', 'lekce_id', 'jmeno', 'telefon', 'email', 'sluzba', 'chteny_zacatek', 'chteny_konec', 'zprava', 'kolonky', 'zkusebni'],
      query: {
        text: `SELECT r.id, ${biz('r')} AS biz, r.created_at, r.status, r.source, r.customer_id, r.session_id, r.contact,
          COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY rs.position)
            FROM ws.request_services rs JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
            WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.name) AS service,
          r.wanted_start, r.wanted_end, r.message, r.field_values, r.is_test
          FROM ws.requests r LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
          WHERE r.account_id = $1 ORDER BY r.created_at`,
        params: [a],
      },
      row: (r) => {
        const c = (r.contact ?? {}) as Record<string, unknown>
        return [v(r, 'id'), v(r, 'biz'), v(r, 'created_at'), v(r, 'status'), v(r, 'source'), v(r, 'customer_id'), v(r, 'session_id'),
          c.name as CsvValue, c.phone as CsvValue, c.email as CsvValue, v(r, 'service'), v(r, 'wanted_start'), v(r, 'wanted_end'),
          v(r, 'message'), v(r, 'field_values'), v(r, 'is_test')]
      },
    },
    {
      file: 'lekce.csv',
      header: ['id', 'byznys', 'termin_id', 'sluzba_id', 'kapacita', 'obsazeno', 'stav', 'vytvoreno'],
      query: { text: `SELECT se.id, ${biz('se')} AS biz, se.appointment_id, se.service_id, se.capacity, se.reserved, se.status, se.created_at
        FROM ws.sessions se WHERE se.account_id = $1 ORDER BY se.created_at`, params: [a] },
      row: (r) => ['id', 'biz', 'appointment_id', 'service_id', 'capacity', 'reserved', 'status', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'ucastnici-lekci.csv',
      header: ['id', 'byznys', 'lekce_id', 'poptavka_id', 'zakaznik_id', 'stav', 'prihlasen'],
      query: { text: `SELECT sa.id, ${biz('sa')} AS biz, sa.session_id, sa.request_id, sa.customer_id, sa.status, sa.created_at
        FROM ws.session_attendees sa WHERE sa.account_id = $1 ORDER BY sa.created_at`, params: [a] },
      row: (r) => ['id', 'biz', 'session_id', 'request_id', 'customer_id', 'status', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'terminy.csv',
      header: ['id', 'byznys', 'druh', 'zacatek', 'konec', 'stav', 'pracovnik', 'zakaznik_id', 'zakaznik', 'sluzba', 'nazev', 'poznamka', 'zakazka_id'],
      query: {
        text: `SELECT a.id, ${biz('a')} AS biz, a.kind, a.starts_at, a.ends_at, a.status, st.name AS staff, a.customer_id, c.name AS customer,
          s.name AS service, a.title, a.note, a.job_id
          FROM ws.appointments a
          LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
          LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
          LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
          WHERE a.account_id = $1 ORDER BY a.starts_at`,
        params: [a],
      },
      row: (r) => [v(r, 'id'), v(r, 'biz'), v(r, 'kind') === 'block' ? 'blokace' : 'návštěva', v(r, 'starts_at'), v(r, 'ends_at'), v(r, 'status'),
        v(r, 'staff'), v(r, 'customer_id'), v(r, 'customer'), v(r, 'service'), v(r, 'title'), v(r, 'note'), v(r, 'job_id')],
    },
    {
      file: 'zakazky.csv',
      header: ['id', 'byznys', 'nazev', 'stav', 'zakaznik_id', 'zakaznik', 'cena', 'zaloha', 'mena', 'kolonky', 'uzavreno', 'zalozeno'],
      query: {
        text: `SELECT j.id, ${biz('j')} AS biz, j.title, st.name AS stage, j.customer_id, c.name AS customer, j.price, j.deposit, j.currency,
          j.field_values, j.closed_at, j.created_at
          FROM ws.jobs j
          LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
          LEFT JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
          WHERE j.account_id = $1 ORDER BY j.created_at`,
        params: [a],
      },
      row: (r) => ['id', 'biz', 'title', 'stage', 'customer_id', 'customer', 'price', 'deposit', 'currency', 'field_values', 'closed_at', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'zpravy-zakazek.csv',
      header: ['zakazka_id', 'text', 'smazano', 'napsano'],
      query: q`SELECT job_id, body, deleted_at, created_at FROM ws.job_updates WHERE account_id = ${a} ORDER BY created_at`,
      row: (r) => [v(r, 'job_id'), v(r, 'body'), v(r, 'deleted_at'), v(r, 'created_at')],
    },
    {
      file: 'faktury.csv',
      header: ['cislo', 'byznys', 'druh', 'stav', 'vystaveno', 'plneni', 'splatnost', 'zaplaceno', 'castka', 'mena', 'odberatel_dodavatel', 'adresa', 'ico', 'dic', 'polozky', 'poznamka'],
      query: {
        text: `SELECT i.id, ${biz('i')} AS biz, i.number, i.direction, i.status, i.issued_on::text, i.supplied_on::text, i.due_on::text, i.paid_on::text,
          i.amount, i.currency, i.counterparty, i.items, i.note, i.pdf_data IS NOT NULL AS has_pdf
          FROM ws.invoices i WHERE i.account_id = $1 ORDER BY i.issued_on NULLS LAST, i.created_at`,
        params: [a],
      },
      row: (r) => {
        const p = (r.counterparty ?? {}) as Record<string, unknown>
        return [v(r, 'number'), v(r, 'biz'), v(r, 'direction') === 'issued' ? 'vystavená' : 'přijatá', v(r, 'status'), v(r, 'issued_on'), v(r, 'supplied_on'),
          v(r, 'due_on'), v(r, 'paid_on'), v(r, 'amount'), v(r, 'currency'), p.name as CsvValue, p.address as CsvValue, p.ico as CsvValue, p.dic as CsvValue,
          v(r, 'items'), v(r, 'note')]
      },
    },
    {
      file: 'prijmy-a-vydaje.csv',
      header: ['byznys', 'druh', 'den', 'castka', 'mena', 'kategorie', 'popis', 'zpusob_platby', 'faktura', 'zakaznik_id'],
      query: {
        text: `SELECT ${biz('t')} AS biz, t.kind, t.occurred_on::text, t.amount, t.currency, t.category, t.description, t.payment_method,
          (SELECT number FROM ws.invoices i WHERE i.account_id = t.account_id AND i.id = t.invoice_id) AS invoice, t.customer_id
          FROM ws.transactions t WHERE t.account_id = $1 ORDER BY t.occurred_on, t.created_at`,
        params: [a],
      },
      row: (r) => [v(r, 'biz'), v(r, 'kind') === 'income' ? 'příjem' : 'výdaj', v(r, 'occurred_on'), v(r, 'amount'), v(r, 'currency'), v(r, 'category'),
        v(r, 'description'), v(r, 'payment_method'), v(r, 'invoice'), v(r, 'customer_id')],
    },
    {
      file: 'vernostni-karty.csv',
      header: ['id', 'byznys', 'zakaznik_id', 'zakaznik', 'razitka', 'stav', 'plna', 'vybrano', 'zalozeno'],
      query: {
        text: `SELECT lc.id, ${biz('lc')} AS biz, lc.customer_id, c.name AS customer, lc.stamps, lc.status, lc.full_at, lc.redeemed_at, lc.created_at
          FROM ws.loyalty_cards lc LEFT JOIN ws.customers c ON c.account_id = lc.account_id AND c.id = lc.customer_id
          WHERE lc.account_id = $1 ORDER BY lc.created_at`,
        params: [a],
      },
      row: (r) => ['id', 'biz', 'customer_id', 'customer', 'stamps', 'status', 'full_at', 'redeemed_at', 'created_at'].map((k) => v(r, k)),
    },
    {
      file: 'vernost-pohyby.csv',
      header: ['karta_id', 'druh', 'zmena', 'duvod', 'kdy'],
      query: q`SELECT card_id, kind, delta, reason, created_at FROM ws.loyalty_events WHERE account_id = ${a} ORDER BY created_at`,
      row: (r) => [v(r, 'card_id'), v(r, 'kind'), v(r, 'delta'), v(r, 'reason'), v(r, 'created_at')],
    },
    {
      file: 'hodnoceni.csv',
      header: ['byznys', 'zakaznik_id', 'znamka', 'komentar', 'zakazka_id', 'termin_id', 'kdy'],
      query: { text: `SELECT ${biz('r')} AS biz, customer_id, score, comment, job_id, appointment_id, created_at FROM ws.reviews r WHERE account_id = $1 ORDER BY created_at`, params: [a] },
      row: (r) => ['biz', 'customer_id', 'score', 'comment', 'job_id', 'appointment_id', 'created_at'].map((k) => v(r, k)),
    },
  ]
}

export type ExportOptions = {
  now?: Date
  /** Vykreslí PDF vystavené faktury bez uloženého souboru (Puppeteer). */
  renderPdf?: (invoiceId: string) => Promise<Uint8Array>
  /** Po tomhle čase se další PDF nevykreslují (limit funkce na Vercelu). */
  deadline?: number
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'faktura'

/** ZIP s CSV všech dat účtu a PDF faktur. Jen pro vlastníka (hlídá volající). */
export async function buildAccountExport(ctx: WsContext, opts: ExportOptions = {}): Promise<{ zip: Uint8Array; missingPdf: string[] }> {
  const now = opts.now ?? new Date()
  const list = sheets(ctx.accountId)
  const results = await wsDb(ctx).batch(list.map((s) => s.query))
  const entries: ZipEntry[] = list.map((s, i) => ({ name: s.file, data: toCsv(s.header, results[i].map(s.row)), date: now }))

  // PDF zvlášť po jednom, ať se binárky nenačítají do paměti všechny najednou.
  const invoices = await wsDb(ctx)<{ id: string; number: string | null; direction: string; has_pdf: boolean; status: string }>`
    SELECT id, number, direction, status, pdf_data IS NOT NULL AS has_pdf FROM ws.invoices
    WHERE account_id = ${ctx.accountId} AND (pdf_data IS NOT NULL OR (direction = 'issued' AND status <> 'draft'))
    ORDER BY issued_on NULLS LAST, created_at`
  const missingPdf: string[] = []
  const used = new Set<string>()
  for (const inv of invoices) {
    const label = inv.number || inv.id.slice(0, 8)
    let name = `faktury/${inv.direction === 'issued' ? 'vystavene' : 'prijate'}/${safeName(label)}.pdf`
    for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?\.pdf$/, `-${n}.pdf`)
    let data: Uint8Array | null = null
    if (inv.has_pdf) {
      const [r] = await wsDb(ctx)`SELECT encode(pdf_data, 'base64') AS data FROM ws.invoices WHERE account_id = ${ctx.accountId} AND id = ${inv.id}`
      if (r?.data) data = Buffer.from(String(r.data), 'base64')
    } else if (opts.renderPdf && (!opts.deadline || Date.now() < opts.deadline)) {
      try {
        data = await opts.renderPdf(inv.id)
      } catch (e) {
        console.error('[ws/gdpr] PDF faktury do exportu se nepovedlo', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
      }
    }
    if (data) {
      used.add(name)
      entries.push({ name, data, date: now })
    } else {
      missingPdf.push(label)
    }
  }

  entries.unshift({ name: 'CTI-MNE.txt', data: readme(now, missingPdf), date: now })
  return { zip: createZip(entries), missingPdf }
}

function readme(now: Date, missing: string[]): string {
  const when = now.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })
  const lines = [
    'Export dat z aplikace ZakazIQ',
    `Vytvořeno: ${when}`,
    '',
    'Tabulky (CSV) otevřete v Excelu, Numbers nebo Google Tabulkách.',
    'Oddělovač je středník, kódování UTF-8. Časy jsou v UTC (ISO 8601).',
    'Složka faktury obsahuje PDF vystavených a přijatých faktur.',
  ]
  if (missing.length) {
    lines.push('', 'Tyhle faktury se do exportu nevešly, stáhněte je prosím v aplikaci v části Peníze:', ...missing.map((m) => `- ${m}`))
  }
  return lines.join('\r\n') + '\r\n'
}
