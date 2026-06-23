import Link from 'next/link'
import { sql } from '@/lib/db'
import {
  Briefcase,
  GraduationCap,
  TrendingUp,
  Dumbbell,
  ArrowUpRight,
  Clock,
  CreditCard,
  FolderOpen,
  CalendarDays,
  Activity,
  Scale,
  Flame,
  BookOpen,
  AlertCircle,
} from 'lucide-react'

function formatCZK(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const target = new Date(date)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))

  if (diffMs < 0) return 'Minulost'
  if (diffHours < 1) return 'Brzy'
  if (diffHours < 24) return `Za ${diffHours} h`
  if (diffDays === 1) return 'Zítra'
  if (diffDays < 7) return `Za ${diffDays} dní`
  return target.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

async function getBusinessStats() {
  const [projectRows, consultRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status NOT IN ('done', 'paid')
          AND NOT (source = 'vizeon_web' AND (vizeon_confirmed = false OR vizeon_confirmed IS NULL))
        )::int AS active_count,
        COALESCE(SUM(price) FILTER (
          WHERE paid = false AND price IS NOT NULL
          AND NOT (source = 'vizeon_web' AND (vizeon_confirmed = false OR vizeon_confirmed IS NULL))
        ), 0)::numeric AS pending_revenue,
        COUNT(*) FILTER (WHERE status = 'review')::int AS review_count
      FROM projects
    `,
    sql`
      SELECT cs.scheduled_at, p.client_name
      FROM consultation_slots cs
      JOIN projects p ON cs.project_id = p.id
      WHERE cs.scheduled_at > now()
      ORDER BY cs.scheduled_at
      LIMIT 1
    `,
  ])

  const stats = projectRows[0] as {
    active_count: number
    pending_revenue: number
    review_count: number
  }
  const nextConsult = consultRows[0] as { scheduled_at: string; client_name: string } | undefined

  return { ...stats, nextConsult }
}

async function getSportStats() {
  const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD in local time
  const [scoreRows, calRows, wkRows, weightRows] = await Promise.all([
    sql`
      SELECT score::float AS score, scored_date::text AS score_date
      FROM health_scores
      WHERE user_id IS NULL
      ORDER BY scored_date DESC
      LIMIT 1
    `,
    sql`
      SELECT COALESCE(SUM(calories), 0)::int AS kcal
      FROM nutrition_logs
      WHERE user_id IS NULL AND logged_date = ${today}
    `,
    sql`
      SELECT COUNT(*)::int AS cnt
      FROM workout_logs
      WHERE user_id IS NULL
        AND logged_date >= CURRENT_DATE - INTERVAL '30 days'
    `,
    sql`
      SELECT weight_kg::float AS weight_kg
      FROM weight_logs
      WHERE user_id IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
  ])
  return {
    latestScore: (scoreRows[0] as { score: number; score_date: string } | undefined)?.score ?? null,
    todayKcal: (calRows[0] as { kcal: number }).kcal,
    workoutsLast30: (wkRows[0] as { cnt: number }).cnt,
    latestWeight: (weightRows[0] as { weight_kg: number } | undefined)?.weight_kg ?? null,
  }
}

