'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import {
  parseInvoiceForm, insertInvoice, updateInvoiceRow, deleteInvoiceRow, syncInvoiceTransaction,
  INVOICE_COLUMNS, INCOME_JOIN, OTHER_INCOME_COUNT,
  toInvoiceItem, toInvoiceRegistryItem,
  type InvoiceRow, type InvoiceRegistryRow,
} from '@/lib/invoices'
import { DEFAULT_LEAD_ORIGIN, LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import { isIsoDate } from '@/lib/prague-time'
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
  /** Doklad vystavila tahle aplikace (AD12) — má položky, dodavatele a PDF generujeme my. */
  pdf_generated: boolean
  /** Storno: doklad zůstává i s číslem, ale neplatí a nepočítá se mezi pohledávky. */
  cancelled_at: string | null
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

  const [paidRows, outstandingRows, yearRows] = await adminDb.batch([
    {
      text: `
        SELECT ${INVOICE_COLUMNS}, ${OTHER_INCOME_COUNT}
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        ${INCOME_JOIN}
        WHERE i.paid_on IS NOT NULL AND EXTRACT(YEAR FROM i.paid_on) = $1
        ORDER BY i.paid_on DESC, i.created_at DESC
        LIMIT ${ARCHIVE_LIMIT}
      `,
      params: [year],
    },
    {
      text: `
        SELECT ${INVOICE_COLUMNS}, 0 AS other_income_count
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        WHERE i.paid_on IS NULL AND i.cancelled_at IS NULL
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
  ])

  const paid = (paidRows as unknown as Row[]).map(toItem)
  const outstanding = (outstandingRows as unknown as Row[]).map(toItem)

  const today = new Date().toISOString().slice(0, 10)
  const overdueCount = outstanding.filter(i => i.due_on !== null && i.due_on < today).length

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

  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT ${INVOICE_COLUMNS}, ${OTHER_INCOME_COUNT}
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        ${INCOME_JOIN}
        WHERE i.project_id = $1
        ORDER BY i.issued_on DESC, i.created_at DESC
        LIMIT ${ARCHIVE_LIMIT}
      `,
      params: [projectId],
    },
  ])

  const all = (rows as unknown as Row[]).map(toItem)
  const paid = all.filter(i => i.paid_on !== null)
  const outstanding = all.filter(i => i.paid_on === null)
  const today = new Date().toISOString().slice(0, 10)

  return {
    year: new Date().getFullYear(),
    availableYears: [],
    paid,
    outstanding,
    paidTotal: paid.reduce((s, i) => s + i.amount, 0),
    outstandingTotal: outstanding.reduce((s, i) => s + i.amount, 0),
    overdueCount: outstanding.filter(i => i.due_on !== null && i.due_on < today).length,
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

    // Stornovaný doklad (AD12) nesmí založit příjem — platí se jen to, co platí.
    const rows = await sql`
      UPDATE invoices SET paid_on = ${paidOn}
      WHERE id = ${id} AND cancelled_at IS NULL
      RETURNING project_id::text
    `
    if (!rows.length) {
      const exists = await sql`SELECT cancelled_at FROM invoices WHERE id = ${id} LIMIT 1`
      return { error: exists.length ? 'Stornovaná faktura se nedá označit jako zaplacená.' : 'Faktura nenalezena' }
    }

    await syncInvoiceTransaction(id)
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
    const message = err instanceof Error ? err.message : ''
    if (message.includes('admin_invoice_no_delete')) {
      return { error: 'Vystavenou fakturu nemažeme — číslo by v řadě chybělo. Použijte storno.' }
    }
    return { error: 'Nepodařilo se smazat fakturu' }
  }
}

/**
 * Chyby z databáze, které mají pro člověka smysl přeložit: duplicitní číslo
 * a dvě pojistky z migrace 107 — vystavený doklad se nemění a nemaže.
 */
function invoiceErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (code === '23505') return 'Faktura s tímhle číslem už v archivu je'
  if (message.includes('admin_invoice_immutable')) {
    return 'Vystavenou fakturu už měnit nejde. Stornujte ji a vystavte novou.'
  }
  if (message.includes('admin_invoice_no_delete')) {
    return 'Vystavenou fakturu nemažeme — číslo by v řadě chybělo. Použijte storno.'
  }
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

/** Položka vystavené faktury. */
export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
}

/** Faktura se vším, co je o ní uloženo — včetně surového AI přepisu a vazby na ledger. */
export interface InvoiceDetail extends InvoiceRegistryItem {
  /** Dodavatel tak, jak byl v den vystavení (snímek, ne živý profil). */
  issuer: { name: string; address: string; ico: string; dic: string; bank: string; vatPayer: boolean } | null
  items: InvoiceLineItem[] | null
  client_address: string | null
  client_email: string | null
  supplied_on: string | null
  vat_total: number | null
  sent_at: string | null
  ai_extracted: InvoiceAiExtract | null
  created_at: string
  updated_at: string | null
  ledger: InvoiceLedgerEntry | null
  /** Kontakt ze zakázky (AD10) — nezaplacenou fakturu jde urgovat odsud. */
  project_client_phone: string | null
  project_client_email: string | null
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  await requireAuth()

  const rows = await sql`
    SELECT
      i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
      i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
      i.currency, i.note, i.pdf_filename, i.pdf_size,
      (i.pdf_data IS NOT NULL) AS has_pdf,
      i.pdf_generated, i.cancelled_at::text,
      i.client_address, i.client_email, i.supplied_on::text, i.vat_total::float AS vat_total,
      i.items, i.issuer, i.sent_at::text,
      i.ai_extracted,
      i.created_at::text, i.updated_at::text,
      i.finance_transaction_id::text,
      p.lead_origin AS project_lead_origin,
      p.client_name AS project_client_name,
      p.description AS project_description,
      p.client_phone AS project_client_phone,
      p.client_email AS project_client_email,
      COALESCE((
        SELECT COUNT(*) FROM finance_transactions t
        WHERE t.source_project_id = i.project_id
          AND t.type = 'income'
          AND t.user_id IS NULL
          AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
      ), 0)::int AS other_income_count
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.id = ${id}
    LIMIT 1
  `

  const row = rows[0] as
    | (RegistryRow & {
        ai_extracted: InvoiceAiExtract | null
        created_at: string
        updated_at: string | null
        finance_transaction_id: string | null
        project_client_phone: string | null
        project_client_email: string | null
        issuer: InvoiceDetail['issuer']
        items: InvoiceLineItem[] | null
        client_address: string | null
        client_email: string | null
        supplied_on: string | null
        vat_total: number | null
        sent_at: string | null
      })
    | undefined
  if (!row) return null

  const {
    ai_extracted, created_at, updated_at, finance_transaction_id,
    project_client_phone, project_client_email,
    issuer, items, client_address, client_email, supplied_on, vat_total, sent_at,
    ...registryRow
  } = row

  let ledger: InvoiceLedgerEntry | null = null
  if (finance_transaction_id) {
    const txRows = await sql`
      SELECT id::text, amount::float AS amount, date::text, category, note,
             (source_invoice_id IS NOT NULL AND source_invoice_id::text = ${id}) AS owned_by_invoice
      FROM finance_transactions
      WHERE id = ${finance_transaction_id}
      LIMIT 1
    `
    ledger = ((txRows[0] as InvoiceLedgerEntry | undefined) ?? null)
  }

  return {
    ...toRegistryItem(registryRow),
    ai_extracted, created_at, updated_at, ledger,
    project_client_phone, project_client_email,
    issuer, items, client_address, client_email, supplied_on, vat_total, sent_at,
  }
}
