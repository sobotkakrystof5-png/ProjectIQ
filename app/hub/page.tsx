import Link from 'next/link'
import { sql } from '@/lib/db'
import {
  Briefcase,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CreditCard,
  FolderOpen,
  CalendarDays,
  Layers,
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
          AND NOT is_vizeon_pending(source, vizeon_confirmed)
          AND NOT is_alteno_pending(source, alteno_confirmed)
        )::int AS active_count,
        COALESCE(SUM(price) FILTER (
          WHERE paid = false AND price IS NOT NULL
          AND NOT is_vizeon_pending(source, vizeon_confirmed)
          AND NOT is_alteno_pending(source, alteno_confirmed)
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

export default async function HubPage() {
  const { active_count, pending_revenue, review_count, nextConsult } = await getBusinessStats()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Přehled</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tvůj osobní command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Business */}
        <Link
          href="/hub/byznys"
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

        {/* Projekty */}
        <Link
          href="/hub/projekty"
          className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-sm">
              <Layers size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-indigo-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Projekty</h2>

          <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">
                Aplikace
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5">
                Automatizace
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center">Vlastní produkty · Systémy · Nápady</p>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 transition-colors">
              Otevřít Projekty →
            </span>
          </div>
        </Link>
      </div>
    </div>
  )
}
