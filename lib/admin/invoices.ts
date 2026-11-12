import 'server-only'
import { adminDb, type AdminQuery } from './db'
import { INCOME_JOIN, INVOICE_COLUMNS, OTHER_INCOME_COUNT, toInvoiceRegistryItem, type InvoiceRegistryRow } from '@/lib/invoices'
import { DEFAULT_LEAD_ORIGIN, LEAD_ORIGINS, toLeadOrigin } from '@/lib/lead-origins'
import type { TableParams } from '@/lib/admin-table'
import type { InvoiceProjectOption, InvoiceRegistryItem } from '@/app/dashboard/finance/invoice-actions'

/**
 * Evidence faktur `/dashboard/faktury` (AD07).
 *
 * Do AD07 si stránka stáhla **všechny** doklady a rok, stav, hledání
 * i součty počítala v prohlížeči. Tady filtruje a sčítá databáze, takže
 * stránka přenáší jen jednu stránku řádků a součty platí pro celý filtr,
 * ne jen pro to, co je zrovna vidět.
 */

/** Povolené řazení: klíč v URL → sloupec. */
export const INVOICE_SORT = {
  cislo: { sql: 'i.invoice_number', dir: 'desc' as const },
  klient: { sql: 'coalesce(i.client_name, p.client_name)', dir: 'asc' as const },
  vystaveno: { sql: 'i.issued_on', dir: 'desc' as const },
  splatnost: { sql: 'i.due_on', dir: 'desc' as const },
  zaplaceno: { sql: 'i.paid_on', dir: 'desc' as const },
  castka: { sql: 'i.amount', dir: 'desc' as const },
}

export type InvoiceStatusFilter = 'vse' | 'zaplacene' | 'nezaplacene' | 'po-splatnosti' | 'storno'

export const INVOICE_STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'vse', label: 'Všechny' },
  { value: 'zaplacene', label: 'Zaplacené' },
  { value: 'nezaplacene', label: 'Nezaplacené' },
  { value: 'po-splatnosti', label: 'Po splatnosti' },
  { value: 'storno', label: 'Storno' },
]

export function toInvoiceStatus(value: unknown): InvoiceStatusFilter {
  return INVOICE_STATUS_FILTERS.some((f) => f.value === value) ? (value as InvoiceStatusFilter) : 'vse'
}

export type InvoiceFilters = {
  /** Rok vystavení; `null` = všechny roky. */
  year: number | null
  status: InvoiceStatusFilter
  /** Hledaný text (číslo, klient, zakázka, IČO, poznámka). */
  query: string
}

/** Součet za měnu — koruny a eura se nikdy nesčítají (R-011). */
export type CurrencyTotal = {
  currency: string
  count: number
  total: number
  paid: number
  paidCount: number
  outstanding: number
  outstandingCount: number
  overdueCount: number
}

export type InvoiceRegistryScreen = {
  rows: InvoiceRegistryItem[]
  total: number
  totals: CurrencyTotal[]
  /** Kolik dokladů je v evidenci bez jakéhokoli filtru. */
  grandTotal: number
  years: number[]
  projects: InvoiceProjectOption[]
}

/**
 * Podmínky filtru. Hodnoty jdou vždy jako parametry — do textu dotazu se
 * dostane jen tvar podmínky, nikdy vstup z adresy.
 */
function where(filters: InvoiceFilters): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []

  if (filters.year !== null) {
    params.push(filters.year)
    // Porovnání na rozsah místo EXTRACT: takhle se dá použít index na issued_on.
    parts.push(`i.issued_on >= make_date($${params.length}, 1, 1) AND i.issued_on < make_date($${params.length} + 1, 1, 1)`)
  }

  // Stornovaný doklad (AD12) zůstává v evidenci kvůli souvislé číselné řadě,
  // ale není to pohledávka — nikdo ho už nevymáhá.
  if (filters.status === 'zaplacene') parts.push('i.paid_on IS NOT NULL')
  if (filters.status === 'nezaplacene') parts.push('i.paid_on IS NULL AND i.cancelled_at IS NULL')
  if (filters.status === 'po-splatnosti') parts.push('i.paid_on IS NULL AND i.cancelled_at IS NULL AND i.due_on IS NOT NULL AND i.due_on < current_date')
  if (filters.status === 'storno') parts.push('i.cancelled_at IS NOT NULL')

  const query = filters.query.trim()
  if (query) {
    params.push(`%${query}%`)
    const like = `$${params.length}`
    parts.push(`(
      i.invoice_number ILIKE ${like}
      OR i.client_name ILIKE ${like}
      OR i.client_ico ILIKE ${like}
      OR i.note ILIKE ${like}
      OR p.client_name ILIKE ${like}
      OR p.description ILIKE ${like}
    )`)
  }

  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