async function getSchoolStats() {
  const [upcomingRows, nextRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS cnt
      FROM school_deadlines_manual
      WHERE done = false AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
    `,
    sql`
      SELECT title, type, due_date::text AS due_date
      FROM school_deadlines_manual
      WHERE done = false AND due_date >= CURRENT_DATE
      ORDER BY due_date ASC
      LIMIT 1
    `,
  ])
  const next = nextRows[0] as { title: string; type: string; due_date: string } | undefined
  return {
    upcomingCount: (upcomingRows[0] as { cnt: number }).cnt,
    nextDeadline: next ?? null,
  }
}

const DEADLINE_TYPE_LABEL: Record<string, string> = {
  klassenarbeit: 'KA',
  homework: 'DÚ',
  presentation: 'Referát',
  other: 'Jiné',
}

export default async function HubPage() {
  const [business, sport, school] = await Promise.all([
    getBusinessStats(),
    getSportStats(),
    getSchoolStats(),
  ])
  const { active_count, pending_revenue, review_count, nextConsult } = business

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Přehled</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tvůj osobní command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Business */}
        <Link
          href="/dashboard"
          className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-brand-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 brand-gradient rounded-xl flex items-center justify-center shadow-sm">
              <Briefcase size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Business</h2>

          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <FolderOpen size={13} strokeWidth={1.5} />
                Aktivní zakázky
              </span>
              <span className="font-semibold text-foreground tabular-nums">{active_count}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <CreditCard size={13} strokeWidth={1.5} />
                Čeká na platbu
              </span>
              <span className="font-semibold text-foreground tabular-nums">{formatCZK(pending_revenue)}</span>
            </div>
            {review_count > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock size={13} strokeWidth={1.5} />
                  Čeká na schválení
                </span>
                <span className="font-semibold text-amber-600 tabular-nums">{review_count}</span>
              </div>
            )}
            {nextConsult && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays size={13} strokeWidth={1.5} />
                  Příští konzultace
                </span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatRelativeTime(nextConsult.scheduled_at)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors">
              Otevřít Zakázky →
            </span>
          </div>
        </Link>

        {/* Finance */}
        <Link
          href="/hub/finance"
          className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-emerald-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm">
              <TrendingUp size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-emerald-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Finance</h2>

          <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">
                VWCE
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5">
                IWDA
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center">ETF tracker · Cash flow · Kalkulačky</p>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors">
              Otevřít Finance →
            </span>
          </div>
        </Link>

        {/* Škola */}
        <Link
          href="/hub/school"
          className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-violet-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-sm">
              <GraduationCap size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-violet-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Škola</h2>

          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <AlertCircle size={13} strokeWidth={1.5} />
                Termíny tento týden
              </span>
              <span className={`font-semibold tabular-nums ${school.upcomingCount > 0 ? 'text-violet-700' : 'text-foreground'}`}>
                {school.upcomingCount}
              </span>
            </div>
            {school.nextDeadline ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <BookOpen size={13} strokeWidth={1.5} />
                  Příště
                </span>
                <span className="font-semibold text-foreground tabular-nums text-right max-w-[140px] truncate" title={school.nextDeadline.title}>
                  {DEADLINE_TYPE_LABEL[school.nextDeadline.type] ?? school.nextDeadline.type}
                  {' '}·{' '}
                  {new Date(school.nextDeadline.due_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ) : (
              <div className="flex items-center text-sm text-muted-foreground gap-1.5">
                <BookOpen size={13} strokeWidth={1.5} />
                Žádné nadcházející termíny
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-violet-600 group-hover:text-violet-700 transition-colors">
              Otevřít Školu →
            </span>
          </div>
        </Link>

        {/* Sport & Zdraví */}
        <Link
          href="/hub/sport"
          className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-rose-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-sm">
              <Dumbbell size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-rose-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Sport & Zdraví</h2>

          <div className="space-y-2.5 flex-1">
            {sport.latestScore !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Activity size={13} strokeWidth={1.5} />
                  Health Score
                </span>
                <span className={`font-semibold tabular-nums ${sport.latestScore >= 75 ? 'text-emerald-600' : sport.latestScore >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {sport.latestScore.toFixed(0)} / 100
                </span>
              </div>
            )}
            {sport.todayKcal > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Flame size={13} strokeWidth={1.5} />
                  Dnes kcal
                </span>
                <span className="font-semibold text-foreground tabular-nums">{sport.todayKcal} kcal</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Dumbbell size={13} strokeWidth={1.5} />
                Tréninky (30 d.)
              </span>
              <span className="font-semibold text-foreground tabular-nums">{sport.workoutsLast30}</span>
            </div>
            {sport.latestWeight !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Scale size={13} strokeWidth={1.5} />
                  Váha
                </span>
                <span className="font-semibold text-foreground tabular-nums">{sport.latestWeight} kg</span>
              </div>
            )}
            {sport.latestScore === null && sport.todayKcal === 0 && sport.workoutsLast30 === 0 && sport.latestWeight === null && (
              <p className="text-sm text-muted-foreground">Zatím žádná data — začni logovat!</p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-rose-600 group-hover:text-rose-700 transition-colors">
              Otevřít Sport & Zdraví →
            </span>
          </div>
        </Link>
      </div>
    </div>
  )
}
