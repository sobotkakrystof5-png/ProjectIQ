import { sql } from '@/lib/db'
import type { AdminCounts } from '@/lib/admin-nav'

/**
 * Počty pro odznaky v menu administrace jedním dotazem. Tabulky vznikající
 * pozdějšími migracemi (client_requests = 092, project_activity = 093) se
 * ošetřují zvlášť, aby menu nespadlo před jejich nasazením.
 */
export async function loadAdminCounts(): Promise<AdminCounts> {
  const [base, requests, drafts] = await Promise.all([
    sql`
      SELECT
        (SELECT count(*)::int FROM projects WHERE lead_pending) AS leads,
        (SELECT count(*)::int FROM notifications WHERE read = false) AS notifications
    `,
    sql`SELECT count(*)::int AS count FROM client_requests WHERE status = 'new'`.catch(() => [{ count: 0 }]),
    sql`SELECT count(*)::int AS count FROM project_activity WHERE status = 'draft'`.catch(() => [{ count: 0 }]),
  ])
  const row = base[0] as { leads: number; notifications: number }
  return {
    leads: row.leads,
    notifications: row.notifications,
    requests: (requests[0] as { count: number }).count,
    drafts: (drafts[0] as { count: number }).count,
  }
}
