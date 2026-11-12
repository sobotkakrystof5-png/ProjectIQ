import 'server-only'
import { adminDb, batchTolerant, type AdminQuery } from './db'
import type { TableParams } from '@/lib/admin-table'
import type { Project } from '@/lib/types'
import type { SummaryProject } from '@/components/SummaryBar'

/**
 * Seznam zakázek `/dashboard/zakazky` (AD07).
 *
 * Dřív se načetly všechny zakázky a filtr stavu i zdroje se dělal
 * v prohlížeči (`DashboardFilters`). Teď filtruje a stránkuje databáze
 * a čísla u filtrů se počítají ze všech zakázek, ne jen ze zobrazené stránky.
 *
 * Od AD11 sem patří i to, co bývalo v Dokončených: `?status=uzavrene` ukáže
 * uzavřené zakázky (`closed_at`) a `?typ=personal` vlastní projekty bez
 * klienta. Výchozí pohled je práce pro klienty.
 */

/** Pseudostav ve filtru: není v `projects.status`, ptá se na `closed_at`. */
export const CLOSED_FILTER = 'uzavrene'

export const PROJECT_SORT = {
  pridano: { sql: 'created_at', dir: 'desc' as const },
  upraveno: { sql: 'updated_at', dir: 'desc' as const },
  klient: { sql: 'client_name', dir: 'asc' as const },
  cena: { sql: 'price', dir: 'desc' as const },
  termin: { sql: 'deadline', dir: 'asc' as const },
}

/** Kolik zakázek se bere do součtů nahoře. Víc jich v adminu nikdy nebylo. */
const SUMMARY_LIMIT = 1000

export type ProjectsScreen = {
  rows: (Project & { lead_origin?: string })[]
  total: number
  /** Počty podle stavu pro vybraný zdroj (a „all" přes všechny stavy, `uzavrene` zvlášť). */
  counts: Record<string, number>
  /** Kolik je zakázek pro klienty a kolik vlastních projektů. */
  typeCounts: { client: number; personal: number }
  summary: SummaryProject[]
  /** Kolik nevyřízených požadavků má která zakázka na téhle stránce. */
  openRequests: Record<string, number>
}

function where(origin: string | null, status: string | null, type: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [type]
  const parts = ['NOT lead_pending', 'project_type = $1']
  if (origin) {
    params.push(origin)
    parts.push(`lead_origin = $${params.length}`)
  }
  if (status === CLOSED_FILTER) {
    parts.push('closed_at IS NOT NULL')
  } else if (status) {
    params.push(status)
    parts.push(`status = $${params.length}`)
  }
  return { sql: `WHERE ${parts.join(' AND ')}`, params }
}

export async function loadProjectsScreen(
  params: TableParams,
  origin: string | null,
  status: string | null,
  type: string = 'client',
): Promise<ProjectsScreen> {
  const filter = where(origin, status, type)
  const originOnly = where(origin, null, type)

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
  // Uzavřené a počty druhů jdou mimo `GROUP BY status` — jeden řádek navíc
  // v téže dávce, ne další kolo do databáze.
  const extra: AdminQuery = {
    text: `SELECT
             count(*) FILTER (WHERE closed_at IS NOT NULL AND project_type = $1)::int AS uzavrene,
             count(*) FILTER (WHERE project_type = 'client')::int AS klienti,
             count(*) FILTER (WHERE project_type = 'personal')::int AS vlastni
           FROM projects WHERE NOT lead_pending`,
    params: [type],
  }
  const summary: AdminQuery = {
    text: `SELECT status, price, paid, deposit_amount, deposit_paid
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
  const extraRow = extraRows[0] as { uzavrene?: number; klienti?: number; vlastni?: number } | undefined
  byStatus[CLOSED_FILTER] = Number(extraRow?.uzavrene ?? 0)
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
