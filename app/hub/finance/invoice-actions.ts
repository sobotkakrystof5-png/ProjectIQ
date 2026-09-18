'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import {
  parseInvoiceForm, insertInvoice, updateInvoiceRow, deleteInvoiceRow,
} from '@/lib/invoices'
import { projectPath, toBusiness } from '@/lib/business'
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

type Row = Omit<InvoiceListItem, 'project_href' | 'duplicate_risk'> & {
  project_business: string | null
  other_income_count: number
}

function toItem(row: Row): InvoiceListItem {
  const { project_business, other_income_count, ...rest } = row
  return {
    ...rest,
    project_href:
      rest.project_id !== null ? projectPath(toBusiness(project_business), rest.project_id) : null,
    duplicate_risk: rest.paid_on !== null && other_income_count > 0,
  }
}

export async function getInvoices(year: number): Promise<InvoiceArchiveData> {
  await requireAuth()

  // `other_income_count` = příjmy zakázky, které tahle faktura v ledgeru
  // nezastupuje. Jediný signál dvojího započtení, který jde spočítat v DB.
  const [paidRows, outstandingRows, yearRows] = await Promise.all([
    sql`
      SELECT
        i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
        i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
        i.currency, i.note, i.pdf_filename, i.pdf_size,
        (i.pdf_data IS NOT NULL) AS has_pdf,
        p.business AS project_business,
        p.client_name AS project_client_name,
        COALESCE((
          SELECT COUNT(*) FROM finance_transactions t
          WHERE t.source_project_id = i.project_id
            AND t.type = 'income'
            AND t.user_id IS NULL
            AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
        ), 0)::int AS other_income_count
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.paid_on IS NOT NULL AND EXTRACT(YEAR FROM i.paid_on) = ${year}
      ORDER BY i.paid_on DESC, i.created_at DESC
    `,
    sql`
      SELECT
        i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
        i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
        i.currency, i.note, i.pdf_filename, i.pdf_size,
        (i.pdf_data IS NOT NULL) AS has_pdf,
        p.business AS project_business,
        p.client_name AS project_client_name,
        0 AS other_income_count
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.paid_on IS NULL
      ORDER BY COALESCE(i.due_on, i.issued_on) ASC
    `,
    sql`
      SELECT DISTINCT EXTRACT(YEAR FROM paid_on)::int AS year
      FROM invoices WHERE paid_on IS NOT NULL
      ORDER BY year DESC
    `,
  ])

  const paid = (paidRows as Row[]).map(toItem)
  const outstanding = (outstandingRows as Row[]).map(toItem)

  const today = new Date().toISOString().slice(0, 10)
  const overdueCount = outstanding.filter(i => i.due_on !== null && i.due_on < today).length

  const currentYear = new Date().getFullYear()
  const years = (yearRows as { year: number }[]).map(r => r.year)

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

  const rows = await sql`
    SELECT
      i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
      i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
      i.currency, i.note, i.pdf_filename, i.pdf_size,
      (i.pdf_data IS NOT NULL) AS has_pdf,
      p.business AS project_business,
      p.client_name AS project_client_name,
      COALESCE((
        SELECT COUNT(*) FROM finance_transactions t
        WHERE t.source_project_id = i.project_id
          AND t.type = 'income'
          AND t.user_id IS NULL
          AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
      ), 0)::int AS other_income_count
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.project_id = ${projectId}
    ORDER BY i.issued_on DESC, i.created_at DESC
  `

  const all = (rows as Row[]).map(toItem)
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

/** Zakázky pro výběr ve formuláři — napříč byznysy, je to jedno IČO a jedno přiznání. */
export interface InvoiceProjectOption {
  id: string
  client_name: string
  description: string | null
  business: string
}

export async function getInvoiceProjectOptions(): Promise<InvoiceProjectOption[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, client_name, description, business
    FROM projects
    ORDER BY created_at DESC
    LIMIT 200
  `
  return rows as InvoiceProjectOption[]
}

function revalidateInvoicePaths(projectId: string | null) {
  revalidatePath('/hub/finance')
  revalidatePath('/dashboard/faktury')
  if (projectId) {
    revalidatePath(`/dashboard/${projectId}`)
    revalidatePath(`/alteno/${projectId}`)
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

export async function deleteInvoice(id: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const rows = await sql`SELECT project_id::text FROM invoices WHERE id = ${id} LIMIT 1`
    const projectId = (rows[0] as { project_id: string | null } | undefined)?.project_id ?? null

    await deleteInvoiceRow(id)
    revalidateInvoicePaths(projectId)
    return {}
  } catch {
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

type RegistryRow = Row & { project_description: string | null }

function toRegistryItem(row: RegistryRow): InvoiceRegistryItem {
  const { project_description, ...base } = row
  return { ...toItem(base), project_description }
}

/**
 * Všechny faktury, co kdy vznikly — bez filtru roku a bez dělení na
 * zaplacené/pohledávky. Evidence je archiv dokladů: filtrování si řídí
 * uživatel v UI, server vrací kompletní pravdu.
 *
 * Řadí se podle data vystavení (ne zaplacení) — v archivu hledáš doklad
 * podle toho, kdy vznikl.
 */
export async function getAllInvoices(): Promise<InvoiceRegistryItem[]> {
  await requireAuth()

  const rows = await sql`
    SELECT
      i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
      i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
      i.currency, i.note, i.pdf_filename, i.pdf_size,
      (i.pdf_data IS NOT NULL) AS has_pdf,
      p.business AS project_business,
      p.client_name AS project_client_name,
      p.description AS project_description,
      COALESCE((
        SELECT COUNT(*) FROM finance_transactions t
        WHERE t.source_project_id = i.project_id
          AND t.type = 'income'
          AND t.user_id IS NULL
          AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
      ), 0)::int AS other_income_count
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    ORDER BY i.issued_on DESC, i.created_at DESC
  `

  return (rows as RegistryRow[]).map(toRegistryItem)
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

/** Faktura se vším, co je o ní uloženo — včetně surového AI přepisu a vazby na ledger. */
export interface InvoiceDetail extends InvoiceRegistryItem {
  ai_extracted: InvoiceAiExtract | null
  created_at: string
  updated_at: string | null
  ledger: InvoiceLedgerEntry | null
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  await requireAuth()

  const rows = await sql`
    SELECT
      i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
      i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
      i.currency, i.note, i.pdf_filename, i.pdf_size,
      (i.pdf_data IS NOT NULL) AS has_pdf,
      i.ai_extracted,
      i.created_at::text, i.updated_at::text,
      i.finance_transaction_id::text,
      p.business AS project_business,
      p.client_name AS project_client_name,
      p.description AS project_description,
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
      })
    | undefined
  if (!row) return null

  const { ai_extracted, created_at, updated_at, finance_transaction_id, ...registryRow } = row

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

  return { ...toRegistryItem(registryRow), ai_extracted, created_at, updated_at, ledger }
}
