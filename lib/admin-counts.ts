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
        (SELECT count(*)::int FROM projects WHERE business = 'vizeon' AND is_vizeon_pending(source, vizeon_confirmed)) AS vizeon,
        (SELECT count(*)::int FROM projects WHERE business = 'alteno' AND is_alteno_pending(source, alteno_confirmed)) AS alteno,
        (SELECT count(*)::int FROM notifications WHERE read = false) AS notifications
    `,
    sql`SELECT count(*)::int AS count FROM client_requests WHERE status = 'new'`.catch(() => [{ count: 0 }]),
    sql`SELECT count(*)::int AS count FROM project_activity WHERE status = 'draft'`.catch(() => [{ count: 0 }]),
  ])
  const row = base[0] as { vizeon: number; alteno: number; notifications: number }
  return {
    vizeon: row.vizeon,
    alteno: row.alteno,
    notifications: row.notifications,
    requests: (requests[0] as { count: number }).count,
    drafts: (drafts[0] as { count: number }).count,
  }
}
