import { PageShell } from '@/components/ws/app/page-header'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import {
  Briefcase, CheckCircle2, Clock, TrendingUp, Wallet,
  AlertCircle, Users, Inbox, PhoneCall, Star, BarChart3,
  Receipt, CalendarCheck, CircleDot, ArrowRight,
} from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'
import { STATUS_LABELS } from '@/lib/types'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import PerformanceOverview from '@/components/PerformanceOverview'
import { HodnoceniDashboard } from '@/components/HodnoceniDashboard'
import { loadPerformanceScreen } from '@/lib/admin/closed'

async function loadStats() {
  const [
    projectStats,
    vizeonStats,
    consultationStats,
    feedbackStats,
    completedStats,
    costsStats,
    uniqueClients,
    firstProject,
    surveyStats,
  ] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        COUNT(*) FILTER (WHERE status = 'review')::int AS review_count,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done_count,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
        COALESCE(SUM(price), 0)::numeric AS total_price,
        COALESCE(SUM(price) FILTER (WHERE paid = true), 0)::numeric AS paid_price,
        COALESCE(SUM(price) FILTER (WHERE status = 'done' AND paid = false), 0)::numeric AS unpaid_price
      FROM projects
      WHERE NOT lead_pending
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE lead_confirmed)::int AS confirmed,
        COUNT(*) FILTER (WHERE lead_pending)::int AS pending
      FROM projects
      WHERE source IS NOT NULL AND source <> 'manual'
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE scheduled_at < now())::int AS past,
        COUNT(*) FILTER (WHERE scheduled_at > now())::int AS upcoming
      FROM consultation_slots
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        ROUND(AVG(nps), 1)::numeric AS avg_nps
      FROM client_feedback
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(price), 0)::numeric AS revenue
      FROM projects
      WHERE closed_at IS NOT NULL AND NOT lead_pending
    `,
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN cost_type = 'fixed_monthly' THEN amount
                         WHEN cost_type = 'fixed_annual' THEN amount / 12.0
                         ELSE 0 END), 0)::numeric AS monthly_costs
      FROM costs
    `,
    sql`
      SELECT COUNT(DISTINCT client_name)::int AS total
      FROM projects
      WHERE NOT lead_pending
        AND client_name IS NOT NULL
    `,
    sql`
      SELECT created_at FROM projects ORDER BY created_at ASC LIMIT 1
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        ROUND(AVG(
          (rating_cooperation + rating_speed + rating_design +
           rating_functionality + rating_reliability + rating_flexibility) / 6.0
        ), 2)::numeric AS avg_overall
      FROM project_surveys
    `,
  ])

  return {
    projects: projectStats[0] as {
      total: number; new_count: number; in_progress_count: number;
      review_count: number; done_count: number; paid_count: number;
      total_price: number; paid_price: number; unpaid_price: number;
    },
    vizeon: vizeonStats[0] as { total: number; confirmed: number; pending: number },
    consultations: consultationStats[0] as { total: number; past: number; upcoming: number },
    feedback: feedbackStats[0] as { total: number; avg_nps: number | null },
    completed: completedStats[0] as { total: number; revenue: number },
    costs: costsStats[0] as { monthly_costs: number },
    uniqueClients: (uniqueClients[0] as { total: number }).total,
    firstProjectAt: firstProject[0]
      ? new Date((firstProject[0] as { created_at: string }).created_at)
      : null,
    surveys: surveyStats[0] as { total: number; avg_overall: number | null },
  }
}

