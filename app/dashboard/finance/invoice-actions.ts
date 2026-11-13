'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import {
  parseInvoiceForm, insertInvoice, updateInvoiceRow, deleteInvoiceRow, invoiceSyncQueries,
  invoiceColumns, INCOME_JOIN, OTHER_INCOME_COUNT,
  toInvoiceItem, toInvoiceRegistryItem,
  type InvoiceRow, type InvoiceRegistryRow,
} from '@/lib/invoices'
import { DEFAULT_LEAD_ORIGIN, LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import { getPragueTodayISO, isIsoDate } from '@/lib/prague-time'
import { isInvoiceOutstanding, isInvoiceOverdue, invoiceSql } from '@/lib/invoice-status'
import {
  cancelInvoiceQuery, issueInvoice, issueErrorMessage, isIssuingReady, loadIssuerProfile, saveIssuerProfile,
  type IssuerSettings,
} from '@/lib/admin/invoice-issue'
import { issueInvoiceSchema, issuerProfileSchema } from '@/lib/admin/invoice-issue-schema'
import { lookupIco } from '@/lib/ares'
import { ledgerSql, withLedger } from '@/lib/admin/ledger'
import type { InvoiceAiExtract } from '@/lib/types'

/**
 * Archiv faktur. Faktura je doklad, ne příjem — do ledgeru vstupuje až
 * vyplněním `paid_on`, což řeší `syncInvoiceTransaction` v `lib/invoices.ts`.
 *
 * Všechno pod `requireAuth()`: faktury nesou údaje klientů (IČO, DIČ, adresy
 * v PDF) a nikdy nesmí být veřejné.
 */

export interface InvoiceListItem {
  id: string
  invoice_number: string
  project_id: string | null
  /** Jméno klienta z faktury; když chybí, dotáhne se ze zakázky */
  client_name: string | null
  client_ico: string | null
  client_dic: string | null
  issued_on: string
  due_on: string | null
  paid_on: string | null
  amount: number
  currency: string
  note: string | null
  pdf_filename: string | null
  pdf_size: number | null
  has_pdf: boolean
  /** Storno (AD12): doklad zůstává v evidenci kvůli souvislé řadě, ale neplatí. */
  cancelled_at: string | null
  /**
   * Kdy člověk rozhodl, jestli příjem zakázky patří téhle faktuře (AD13).
   * `null` = ještě se neptal; po rozhodnutí se varování o dvojím započtení
   * neukazuje. Před migrací 109 je vždy `null`.
   */
  payment_reviewed_at: string | null
  /** Odkaz na zakázku v adminu — null u faktury bez zakázky */
  project_href: string | null
  project_client_name: string | null
  /**
   * Zakázka má v ledgeru vlastní příjem, který tahle faktura nezastupuje.
   * Nemusí to být chyba (záloha + doplatek), ale je to jediné místo, kde
   * může vzniknout dvojí započtení — proto se to uživateli ukazuje.
   */
  duplicate_risk: boolean
}

export interface InvoiceArchiveData {
  year: number
  availableYears: number[]
  /** Zaplacené faktury vybraného roku — podle data zaplacení, ne vystavení */
  paid: InvoiceListItem[]
  /** Pohledávky napříč roky — dokud peníze nedorazí, nepatří žádnému roku */
  outstanding: InvoiceListItem[]
  paidTotal: number
  outstandingTotal: number
  overdueCount: number
}

// Mapování řádku faktury žije v `lib/invoices.ts` — používá ho i evidence (AD07).
type Row = InvoiceRow
const toItem = toInvoiceItem

/**
 * Strop archivu faktur ve Financích a na zakázce. Je to daňový pohled na
 * jeden rok (nebo jednu zakázku), takže se v praxi nenaplní — ale žádný
 * výpis v adminu nesmí růst bez konce (AD07). Evidence s vlastním
 * stránkováním je `lib/admin/invoices.ts`.
 */
const ARCHIVE_LIMIT = 500

export async function getInvoices(year: number): Promise<InvoiceArchiveData> {
  await requireAuth()

  const [paidRows, outstandingRows, yearRows] = await withLedger((L) => adminDb.batch([
    {
      text: `
        SELECT ${invoiceColumns(L)}, ${OTHER_INCOME_COUNT}
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        ${INCOME_JOIN}
        WHERE ${invoiceSql.paid()} AND EXTRACT(YEAR FROM i.paid_on) = $1
        ORDER BY i.paid_on DESC, i.created_at DESC
        LIMIT ${ARCHIVE_LIMIT}
      `,
      params: [year],
    },
    {
      text: `
        SELECT ${invoiceColumns(L)}, 0 AS other_income_count
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        WHERE ${invoiceSql.outstanding()}
        ORDER BY COALESCE(i.due_on, i.issued_on) ASC
        LIMIT ${ARCHIVE_LIMIT}
      `,
      params: [],
    },
    {
      text: `
        SELECT DISTINCT EXTRACT(YEAR FROM paid_on)::int AS year
        FROM invoices WHERE paid_on IS NOT NULL
        ORDER BY year DESC
      `,
      params: [],
    },
  ]))

  const paid = (paidRows as unknown as Row[]).map(toItem)
  const outstanding = (outstandingRows as unknown as Row[]).map(toItem)

  // Pražský dnešek, ne UTC: po pražské půlnoci vrací UTC ještě včerejší
  // datum, takže by se faktura po splatnosti na hodinu zatajila (AD13).
  const today = getPragueTodayISO()
  const overdueCount = outstanding.filter(i => isInvoiceOverdue(i, today)).length

  const currentYear = new Date().getFullYear()
  const years = (yearRows as unknown as { year: number }[]).map(r => r.year)

  return {
    year,
    availableYears: Array.from(new Set([currentYear, year, ...years])).sort((a, b) => b - a),
    paid,
    outstanding,
    paidTotal: paid.reduce((s, i) => s + i.amount, 0),
    outstandingTotal: outstanding.reduce((s, i) => s + i.amount, 0),
    overdueCount,
  }
}

/**
 * Faktury jedné zakázky — pro kartu na detailu zakázky. Bez filtru roku:
 * na zakázce chceš vidět všechny její doklady, ne výsek jednoho roku.
 */
export async function getProjectInvoices(projectId: string): Promise<InvoiceArchiveData> {
  await requireAuth()

  const [rows] = await withLedger((L) => adminDb.batch([
    {
      text: `
        SELECT ${invoiceColumns(L)}, ${OTHER_INCOME_COUNT}
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        ${INCOME_JOIN}
        WHERE i.project_id = $1
        ORDER BY i.issued_on DESC, i.created_at DESC
        LIMIT ${ARCHIVE_LIMIT}
      `,
      params: [projectId],
    },
  ]))

  const today = getPragueTodayISO()
  const all = (rows as unknown as Row[]).map(toItem)
  const paid = all.filter(i => i.paid_on !== null)
  // Stornovaný doklad není pohledávka — nikdo ho nevymáhá (AD12).
  const outstanding = all.filter(i => isInvoiceOutstanding(i, today))

  return {
    year: new Date().getFullYear(),
    availableYears: [],
    paid,
    outstanding,
    paidTotal: paid.reduce((s, i) => s + i.amount, 0),
    outstandingTotal: outstanding.reduce((s, i) => s + i.amount, 0),
    overdueCount: outstanding.filter(i => isInvoiceOverdue(i, today)).length,
  }
}

/** Zakázky pro výběr ve formuláři — ze všech zdrojů, je to jedno IČO a jedno přiznání. */
export interface InvoiceProjectOption {
  id: string
  client_name: string
  description: string | null
  /** Doména webu, odkud poptávka přišla; null u výchozího zdroje a ručních zakázek. */
  origin_label: string | null
}

export async function getInvoiceProjectOptions(): Promise<InvoiceProjectOption[]> {
  await requireAuth()
  const [rows] = await adminDb.batch([projectOptionsQuery()])
  return (rows as unknown as Parameters<typeof toProjectOption>[0][]).map(toProjectOption)
}

function revalidateInvoicePaths(projectId: string | null) {
  revalidatePath('/dashboard/finance')
  revalidatePath('/dashboard/faktury')
  if (projectId) {
    revalidatePath(`/dashboard/${projectId}`)
  }
}

export async function createInvoice(formData: FormData): Promise<{ error?: string; id?: string }> {
  try {
    await requireAuth()
    const parsed = await parseInvoiceForm(formData)
    if ('error' in parsed) return { error: parsed.error }

    const { id } = await insertInvoice(parsed.data, parsed.pdf)
    revalidateInvoicePaths(parsed.data.project_id)
    return { id }
  } catch (err) {
    return { error: invoiceErrorMessage(err) }
  }
}

export async function updateInvoice(id: string, formData: FormData): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const parsed = await parseInvoiceForm(formData)
    if ('error' in parsed) return { error: parsed.error }

    await updateInvoiceRow(id, parsed.data, parsed.pdf, parsed.removePdf)
    revalidateInvoicePaths(parsed.data.project_id)
    return {}
  } catch (err) {
    return { error: invoiceErrorMessage(err) }
  }
}

