import 'server-only'
import { neon } from '@neondatabase/serverless'
import type { TableParams } from '@/lib/admin-table'
import type { WaitlistEntry } from '@/lib/types'

/**
 * Waitlist startupového projektu (AD07).
 *
 * Tahle tabulka **není** v databázi adminu — leží v databázi toho produktu
 * (`startup_projects.waitlist_db_url`), proto se nepoužívá `adminDb`.
 * Do AD07 se stáhly všechny zápisy a hledalo se v prohlížeči; waitlist
 * ale může mít tisíce e-mailů, takže se řadí, hledá a stránkuje v databázi.
 */

export const WAITLIST_SORT = {
  jmeno: { sql: 'name', dir: 'asc' as const },
  email: { sql: 'email', dir: 'asc' as const },
  jazyk: { sql: 'locale', dir: 'asc' as const },
  zapsan: { sql: 'created_at', dir: 'desc' as const },
  stav: { sql: 'launch_notified', dir: 'asc' as const },
}

export type WaitlistScreen = {
  rows: WaitlistEntry[]
  /** Kolik zápisů odpovídá hledání. */
  matched: number
  total: number
  notified: number
  pending: number
}

/** Nejvíc řádků, které jde vyvézt do CSV najednou. */
const EXPORT_LIMIT = 10_000

export async function loadWaitlist(dbUrl: string, params: TableParams, query: string): Promise<WaitlistScreen> {
  const empty: WaitlistScreen = { rows: [], matched: 0, total: 0, notified: 0, pending: 0 }
  try {
    const wsql = neon(dbUrl, { fetchOptions: { cache: 'no-store' } })
    const search = query.trim()
    const filter = search ? `WHERE email ILIKE $1 OR name ILIKE $1` : ''
    const filterParams = search ? [`%${search}%`] : []

    // `params.orderBy` je složené z `WAITLIST_SORT`, hodnoty z adresy jdou vždy parametrem.
    const [rows, counts] = await Promise.all([
      wsql.query(
        `SELECT id, email, name, locale, created_at::text, launch_notified
         FROM waitlist ${filter} ${params.orderBy}
         LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
        [...filterParams, params.limit, params.offset],
      ),
      wsql.query(
        `SELECT count(*)::int AS celkem,
                count(*) FILTER (WHERE launch_notified)::int AS notifikovani,
                count(*) FILTER (WHERE ${search ? 'email ILIKE $1 OR name ILIKE $1' : 'true'})::int AS nalezeno
         FROM waitlist`,
        filterParams,
      ),
    ])

    const c = (counts as Record<string, unknown>[])[0] ?? {}
    const total = Number(c.celkem ?? 0)
    const notified = Number(c.notifikovani ?? 0)
    return {
      rows: rows as unknown as WaitlistEntry[],
      matched: Number(c.nalezeno ?? 0),
      total,
      notified,
      pending: total - notified,
    }
  } catch {
    // Cizí databáze nemusí být dostupná (chybná adresa, vypnutý projekt).
    return empty
  }
}

/** Všechny zápisy do CSV. Stropem `EXPORT_LIMIT`, ať se nestahuje bez konce. */
export async function loadWaitlistForExport(dbUrl: string): Promise<WaitlistEntry[]> {
  try {
    const wsql = neon(dbUrl, { fetchOptions: { cache: 'no-store' } })
    const rows = await wsql.query(
      `SELECT id, email, name, locale, created_at::text, launch_notified
       FROM waitlist ORDER BY created_at DESC LIMIT $1`,
      [EXPORT_LIMIT],
    )
    return rows as unknown as WaitlistEntry[]
  } catch {
    return []
  }
}