function StatCard({
  icon, iconBg, label, value, sub,
}: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string
}) {
  return (
    <div className="bg-surface border border-navy-100 rounded-chip p-4 shadow-sm flex flex-col gap-1">
      <div className={`w-8 h-8 ${iconBg} rounded-chip flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-quiet font-medium">{label}</p>
      <p className="text-xl font-semibold text-ink tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs text-quiet">{sub}</p>}
    </div>
  )
}

function PipelineBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-quiet shrink-0">{label}</div>
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-xs font-semibold text-ink tabular-nums">{count}</div>
      <div className="w-7 text-right text-xs text-quiet tabular-nums">{pct}%</div>
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-quiet">{icon}</div>
      <h2 className="text-sm font-semibold text-ink tracking-tight uppercase text-[11px] letter-spacing-wider">
        {title}
      </h2>
    </div>
  )
}

export default async function ProfilPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Dvě nezávislá čtení — souhrn profilu a podklady pro přehled výkonnosti.
  const [stats, performance] = await Promise.all([loadStats(), loadPerformanceScreen()])
  const { projects, vizeon, consultations, feedback, completed, costs, uniqueClients, firstProjectAt, surveys } = stats

  const email = session.user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()

  const activeCount = projects.new_count + projects.in_progress_count + projects.review_count
  const closedCount = projects.done_count + projects.paid_count
  const conversionRate = vizeon.total > 0
    ? Math.round((vizeon.confirmed / vizeon.total) * 100)
    : null

  const memberSince = firstProjectAt
    ? new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(firstProjectAt)
    : null

  const npsLabel =
    feedback.avg_nps === null ? '—'
    : feedback.avg_nps >= 9 ? 'Promoter'
    : feedback.avg_nps >= 7 ? 'Pasivní'
    : 'Kritik'

  const npsColor = feedback.avg_nps === null ? 'text-quiet' : 'text-ink'

  const overallRating = surveys.avg_overall !== null ? Number(surveys.avg_overall) : null
  const overallStars = overallRating !== null ? Math.round(overallRating) : 0

  return (
    <PageShell width="narrow" className="gap-8">

      {/* Profil header */}
      <div className="flex items-start gap-5 rounded-panel border border-navy-100 bg-surface p-6">
        {/* Fotka */}
        <ProfileAvatar initials={initials} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Váš přehled</h1>
          <p className="mt-0.5 font-num text-sm text-quiet">{email}</p>
          {memberSince && (
            <p className="mt-0.5 text-xs text-quiet">
              Aktivní od {memberSince} · {projects.total} zakázek celkem
            </p>
          )}

          {/* Overall rating */}
          {overallRating !== null ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    size={14}
                    strokeWidth={1.5}
                    className={i <= overallStars ? 'fill-navy-700 text-navy-700' : 'text-navy-200'}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {overallRating.toFixed(1)}
              </span>
              <span className="text-xs text-quiet">
                / 5 · průměr z {surveys.total} {surveys.total === 1 ? 'hodnocení' : 'hodnocení'}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-xs text-quiet">Zatím žádné hodnocení z dotazníků</p>
          )}
        </div>
      </div>

      {/* Klíčové KPI */}
      <div>
        <SectionHeader icon={<BarChart3 size={14} strokeWidth={1.5} />} title="Klíčové metriky" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Briefcase size={16} strokeWidth={1.5} className="text-navy-600" />}
            iconBg="bg-navy-50"
            label="Aktivní zakázky"
            value={String(activeCount)}
            sub={`z ${projects.total} celkem`}
          />
          <StatCard
            icon={<CheckCircle2 size={16} strokeWidth={1.5} className="text-navy-600" />}
            iconBg="bg-navy-50"
            label="Dokončeno / Zaplaceno"
            value={String(closedCount)}
            sub={`${projects.done_count} hotovo · ${projects.paid_count} zaplaceno`}
          />
          <StatCard
            icon={<Users size={16} strokeWidth={1.5} className="text-navy-600" />}
            iconBg="bg-navy-50"
            label="Unikátní klienti"
            value={String(uniqueClients)}
            sub={`${activeCount} aktivních`}
          />
          <StatCard
            icon={<TrendingUp size={16} strokeWidth={1.5} className="text-navy-600" />}
            iconBg="bg-navy-50"
            label="Celkový objem"
            value={formatCurrency(Number(projects.total_price))}
            sub="součet cen všech zakázek"
          />
          <StatCard
            icon={<Wallet size={16} strokeWidth={1.5} className="text-navy-600" />}
            iconBg="bg-navy-50"
            label="Přijato plateb"
            value={formatCurrency(Number(projects.paid_price))}
          />
          <StatCard
            icon={<AlertCircle size={16} strokeWidth={1.5} className="text-signal-ink" />}
            iconBg="bg-signal-bg"
            label="Čeká na platbu"
            value={formatCurrency(Number(projects.unpaid_price))}
            sub="zakázky ve stavu Hotovo"
          />
        </div>
      </div>

      {/* Pipeline — stav zakázek */}
      <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
        <SectionHeader icon={<CircleDot size={14} strokeWidth={1.5} />} title="Pipeline zakázek" />
        <div className="space-y-3">
          <PipelineBar label={STATUS_LABELS.new} count={projects.new_count} total={projects.total} color="bg-navy-200" />
          <PipelineBar label={STATUS_LABELS.in_progress} count={projects.in_progress_count} total={projects.total} color="bg-navy-300" />
          <PipelineBar label={STATUS_LABELS.review} count={projects.review_count} total={projects.total} color="bg-navy-400" />
          <PipelineBar label={STATUS_LABELS.done} count={projects.done_count} total={projects.total} color="bg-navy-600" />
          <PipelineBar label={STATUS_LABELS.paid} count={projects.paid_count} total={projects.total} color="bg-navy-700" />
        </div>
        <div className="mt-4 pt-3 border-t border-navy-100 flex items-center justify-between text-xs text-quiet">
          <span>Celkem zakázek: <strong className="text-ink">{projects.total}</strong></span>
          {projects.total > 0 && (
            <span>
              Úspěšnost (done+paid): <strong className="text-ink">
                {Math.round((closedCount / projects.total) * 100)} %
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Finance + Náklady */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
          <SectionHeader icon={<TrendingUp size={14} strokeWidth={1.5} />} title="Dokončené projekty (archiv)" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Počet projektů</span>
              <span className="text-sm font-semibold tabular-nums">{completed.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Celkové výnosy</span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(Number(completed.revenue))}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
          <SectionHeader icon={<Receipt size={14} strokeWidth={1.5} />} title="Náklady" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Průměrné měsíční náklady</span>
              <span className="text-sm font-semibold tabular-nums text-danger">
                {formatCurrency(Number(costs.monthly_costs))}
              </span>
            </div>
            {Number(costs.monthly_costs) > 0 && Number(completed.revenue) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-quiet">Roční náklady (odhad)</span>
                <span className="text-sm font-semibold tabular-nums text-danger">
                  {formatCurrency(Number(costs.monthly_costs) * 12)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vizeon */}
      <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
        <SectionHeader icon={<Inbox size={14} strokeWidth={1.5} />} title="Vizeon poptávky" />
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-ink tabular-nums">{vizeon.total}</p>
            <p className="text-xs text-quiet mt-0.5">Celkem poptávek</p>
          </div>
          <div className="text-center">
            <p className="font-num text-2xl font-bold text-ink tabular-nums">{vizeon.confirmed}</p>
            <p className="text-xs text-quiet mt-0.5">Potvrzeno</p>
          </div>
          <div className="text-center">
            <p className="font-num text-2xl font-bold text-signal-ink tabular-nums">{vizeon.pending}</p>
            <p className="text-xs text-quiet mt-0.5">Čeká na potvrzení</p>
          </div>
        </div>
        {conversionRate !== null && (
          <div className="mt-4 pt-3 border-t border-navy-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-quiet">Konverzní poměr (potvrzeno / celkem)</span>
              <span className="font-semibold text-ink">{conversionRate} %</span>
            </div>
            <div className="mt-1.5 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-navy-700 rounded-full"
                style={{ width: `${conversionRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Konzultace + NPS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
          <SectionHeader icon={<CalendarCheck size={14} strokeWidth={1.5} />} title="Konzultace" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Celkem rezervací</span>
              <span className="text-sm font-semibold tabular-nums">{consultations.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Proběhlé</span>
              <span className="text-sm font-semibold tabular-nums">{consultations.past}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Nadcházející</span>
              <span className="text-sm font-semibold tabular-nums text-navy-700">{consultations.upcoming}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
          <SectionHeader icon={<Star size={14} strokeWidth={1.5} />} title="NPS hodnocení" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Průměrné NPS</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tabular-nums">
                  {feedback.avg_nps !== null ? Number(feedback.avg_nps).toFixed(1) : '—'}
                </span>
                {feedback.avg_nps !== null && (
                  <span className={`text-xs font-medium ${npsColor}`}>({npsLabel})</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-quiet">Počet hodnocení</span>
              <span className="text-sm font-semibold tabular-nums">{feedback.total}</span>
            </div>
            {feedback.avg_nps !== null && (
              <div className="mt-1">
                <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      Number(feedback.avg_nps) >= 9 ? 'bg-navy-700'
                      : Number(feedback.avg_nps) >= 7 ? 'bg-navy-500'
                      : 'bg-navy-300'
                    }`}
                    style={{ width: `${(Number(feedback.avg_nps) / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-quiet mt-1">
                  <span>0</span><span>10</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Výkonnost a hodnocení — dřív samostatné obrazovky Dokončené
          a Hodnocení (AD11, R-090). */}
      {performance.projects.length > 0 && (
        <div className="border-t border-navy-100 pt-8">
          <PerformanceOverview projects={performance.projects} surveys={performance.surveys} />
        </div>
      )}

      {performance.surveys.length > 0 && (
        <div className="border-t border-navy-100 pt-8">
          <SectionHeader icon={<Star size={14} strokeWidth={1.5} />} title="Hodnocení od klientů" />
          <HodnoceniDashboard projects={performance.projects} surveys={performance.surveys} />
        </div>
      )}

      {/* Rychlé odkazy */}
      <div className="bg-surface border border-navy-100 rounded-chip p-5 shadow-sm">
        <SectionHeader icon={<ArrowRight size={14} strokeWidth={1.5} />} title="Rychlé přístupy" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { href: '/dashboard/poptavky', label: 'Poptávky z webů', icon: <Inbox size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/calendar', label: 'Kalendář', icon: <CalendarCheck size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/calls', label: 'Hovory / Leady', icon: <PhoneCall size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/zakazky?status=uzavrene', label: 'Uzavřené zakázky', icon: <CheckCircle2 size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/kontakty', label: 'Kontakty', icon: <Users size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/naklady', label: 'Náklady', icon: <Receipt size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/projekty', label: 'Projekty', icon: <Briefcase size={14} strokeWidth={1.5} /> },
            { href: '/dashboard/new', label: 'Nová zakázka', icon: <Clock size={14} strokeWidth={1.5} /> },
          ].map(({ href, label, icon }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-chip border border-navy-100 text-sm text-quiet hover:text-ink hover:bg-navy-50 hover:border-navy-200 transition-colors"
            >
              {icon}
              <span className="truncate">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