/**
 * Označení faktury za zaplacenou (nebo vrácení zpět) jedním kliknutím — AD08.
 *
 * Nepřidává **žádnou** peněžní logiku: nastaví `paid_on` a pustí tutéž
 * `syncInvoiceTransaction`, kterou volá i formulář. Ochrana proti dvojímu
 * započtení (převzetí existujícího příjmu zakázky místo založení druhého)
 * sedí uvnitř té funkce, takže se tady nemá co rozejít.
 *
 * `paidOn = null` fakturu vrátí mezi pohledávky a `syncInvoiceTransaction`
 * přitom smaže jen transakci, kterou sama založila — převzatý příjem zakázky
 * zůstane.
 */
export async function setInvoicePaid(id: string, paidOn: string | null): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!UUID_RE.test(id)) return { error: 'Faktura nenalezena' }
    if (paidOn !== null && !isIsoDate(paidOn)) return { error: 'Neplatné datum zaplacení' }

    // Stornovaný doklad se neplatí — jinak by storno zrušený příjem
    // (`cancelInvoiceQuery`) vzniknul znovu jedním kliknutím ve výpisu.
    //
    // Zaplacení a srovnání ledgeru jdou jednou dávkou (AD13): mezi nimi
    // nesmí nic spadnout, jinak by faktura byla zaplacená bez příjmu.
    const [rows] = await adminDb.batch([
      {
        text: `
          UPDATE invoices SET paid_on = $2
          WHERE id = $1 AND cancelled_at IS NULL
          RETURNING project_id::text
        `,
        params: [id, paidOn],
      },
      ...invoiceSyncQueries(await ledgerSql(), id),
    ])
    if (!rows.length) {
      const existuje = await sql`SELECT cancelled_at FROM invoices WHERE id = ${id} LIMIT 1`
      return { error: existuje.length ? 'Stornovaná faktura se nedá označit jako zaplacená.' : 'Faktura nenalezena' }
    }

    revalidateInvoicePaths((rows[0] as { project_id: string | null }).project_id)
    return {}
  } catch (err) {
    return { error: invoiceErrorMessage(err) }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function deleteInvoice(id: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const rows = await sql`SELECT project_id::text FROM invoices WHERE id = ${id} LIMIT 1`
    const projectId = (rows[0] as { project_id: string | null } | undefined)?.project_id ?? null

    await deleteInvoiceRow(id)
    revalidateInvoicePaths(projectId)
    return {}
  } catch (err) {
    // Pojistka z migrace 108: doklad z vlastní řady se nemaže, aby v číslech
    // nevznikla díra. Oprava se dělá stornem a novou fakturou.
    const zprava = err instanceof Error ? err.message : ''
    if (zprava.includes('admin_invoice_undeletable')) {
      return { error: 'Vystavenou fakturu nemažeme — číslo by v řadě chybělo. Použijte storno.' }
    }
    return { error: 'Nepodařilo se smazat fakturu' }
  }
}

