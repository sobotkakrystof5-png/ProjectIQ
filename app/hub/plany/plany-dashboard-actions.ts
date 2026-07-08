'use server'

import { sql } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface PlanyDashboardStats {
  skola: { activeCount: number; nearestDate: string | null }
  sport: { activeCount: number }
  projekty: { validaceCount: number }
  byznys: { readyCount: number }
  finance: { nearestGoalPct: number | null; nearestGoalTitle: string | null }
}

export interface UpcomingDeadline {
  source: 'skola' | 'sport' | 'finance' | 'byznys'
  title: string
  target_date: string
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getPlanyDashboardStats(): Promise<PlanyDashboardStats> {
  await requireAuth()

  const [skolaRows, sportRows, projektyRows, byznysRows, financeRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS active_count, MIN(target_date)::text AS nearest_date
      FROM plan_school_goals WHERE archived = false AND status = 'aktivni'
    `,
    sql`SELECT COUNT(*)::int AS active_count FROM plan_health_goals WHERE archived = false AND status = 'aktivni'`,
    sql`SELECT COUNT(*)::int AS validace_count FROM plan_projects WHERE archived = false AND status = 'validace'`,
    sql`SELECT COUNT(*)::int AS ready_count FROM plan_businesses WHERE archived = false AND status = 'pripraveno_k_exportu'`,
    sql`
      SELECT title, target_amount::float, current_amount::float
      FROM plan_finance_goals
      WHERE archived = false
      ORDER BY target_date ASC NULLS LAST, created_at ASC
      LIMIT 1
    `,
  ])

  const skola = skolaRows[0] as { active_count: number; nearest_date: string | null }
  const sport = sportRows[0] as { active_count: number }
  const projekty = projektyRows[0] as { validace_count: number }
  const byznys = byznysRows[0] as { ready_count: number }
  const financeGoal = financeRows[0] as { title: string; target_amount: number; current_amount: number } | undefined

  return {
    skola: { activeCount: skola.active_count, nearestDate: skola.nearest_date },
    sport: { activeCount: sport.active_count },
    projekty: { validaceCount: projekty.validace_count },
    byznys: { readyCount: byznys.ready_count },
    finance: {
      nearestGoalPct: financeGoal && financeGoal.target_amount > 0
        ? Math.round((financeGoal.current_amount / financeGoal.target_amount) * 100)
        : null,
      nearestGoalTitle: financeGoal?.title ?? null,
    },
  }
}

export async function getUpcomingDeadlines(): Promise<UpcomingDeadline[]> {
  await requireAuth()
  const rows = await sql`
    SELECT title, target_date::text, 'skola' AS source
    FROM plan_school_goals
    WHERE archived = false AND target_date IS NOT NULL AND target_date >= CURRENT_DATE
    UNION ALL
    SELECT title, target_date::text, 'sport' AS source
    FROM plan_health_goals
    WHERE archived = false AND target_date IS NOT NULL AND target_date >= CURRENT_DATE
    UNION ALL
    SELECT title, target_date::text, 'finance' AS source
    FROM plan_finance_goals
    WHERE archived = false AND target_date IS NOT NULL AND target_date >= CURRENT_DATE
    UNION ALL
    SELECT pb.title || ' — ' || pbp.title AS title, pbp.target_date::text, 'byznys' AS source
    FROM plan_business_phases pbp
    JOIN plan_businesses pb ON pb.id = pbp.business_id
    WHERE pbp.target_date IS NOT NULL AND pbp.target_date >= CURRENT_DATE AND pb.archived = false
    ORDER BY target_date ASC
    LIMIT 5
  `
  return rows as UpcomingDeadline[]
}
