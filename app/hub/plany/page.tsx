import Link from 'next/link'
import { Target, GraduationCap, Dumbbell, Layers, Briefcase, Wallet, Calendar, ArrowRight } from 'lucide-react'
import { getPlanyDashboardStats, getUpcomingDeadlines } from './plany-dashboard-actions'
import { formatDate } from '@/lib/utils'

const DEADLINE_SOURCE_LABELS: Record<string, string> = {
  skola: 'Škola',
  sport: 'Sport',
  finance: 'Finance',
  byznys: 'Byznys',
}

export default async function PlanyPage() {
  const [stats, deadlines] = await Promise.all([getPlanyDashboardStats(), getUpcomingDeadlines()])

  const tiles = [
    {
      href: '/hub/plany/skola',
      icon: GraduationCap,
      label: 'Škola',
      metric: `${stats.skola.activeCount} aktivní`,
      sub: stats.skola.nearestDate ? `nejbližší termín ${formatDate(stats.skola.nearestDate)}` : 'bez termínu',
      classes: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'hover:border-violet-300' },
    },
    {
      href: '/hub/plany/sport',
      icon: Dumbbell,
      label: 'Sport',
      metric: `${stats.sport.activeCount} aktivní`,
      sub: 'zdraví a kondice',
      classes: { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'hover:border-rose-300' },
    },
    {
      href: '/hub/plany/projekty',
      icon: Layers,
      label: 'Projekty',
      metric: `${stats.projekty.validaceCount} ve validaci`,
      sub: 'nápady k ověření',
      classes: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'hover:border-indigo-300' },
    },
    {
      href: '/hub/plany/byznys',
      icon: Briefcase,
      label: 'Byznys',
      metric: `${stats.byznys.readyCount} k exportu`,
      sub: 'strategické plánování',
      classes: { bg: 'bg-brand-50', icon: 'text-brand-800', border: 'hover:border-brand-300' },
    },
    {
      href: '/hub/plany/finance',
      icon: Wallet,
      label: 'Finance',
      metric: stats.finance.nearestGoalPct != null ? `${stats.finance.nearestGoalPct}% k cíli` : 'bez cíle',
      sub: stats.finance.nearestGoalTitle ?? 'cíle, úspory, investice',
      classes: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'hover:border-emerald-300' },
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
            <Target size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Plány</h1>
        </div>
        <p className="text-sm text-muted-foreground">Osobní portál cílů napříč školou, sportem, projekty, byznysem a financemi</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`bg-white border border-border rounded-2xl p-5 transition-colors ${tile.classes.border}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 ${tile.classes.bg} rounded-xl flex items-center justify-center`}>
                <tile.icon size={18} strokeWidth={1.5} className={tile.classes.icon} />
              </div>
              <ArrowRight size={14} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">{tile.label}</h2>
            <p className="text-lg font-semibold text-foreground tabular-nums">{tile.metric}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{tile.sub}</p>
          </Link>
        ))}
      </div>

      <div className="bg-white border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} strokeWidth={1.5} className="text-amber-600" />
          <h2 className="text-base font-semibold text-foreground">Nejbližší termíny</h2>
        </div>
        {deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Žádné nadcházející termíny napříč plány.</p>
        ) : (
          <div className="space-y-2">
            {deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                    {DEADLINE_SOURCE_LABELS[d.source]}
                  </span>
                  <span className="text-sm text-foreground truncate">{d.title}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(d.target_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
