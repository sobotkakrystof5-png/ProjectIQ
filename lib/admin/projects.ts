import 'server-only'
import { adminDb, batchTolerant, type AdminQuery } from './db'
import { extraDepositsSql } from './project-payments'
import type { TableParams } from '@/lib/admin-table'
import type { Project, ProjectStatus } from '@/lib/types'
import type { SummaryProject } from '@/components/SummaryBar'

/**
 * Seznamy zakázek `/dashboard/zakazky` a `/dashboard/zakazky/dokoncene`.
 *
 * Od AD07 filtruje a stránkuje databáze a čísla u filtrů se počítají ze
 * všech zakázek, ne jen ze zobrazené stránky.
 *
 * Od 2026-11-15 (R-109) jsou to dva oddělené výpisy: Zakázky ukazují jen
 * rozpracovanou práci a Dokončené hotové a zaplacené zakázky. `?typ=personal`
 * ukáže vlastní projekty bez klienta, výchozí pohled je práce pro klienty.
 */

/** Který výpis: rozpracované, nebo dokončené zakázky. */
export type ProjectScope = 'active' | 'finished'

/**
 * Dokončená zakázka: uzavřená, nebo ve stavu hotovo/zaplaceno. Stejná
 * podmínka jako u dotazníku (`lib/admin/surveys.ts`), aby se zakázka
 * nepočítala jinde jako hotová a tady jako rozpracovaná.
 */
const FINISHED_SQL = `(closed_at IS NOT NULL OR status IN ('done', 'paid'))`
const SCOPE_SQL: Record<ProjectScope, string> = {
  active: `NOT ${FINISHED_SQL}`,
  finished: FINISHED_SQL,
}

/** Stavy, podle kterých jde ve výpisu filtrovat. */
export const SCOPE_STATUSES: Record<ProjectScope, ProjectStatus[]> = {
  active: ['new', 'in_progress', 'review'],
  finished: ['done', 'paid'],
}

export const PROJECT_SORT = {
  pridano: { sql: 'created_at', dir: 'desc' as const },
  upraveno: { sql: 'updated_at', dir: 'desc' as const },
  klient: { sql: 'client_name', dir: 'asc' as const },
  cena: { sql: 'price', dir: 'desc' as const },
  termin: { sql: 'deadline', dir: 'asc' as const },
  // Dokončené: naposledy uzavřené nahoře; starší zakázka bez `closed_at`
  // se řadí podle poslední změny.
  uzavreno: { sql: 'COALESCE(closed_at::timestamptz, updated_at)', dir: 'desc' as const },
}

/** Kolik zakázek se bere do součtů nahoře. Víc jich v adminu nikdy nebylo. */
const SUMMARY_LIMIT = 1000

export type ProjectsScreen = {
  rows: (Project & { lead_origin?: string })[]
  total: number
  /** Počty podle stavu pro vybraný zdroj a výpis („all" přes všechny jeho stavy). */
  counts: Record<string, number>
  /** Kolik je ve výpisu zakázek pro klienty a kolik vlastních projektů. */
  typeCounts: { client: number; personal: number }
  summary: SummaryProject[]
  /** Kolik nevyřízených požadavků má která zakázka na téhle stránce. */
  openRequests: Record<string, number>
}

function where(
  scope: ProjectScope,
  origin: string | null,
  status: string | null,
  type: string | null,
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const parts = ['NOT lead_pending', SCOPE_SQL[scope]]
  if (type) {
    params.push(type)
    parts.push(`project_type = $${params.length}`)
  }
  if (origin) {
    params.push(origin)
    parts.push(`lead_origin = $${params.length}`)
  }
  if (status) {
    params.push(status)
    parts.push(`status = $${params.length}`)
  }
  return { sql: `WHERE ${parts.join(' AND ')}`, params }
}

/** Stav z adresy, jen pokud do výpisu patří (jinak bez filtru). */
export function scopeStatus(scope: ProjectScope, raw: string | null | undefined): ProjectStatus | null {
  return raw && (SCOPE_STATUSES[scope] as string[]).includes(raw) ? (raw as ProjectStatus) : null
}

export async function loadProjectsScreen(
  scope: ProjectScope,
  params: TableParams,
  origin: string | null,
  status: ProjectStatus | null,
  type: string = 'client',
): Promise<ProjectsScreen> {
  const filter = where(scope, origin, status, type)
  const originOnly = where(scope, origin, null, type)
  const scopeOnly = where(scope, null, null, null)

  const page: AdminQuery = {
    text: `SELECT * FROM projects ${filter.sql} ${params.orderBy}
           LIMIT $${filter.params.length + 1} OFFSET $${filter.params.length + 2}`,
    params: [...filter.params, params.limit, params.offset],
  }
  // Počty u filtrů a součty nahoře ignorují vybraný stav — jinak by se
  // čísla měnila podle toho, co je zrovna vyfiltrované.
  const counts: AdminQuery = {
    text: `SELECT status, count(*)::int AS pocet FROM projects ${originOnly.sql} GROUP BY status`,
    params: originOnly.params,
  }
  // Počty druhů jdou mimo `GROUP BY status` — jeden řádek navíc v téže
  // dávce, ne další kolo do databáze.
  const extra: AdminQuery = {
    text: `SELECT
             count(*) FILTER (WHERE project_type = 'client')::int AS klienti,
             count(*) FILTER (WHERE project_type = 'personal')::int AS vlastni
           FROM projects ${scopeOnly.sql}`,
    params: scopeOnly.params,
  }
  const summary: AdminQuery = {
    text: `SELECT status, price, paid, deposit_amount, deposit_paid,
                  ${extraDepositsSql('projects')}::float AS extra_deposits
           FROM projects ${originOnly.sql} ORDER BY created_at DESC LIMIT $${originOnly.params.length + 1}`,
    params: [...originOnly.params, SUMMARY_LIMIT],
  }

  const [pageRows, countRows, extraRows, summaryRows] = await adminDb.batch([page, counts, extra, summary])

  const byStatus: Record<string, number> = { all: 0 }
  for (const row of countRows) {
    const key = String(row.status)
    byStatus[key] = Number(row.pocet)
    byStatus.all += Number(row.pocet)
  }
  const extraRow = extraRows[0] as { klienti?: number; vlastni?: number } | undefined
  const byType = {
    client: Number(extraRow?.klienti ?? 0),
    personal: Number(extraRow?.vlastni ?? 0),
  }

  const rows = pageRows as unknown as (Project & { lead_origin?: string })[]
  const ids = rows.map((p) => p.id)
  const openRequests: Record<string, number> = {}
  if (ids.length > 0) {
    // `client_requests` je z migrace 092 a nemusí všude existovat.
    const [requestRows] = await batchTolerant([
      {
        text: `SELECT project_id::text, count(*)::int AS pocet
               FROM client_requests WHERE status = 'new' AND project_id = ANY($1::uuid[])
               GROUP BY project_id`,
        params: [ids],
      },
    ])
    for (const row of requestRows) openRequests[String(row.project_id)] = Number(row.pocet)
  }

  return {
    rows,
    total: status ? (byStatus[status] ?? 0) : byStatus.all,
    counts: byStatus,
    typeCounts: byType,
    summary: summaryRows as unknown as SummaryProject[],
    openRequests,
  }
}