/** Unikátní index na `invoice_number` je jediná chyba, kterou má smysl přeložit do češtiny. */
function invoiceErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code
  if (code === '23505') return 'Faktura s tímhle číslem už v archivu je'
  return 'Nepodařilo se uložit fakturu'
}

// ─── Evidence faktur (/dashboard/faktury) ────────────────────────────────────

/**
 * Faktura v evidenci. Proti `InvoiceListItem` navíc nese popis zakázky —
 * v evidenci je „jméno zakázky" hlavní orientační bod, samotné jméno klienta
 * u opakovaných zakázek nestačí.
 */
export interface InvoiceRegistryItem extends InvoiceListItem {
  project_description: string | null
}

type RegistryRow = InvoiceRegistryRow
const toRegistryItem = toInvoiceRegistryItem

const projectOptionsQuery = (): AdminQuery => ({
  text: `
    SELECT id::text, client_name, description, lead_origin
    FROM projects
    ORDER BY created_at DESC
    LIMIT 200
  `,
  params: [],
})

const toProjectOption = (r: { id: string; client_name: string; description: string | null; lead_origin: string }): InvoiceProjectOption => {
  const origin = toLeadOrigin(r.lead_origin)
  return {
    id: r.id,
    client_name: r.client_name,
    description: r.description,
    origin_label: origin === DEFAULT_LEAD_ORIGIN ? null : LEAD_ORIGINS[origin].domain ?? LEAD_ORIGINS[origin].name,
  }
}