export async function loadInvoiceRegistry(params: TableParams, filters: InvoiceFilters): Promise<InvoiceRegistryScreen> {
  const filter = where(filters)
  const base = `FROM invoices i LEFT JOIN projects p ON p.id = i.project_id`

  const page: AdminQuery = {
    text: `SELECT ${INVOICE_COLUMNS}, p.description AS project_description, ${OTHER_INCOME_COUNT}
           ${base}
           ${INCOME_JOIN}
           ${filter.sql}
           ${params.orderBy}
           LIMIT $${filter.params.length + 1} OFFSET $${filter.params.length + 2}`,
    params: [...filter.params, params.limit, params.offset],
  }

  // Součty za celý filtr, ne za zobrazenou stránku. Po měnách, protože
  // koruny a eura se nesčítají.
  const totals: AdminQuery = {
    text: `SELECT i.currency,
             count(*)::int AS pocet,
             coalesce(sum(i.amount), 0)::float AS celkem,
             coalesce(sum(i.amount) FILTER (WHERE i.paid_on IS NOT NULL), 0)::float AS zaplaceno,
             count(*) FILTER (WHERE i.paid_on IS NOT NULL)::int AS zaplaceno_pocet,
             coalesce(sum(i.amount) FILTER (WHERE i.paid_on IS NULL AND i.cancelled_at IS NULL), 0)::float AS nezaplaceno,
             count(*) FILTER (WHERE i.paid_on IS NULL AND i.cancelled_at IS NULL)::int AS nezaplaceno_pocet,
             count(*) FILTER (WHERE i.paid_on IS NULL AND i.cancelled_at IS NULL AND i.due_on IS NOT NULL AND i.due_on < current_date)::int AS po_splatnosti
           ${base}
           ${filter.sql}
           GROUP BY i.currency
           ORDER BY i.currency`,
    params: filter.params,
  }

  const years: AdminQuery = {
    text: `SELECT DISTINCT date_part('year', issued_on)::int AS rok FROM invoices ORDER BY rok DESC LIMIT 30`,
    params: [],
  }

  const grand: AdminQuery = { text: `SELECT count(*)::int AS pocet FROM invoices`, params: [] }

  const projects: AdminQuery = {
    text: `SELECT id::text, client_name, description, lead_origin FROM projects ORDER BY created_at DESC LIMIT 200`,
    params: [],
  }

  const [pageRows, totalRows, yearRows, grandRows, projectRows] = await adminDb.batch([page, totals, years, grand, projects])

  const byCurrency: CurrencyTotal[] = totalRows.map((row) => ({
    currency: String(row.currency),
    count: Number(row.pocet),
    total: Number(row.celkem),
    paid: Number(row.zaplaceno),
    paidCount: Number(row.zaplaceno_pocet),
    outstanding: Number(row.nezaplaceno),
    outstandingCount: Number(row.nezaplaceno_pocet),
    overdueCount: Number(row.po_splatnosti),
  }))

  return {
    rows: (pageRows as unknown as InvoiceRegistryRow[]).map(toInvoiceRegistryItem),
    total: byCurrency.reduce((sum, item) => sum + item.count, 0),
    totals: byCurrency,
    grandTotal: Number(grandRows[0]?.pocet ?? 0),
    years: yearRows.map((row) => Number(row.rok)),
    projects: (projectRows as unknown as { id: string; client_name: string; description: string | null; lead_origin: string }[]).map(
      (row) => {
        const origin = toLeadOrigin(row.lead_origin)
        return {
          id: row.id,
          client_name: row.client_name,
          description: row.description,
          origin_label: origin === DEFAULT_LEAD_ORIGIN ? null : (LEAD_ORIGINS[origin].domain ?? LEAD_ORIGINS[origin].name),
        }
      },
    ),
  }
}
