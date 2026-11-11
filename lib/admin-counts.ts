import { batchTolerant, q } from '@/lib/admin/db'
import type { AdminCounts } from '@/lib/admin-nav'

/**
 * Počty pro odznaky v menu administrace. Od AD06 jedním požadavkem místo tří:
 * menu se kreslí na každé obrazovce, takže tohle kolo platí každá stránka.
 *
 * Tabulky z pozdějších migrací (`client_requests` = 092, `project_activity`
 * = 093) nemusí být na každé databázi, proto `batchTolerant` — bez něj by
 * jedna chybějící tabulka shodila v transakci i počty, které existují.
 */
export async function loadAdminCounts(): Promise<AdminCounts> {
  const [base, requests, drafts] = await batchTolerant([
    q`
      SELECT
        (SELECT count(*)::int FROM projects WHERE lead_pending) AS leads,
        (SELECT count(*)::int FROM notifications WHERE read = false) AS notifications
    `,
    q`SELECT count(*)::int AS count FROM client_requests WHERE status = 'new'`,
    q`SELECT count(*)::int AS count FROM project_activity WHERE status = 'draft'`,
  ])
  const row = (base[0] ?? {}) as { leads?: number; notifications?: number }
  const count = (rows: Record<string, unknown>[]): number =>
    Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
  return {
    leads: Number(row.leads ?? 0),
    notifications: Number(row.notifications ?? 0),
    requests: count(requests),
    drafts: count(drafts),
  }
}