/** Příjem v ledgeru, který fakturu zastupuje — na detailu ať je vidět, co doklad udělal s daněmi. */
export interface InvoiceLedgerEntry {
  id: string
  amount: number
  date: string
  category: string
  note: string | null
  /** true = transakci založila tahle faktura; false = převzala ji po zakázce */
  owned_by_invoice: boolean
}

/**
 * Faktura vystavená v adminu (AD12). U nahraného dokladu je `null` — archiv
 * položky ani dodavatele nemá, a dokud nedoběhne migrace 107, nemá je nikdo.
 */
export interface IssuedInvoiceDetail {
  items: { description: string; quantity: number; unitPrice: number; vatRate: number }[]
  issuer: { name: string; address: string; ico: string; dic: string; bank: string; vatPayer: boolean }
  client_address: string | null
  supplied_on: string | null
  vat_total: number | null
  cancelled_at: string | null
  sent_at: string | null
}

/** Faktura se vším, co je o ní uloženo — včetně surového AI přepisu a vazby na ledger. */
export interface InvoiceDetail extends InvoiceRegistryItem {
  ai_extracted: InvoiceAiExtract | null
  created_at: string
  updated_at: string | null
  ledger: InvoiceLedgerEntry | null
  /** Kontakt ze zakázky (AD10) — nezaplacenou fakturu jde urgovat odsud. */
  project_client_phone: string | null
  project_client_email: string | null
  /** Vyplněné jen u faktury vystavené tady; nahraný archiv má `null` (AD12). */
  issued: IssuedInvoiceDetail | null
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  await requireAuth()
  if (!UUID_RE.test(id)) return null

  // Sloupce faktury jsou na jednom místě (`invoiceColumns` v `lib/invoices.ts`) —
  // stejný seznam, jaký používá evidence i archiv. Dřív tu byla čtvrtá kopie
  // osmnácti sloupců a dvě další kola do databáze (ledger a vystavená část);
  // od AD13 je to jedna dávka.
  const issuingReady = await isIssuingReady()
  const L = await ledgerSql()
  const [rows, issuedRows] = await adminDb.batch([
    {
      text: `
        SELECT ${invoiceColumns(L)},
          i.ai_extracted,
          i.created_at::text, i.updated_at::text,
          i.finance_transaction_id::text,
          p.description AS project_description,
          p.client_phone AS project_client_phone,
          p.client_email AS project_client_email,
          t.id::text AS ledger_id,
          t.amount::float AS ledger_amount,
          t.date::text AS ledger_date,
          t.category AS ledger_category,
          t.note AS ledger_note,
          (t.source_invoice_id IS NOT NULL AND t.source_invoice_id = i.id) AS ledger_owned_by_invoice,
          ${OTHER_INCOME_COUNT}
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        LEFT JOIN finance_transactions t ON t.id = i.finance_transaction_id
        ${INCOME_JOIN}
        WHERE i.id = $1
        LIMIT 1
      `,
      params: [id],
    },
    ...(issuingReady ? [issuedQuery(id)] : []),
  ])

