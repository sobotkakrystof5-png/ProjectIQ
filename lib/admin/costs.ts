import 'server-only'
import { adminDb, type AdminQuery } from './db'
import type { TableParams } from '@/lib/admin-table'
import type { Cost } from '@/lib/types'

/**
 * Náklady `/dashboard/naklady` (AD07). Řazení, stránkování i součty dělá
 * databáze; dřív se stáhly všechny řádky a sčítaly se v prohlížeči.
 */

export const COST_SORT = {
  nazev: { sql: 'c.name', dir: 'asc' as const },
  castka: { sql: 'c.amount', dir: 'desc' as const },
  typ: { sql: 'c.cost_type', dir: 'asc' as const },
  kategorie: { sql: 'c.category', dir: 'asc' as const },
  zakazka: { sql: 'p.client_name', dir: 'asc' as const },
  pridano: { sql: 'c.created_at', dir: 'desc' as const },
}

export type CostKindFilter = 'vse' | 'fixni' | 'jednorazove'

export const COST_KIND_FILTERS: { value: CostKindFilter; label: string }[] = [
  { value: 'vse', label: 'Všechny' },
  { value: 'fixni', label: 'Fixní' },
  { value: 'jednorazove', label: 'Jednorázové' },
]

export function toCostKind(value: unknown): CostKindFilter {
  return COST_KIND_FILTERS.some((f) => f.value === value) ? (value as CostKindFilter) : 'vse'
}

/** Náklad ve výpisu: navíc jméno zakázky, ke které patří. */
export type CostRow = Cost & { project_client_name: string | null }

export type CostTotals = {
  monthly: number
  annual: number
  /** Měsíční × 12 + roční. */
  yearly: number
  oneTime: number
  client: number
  personal: number
  counts: Record<CostKindFilter, number>
}

export type CostsScreen = { rows: CostRow[]; total: number; totals: CostTotals }

const COLUMNS = `c.id::text, c.name, c.amount::float AS amount, c.cost_type, c.category,
  c.description, c.project_id::text, c.source_finance_transaction_id::text,
  c.created_at::text, p.client_name AS project_client_name`

function where(kind: CostKindFilter): string {
  if (kind === 'fixni') return `WHERE c.cost_type IN ('fixed_monthly', 'fixed_annual')`
  if (kind === 'jednorazove') return `WHERE c.cost_type = 'one_time'`
  return ''
}

export async function loadCostsScreen(params: TableParams, kind: CostKindFilter): Promise<CostsScreen> {
  const page: AdminQuery = {
    text: `SELECT ${COLUMNS}
           FROM costs c LEFT JOIN projects p ON p.id = c.project_id
           ${where(kind)}
           ${params.orderBy}
           LIMIT $1 OFFSET $2`,
    params: [params.limit, params.offset],
  }

  // Součty za všechny náklady, ne za zobrazenou stránku — dlaždice nahoře
  // mají říkat, jak na tom je celé podnikání.
  const totals: AdminQuery = {
    text: `SELECT
             coalesce(sum(amount) FILTER (WHERE cost_type = 'fixed_monthly'), 0)::float AS mesicne,
             coalesce(sum(amount) FILTER (WHERE cost_type = 'fixed_annual'), 0)::float AS rocne,
             coalesce(sum(amount) FILTER (WHERE cost_type = 'one_time'), 0)::float AS jednorazove,
             coalesce(sum(amount) FILTER (WHERE category = 'client'), 0)::float AS zakazky,
             coalesce(sum(amount) FILTER (WHERE category = 'personal'), 0)::float AS osobni,
             count(*)::int AS pocet,
             count(*) FILTER (WHERE cost_type IN ('fixed_monthly', 'fixed_annual'))::int AS fixni_pocet,
             count(*) FILTER (WHERE cost_type = 'one_time')::int AS jednorazove_pocet
           FROM costs`,
    params: [],
  }

  const [pageRows, totalRows] = await adminDb.batch([page, totals])
  const t = totalRows[0] ?? {}
  const monthly = Number(t.mesicne ?? 0)
  const annual = Number(t.rocne ?? 0)

  return {
    rows: pageRows as unknown as CostRow[],
    total:
      kind === 'fixni'
        ? Number(t.fixni_pocet ?? 0)
        : kind === 'jednorazove'
          ? Number(t.jednorazove_pocet ?? 0)
          : Number(t.pocet ?? 0),
    totals: {
      monthly,
      annual,
      yearly: monthly * 12 + annual,
      oneTime: Number(t.jednorazove ?? 0),
      client: Number(t.zakazky ?? 0),
      personal: Number(t.osobni ?? 0),
      counts: {
        vse: Number(t.pocet ?? 0),
        fixni: Number(t.fixni_pocet ?? 0),
        jednorazove: Number(t.jednorazove_pocet ?? 0),
      },
    },
  }
}