  const row = rows[0] as
    | (RegistryRow & {
        ai_extracted: InvoiceAiExtract | null
        created_at: string
        updated_at: string | null
        finance_transaction_id: string | null
        project_client_phone: string | null
        project_client_email: string | null
        ledger_id: string | null
        ledger_amount: number | null
        ledger_date: string | null
        ledger_category: string | null
        ledger_note: string | null
        ledger_owned_by_invoice: boolean | null
      })
    | undefined
  if (!row) return null

  const {
    ai_extracted, created_at, updated_at, finance_transaction_id,
    project_client_phone, project_client_email,
    ledger_id, ledger_amount, ledger_date, ledger_category, ledger_note, ledger_owned_by_invoice,
    ...registryRow
  } = row

  const ledger: InvoiceLedgerEntry | null =
    ledger_id !== null
      ? {
          id: ledger_id,
          amount: Number(ledger_amount ?? 0),
          date: String(ledger_date),
          category: String(ledger_category),
          note: ledger_note,
          owned_by_invoice: ledger_owned_by_invoice === true,
        }
      : null

  return {
    ...toRegistryItem(registryRow),
    ai_extracted, created_at, updated_at, ledger,
    project_client_phone, project_client_email,
    issued: toIssuedPart(issuedRows?.[0]),
  }
}

/**
 * Část dokladu, kterou má jen faktura vystavená tady. Samostatný dotaz
 * schválně: dokud nedoběhne migrace 107, ty sloupce v databázi nejsou
 * a hlavní dotaz by na nich spadl (AD12). Od AD13 jede ve stejné dávce.
 */
function issuedQuery(id: string): AdminQuery {
  return {
    text: `
      SELECT items, issuer, client_address, supplied_on::text,
             vat_total::float AS vat_total, cancelled_at::text, sent_at::text
      FROM invoices
      WHERE id = $1 AND number_seq IS NOT NULL
      LIMIT 1
    `,
    params: [id],
  }
}

function toIssuedPart(row: unknown): IssuedInvoiceDetail | null {
  if (!row) return null
  const r = row as IssuedInvoiceDetail & { items: unknown; issuer: unknown }
  return {
    items: (r.items as IssuedInvoiceDetail['items']) ?? [],
    issuer: r.issuer as IssuedInvoiceDetail['issuer'],
    client_address: r.client_address,
    supplied_on: r.supplied_on,
    vat_total: r.vat_total,
    cancelled_at: r.cancelled_at,
    sent_at: r.sent_at,
  }
}

// ─── „Je tohle ta platba?" (AD13) ────────────────────────────────────────────

/**
 * Příjem zakázky, který nezastupuje žádný doklad — tedy možná tytéž peníze
 * jako tahle faktura.
 *
 * Do AD13 si faktura brala takový příjem **sama**, jen podle přesné rovnosti
 * částky, a první podle data. U zálohy a doplatku stejné výše tím mohla
 * převzít ten špatný, a při zaokrouhlení nebo částečné platbě nepřevzala nic
 * a vložila druhý příjem — tytéž peníze ležely v ledgeru dvakrát.
 *
 * Nově si bere jen jednoznačného kandidáta (jeden, stejná částka i měna).
 * Zbytek rozhodne člověk tady.
 */
export interface PaymentCandidate {
  id: string
  amount: number
  currency: string
  date: string
  note: string | null
  category: string
  /** Záloha zakázky (`deposit_transaction`). */
  deposit: boolean
  declared: boolean
  /** Příjem je ze uzavřeného roku — převzetí změní loňský daňový základ. */
  closedYear: boolean
}

export async function getPaymentCandidates(invoiceId: string): Promise<PaymentCandidate[]> {
  await requireAuth()
  if (!UUID_RE.test(invoiceId)) return []

  const L = await ledgerSql()
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT t.id::text, t.amount::float AS amount, t.date::text, t.note, t.category,
               t.deposit_transaction AS deposit, t.declared,
               ${L.currency('t')} AS currency
        FROM finance_transactions t
        JOIN invoices i ON i.id = $1
        WHERE t.source_project_id = i.project_id
          AND t.type = 'income'
          AND t.user_id IS NULL
          AND t.source_invoice_id IS NULL
          AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
          AND NOT EXISTS (SELECT 1 FROM invoices x WHERE x.finance_transaction_id = t.id)
        ORDER BY t.date DESC
        LIMIT 20
      `,
      params: [invoiceId],
    },
  ])

  const letos = Number(getPragueTodayISO().slice(0, 4))
  return (rows as unknown as (Omit<PaymentCandidate, 'closedYear'> & { date: string })[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
    closedYear: Number(String(r.date).slice(0, 4)) < letos,
  }))
}

/**
 * „Ano, je to tahle platba." Faktura převezme vybraný příjem zakázky
 * a vlastní vložený příjem zmizí — tytéž peníze zůstanou v ledgeru jednou.
 *
 * Daňová pojistka: převzetí nastaví `declared = true`, takže mění daňový
 * základ. Když platba spadá do uzavřeného roku, akce bez výslovného
 * potvrzení neprojde — tichá změna loňska je tiché přepsání přiznání.
 */
export async function adoptPayment(
  invoiceId: string,
  transactionId: string,
  options: { confirmClosedYear?: boolean } = {},
): Promise<{ error?: string; needsConfirm?: string }> {
  await requireAuth()
  if (!UUID_RE.test(invoiceId) || !UUID_RE.test(transactionId)) return { error: 'Platba nenalezena' }

  const kandidati = await getPaymentCandidates(invoiceId)
  const vybrany = kandidati.find((k) => k.id === transactionId)
  if (!vybrany) return { error: 'Tahle platba už k faktuře přiřadit nejde. Otevřete fakturu znovu.' }
  if (vybrany.closedYear && options.confirmClosedYear !== true) {
    return { needsConfirm: String(vybrany.date).slice(0, 4) }
  }

  const L = await ledgerSql()
  try {
    const [, linked] = await adminDb.batch([
      // Vlastní příjem faktury zmizí — jinak by tytéž peníze zůstaly dvakrát.
      {
        text: `
          DELETE FROM finance_transactions t
          USING invoices i
          WHERE i.id = $1 AND t.source_invoice_id = i.id
        `,
        params: [invoiceId],
      },
      {
        text: `
          WITH oznaceni AS (
            UPDATE finance_transactions SET declared = true
            WHERE id = $2
              AND type = 'income'
              AND user_id IS NULL
              AND source_invoice_id IS NULL
              AND source_project_id = (SELECT project_id FROM invoices WHERE id = $1)
            RETURNING id
          )
          UPDATE invoices
          SET finance_transaction_id = (SELECT id FROM oznaceni)${L.has ? `, payment_origin = 'adopted', payment_reviewed_at = now()` : ''}
          WHERE id = $1 AND paid_on IS NOT NULL AND EXISTS (SELECT 1 FROM oznaceni)
          RETURNING project_id::text
        `,
        params: [invoiceId, transactionId],
      },
    ])

    if (!linked.length) return { error: 'Platbu se nepodařilo přiřadit. Zkuste to prosím znovu.' }
    revalidateInvoicePaths((linked[0] as { project_id: string | null }).project_id)
    return {}
  } catch {
    return { error: 'Platbu se nepodařilo přiřadit. Zkuste to prosím znovu.' }
  }
}

/**
 * „Ne, byly to jiné peníze." Oba příjmy zůstanou a varování o dvojím
 * započtení zmizí — rozhodl o tom člověk, ne odhad podle částky.
 */
export async function keepPaymentsSeparate(invoiceId: string): Promise<{ error?: string }> {
  await requireAuth()
  if (!UUID_RE.test(invoiceId)) return { error: 'Faktura nenalezena' }
  const L = await ledgerSql()
  if (!L.has) return { error: 'Tohle půjde až po nasazení migrace 109.' }

  const [rows] = await adminDb.batch([
    {
      text: `UPDATE invoices SET payment_reviewed_at = now() WHERE id = $1 RETURNING project_id::text`,
      params: [invoiceId],
    },
  ])
  if (!rows.length) return { error: 'Faktura nenalezena' }
  revalidateInvoicePaths((rows[0] as { project_id: string | null }).project_id)
  return {}
}

// ─── Vystavování faktur (AD12) ───────────────────────────────────────────────

/**
 * Vystavení je **oddělená cesta** od archivu: nejde přes `parseInvoiceForm`
 * ani `insertInvoice`, protože doklad vzniká v databázi (`admin_invoice_issue`)
 * i s číslem z řady. Archiv cizích PDF, AI přepis a `syncInvoiceTransaction`
 * se tím nemění ani o řádek.
 *
 * Příjem z vystavené faktury vzniká až zaplacením (`setInvoicePaid` výš) —
 * daňová evidence jede na hotovostním principu (R-011).
 */

export async function getIssuerSettings(): Promise<IssuerSettings> {
  await requireAuth()
  return loadIssuerProfile()
}

export async function saveIssuer(raw: unknown): Promise<{ error?: string }> {
  await requireAuth()
  const parsed = issuerProfileSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Údaje dodavatele nejsou úplné.' }
  try {
    await saveIssuerProfile(parsed.data)
    revalidatePath('/dashboard/faktury')
    return {}
  } catch {
    return { error: 'Profil se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}

export async function issueNewInvoice(raw: unknown): Promise<{ error?: string; id?: string; number?: string }> {
  await requireAuth()

  const parsed = issueInvoiceSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Něco ve faktuře nesedí.' }

  const { profile, configured } = await loadIssuerProfile()
  if (!configured) return { error: 'Nejdřív vyplňte údaje dodavatele v Profilu dodavatele.' }
  if (!profile.vatPayer && parsed.data.items.some(i => i.vatRate !== 0)) {
    return { error: 'Nejste plátce DPH, takže položky musí mít sazbu 0 %.' }
  }

  try {
    const { id, number } = await issueInvoice(parsed.data, profile)
    revalidateInvoicePaths(parsed.data.projectId)
    return { id, number }
  } catch (err) {
    return { error: issueErrorMessage(err) }
  }
}

/** Storno: vystavený doklad se nepřepisuje, opravuje se novou fakturou. */
export async function cancelIssuedInvoice(id: string): Promise<{ error?: string }> {
  await requireAuth()
  if (!UUID_RE.test(id)) return { error: 'Faktura nenalezena' }
  try {
    const rows = await sql`SELECT project_id::text FROM invoices WHERE id = ${id} AND number_seq IS NOT NULL LIMIT 1`
    if (!rows.length) return { error: 'Stornovat jde jen fakturu vystavenou tady.' }
    // Storno a úklid ledgeru jednou dávkou (AD13): stornovaná faktura nesmí
    // zůstat v ledgeru jako příjem ani na okamžik. `paid_on` je pryč, takže
    // sync smaže transakci, kterou faktura založila, a převzatý příjem
    // zakázky jen rozváže.
    await adminDb.batch([cancelInvoiceQuery(id), ...invoiceSyncQueries(await ledgerSql(), id)])
    revalidateInvoicePaths((rows[0] as { project_id: string | null }).project_id)
    return {}
  } catch (err) {
    return { error: issueErrorMessage(err) }
  }
}

/**
 * Odběratel podle IČO z ARES (R-086). Selhání nikdy neblokuje fakturu —
 * vrátí se hláška a formulář zůstane vyplnitelný ručně.
 */
export async function lookupCompany(ico: string): Promise<{
  subject?: { name: string; address: string; ico: string; dic: string }
  error?: string
}> {
  await requireAuth()
  const result = await lookupIco(typeof ico === 'string' ? ico : '')
  if (result.status === 'ok') return { subject: result.subject }
  if (result.status === 'invalid') return { error: 'Tohle IČO neexistuje — zkontrolujte číslice.' }
  if (result.status === 'not_found') return { error: 'V rejstříku jsem firmu s tímhle IČO nenašel.' }
  return { error: 'Rejstřík teď neodpovídá. Vyplňte odběratele ručně.' }
}
