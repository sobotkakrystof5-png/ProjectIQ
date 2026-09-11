'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Clock, Target, Star, Gauge, ArrowUpRight,
  ArrowDownRight, ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'
import { SURVEY_CATEGORIES, type CompletedProject, type ProjectSurvey } from '@/lib/types'
import { cn } from '@/lib/utils'

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

function surveyAverage(s: ProjectSurvey): number {
  const sum = SURVEY_CATEGORIES.reduce((acc, c) => acc + (s[c.key] as number), 0)
  return sum / SURVEY_CATEGORIES.length
}

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'red' | 'blue' | 'amber' | 'default'
  icon?: React.ReactNode
}) {
  const color =
    accent === 'green'
      ? 'text-emerald-700'
      : accent === 'red'
        ? 'text-red-600'
        : accent === 'blue'
          ? 'text-brand-700'
          : accent === 'amber'
            ? 'text-amber-600'
            : 'text-foreground'

  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color} leading-none`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Náročnost vs. skutečný čas ────────────────────────────────────────────

function DifficultyVsTime({ projects }: { projects: CompletedProject[] }) {
  const [expanded, setExpanded] = useState(false)

  const rows = projects
    .filter(p => p.time_invested != null && Number(p.time_invested) > 0)
    .map(p => ({ id: p.id, title: p.title, difficulty: p.difficulty, hours: Number(p.time_invested) }))
    .sort((a, b) => a.difficulty - b.difficulty || a.hours - b.hours)

  if (rows.length === 0) {
    return (
      <div>
        <SectionHeader icon={<Gauge size={14} className="text-brand-500" strokeWidth={1.5} />} title="Náročnost vs. skutečný čas" />
        <p className="text-sm text-muted-foreground">
          Zatím žádná zakázka nemá vyplněný odpracovaný čas — nemá se s čím porovnávat.
        </p>
      </div>
    )
  }

  const buckets: { label: string; range: [number, number] }[] = [
    { label: 'Nízká (1–3)', range: [1, 3] },
    { label: 'Střední (4–6)', range: [4, 6] },
    { label: 'Vysoká (7–10)', range: [7, 10] },
  ]
  const bucketAvg = buckets.map(b => {
    const inBucket = rows.filter(r => r.difficulty >= b.range[0] && r.difficulty <= b.range[1])
    const avg = inBucket.length > 0 ? inBucket.reduce((s, r) => s + r.hours, 0) / inBucket.length : null
    return { ...b, avg, count: inBucket.length }
  })

  const maxHours = Math.max(...rows.map(r => r.hours))
  const visible = expanded ? rows : rows.slice(0, 6)

  return (
    <div>
      <SectionHeader
        icon={<Gauge size={14} className="text-brand-500" strokeWidth={1.5} />}
        title="Náročnost vs. skutečný čas"
        sub="Rostou hodiny s vnímanou náročností, nebo je to nezávislé?"
      />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {bucketAvg.map(b => (
          <div key={b.label} className="bg-slate-50 border border-border rounded-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{b.label}</p>
            <p className="text-sm font-semibold text-foreground">
              {b.avg != null ? `${fmt(b.avg)} h` : '—'}
              {b.count > 0 && <span className="text-xs text-muted-foreground font-normal"> · {b.count}×</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {visible.map(r => (
          <div key={r.id} className="flex items-center gap-2.5">
            <span className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0',
              r.difficulty <= 3 ? 'bg-emerald-100 text-emerald-700' : r.difficulty <= 6 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            )}>
              {r.difficulty}
            </span>
            <span className="text-xs text-muted-foreground truncate w-32 shrink-0" title={r.title}>{r.title}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-400 rounded-full"
                style={{ width: `${Math.max(4, (r.hours / maxHours) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground w-14 text-right shrink-0">{fmt(r.hours)} h</span>
          </div>
        ))}
      </div>

      {rows.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Zobrazit méně' : `Zobrazit všech ${rows.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Odhad vs. realita ──────────────────────────────────────────────────────

function EstimateVsReality({ projects }: { projects: CompletedProject[] }) {
  const rows = projects
    .filter(p => p.estimated_hours != null && p.time_invested != null && Number(p.estimated_hours) > 0)
    .map(p => {
      const estimate = Number(p.estimated_hours)
      const actual = Number(p.time_invested)
      const deltaPct = ((actual - estimate) / estimate) * 100
      return { id: p.id, title: p.title, estimate, actual, deltaPct }
    })
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))

  if (rows.length === 0) {
    return (
      <div>
        <SectionHeader icon={<Target size={14} className="text-brand-500" strokeWidth={1.5} />} title="Odhad vs. realita" />
        <p className="text-sm text-muted-foreground">
          Zatím žádná zakázka nemá vyplněný odhad z doby zadání. Přidej ho příště v okně „Dokončit zakázku&rdquo;
          nebo rovnou tady v tabulce — příští odchylka se ukáže zde.
        </p>
      </div>
    )
  }

  const avgDeltaPct = rows.reduce((s, r) => s + r.deltaPct, 0) / rows.length

  return (
    <div>
      <SectionHeader
        icon={<Target size={14} className="text-brand-500" strokeWidth={1.5} />}
        title="Odhad vs. realita"
        sub={`${rows.length} ${rows.length === 1 ? 'zakázka s odhadem' : rows.length < 5 ? 'zakázky s odhadem' : 'zakázek s odhadem'}`}
      />

      <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border text-sm ${
        avgDeltaPct > 5 ? 'bg-red-50 border-red-200 text-red-700' : avgDeltaPct < -5 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-border text-foreground'
      }`}>
        {avgDeltaPct > 0 ? <ArrowUpRight size={14} strokeWidth={1.5} /> : <ArrowDownRight size={14} strokeWidth={1.5} />}
        <span>
          V průměru zakázky trvají o <strong>{fmt(Math.abs(avgDeltaPct))} %</strong> {avgDeltaPct >= 0 ? 'déle' : 'kratší dobu'}, než plánuješ.
        </span>
      </div>

      <div className="space-y-2">
        {rows.slice(0, 5).map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground truncate" title={r.title}>{r.title}</span>
            <span className="flex items-center gap-2 shrink-0 tabular-nums">
              <span className="text-muted-foreground text-xs">{fmt(r.estimate)} h → {fmt(r.actual)} h</span>
              <span className={cn(
                'text-xs font-semibold px-1.5 py-0.5 rounded-full',
                r.deltaPct > 5 ? 'bg-red-50 text-red-600' : r.deltaPct < -5 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              )}>
                {r.deltaPct >= 0 ? '+' : ''}{fmt(r.deltaPct)} %
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Vývoj v čase ───────────────────────────────────────────────────────────

function TrendOverTime({ projects }: { projects: CompletedProject[] }) {
  const rows = projects
    .filter(p => p.time_invested != null && Number(p.time_invested) > 0 && Number(p.amount) > 0)
    .map(p => ({
      id: p.id,
      title: p.title,
      date: new Date(p.completed_at),
      rate: Number(p.amount) / Number(p.time_invested),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (rows.length < 2) {
    return (
      <div>
        <SectionHeader icon={<Sparkles size={14} className="text-brand-500" strokeWidth={1.5} />} title="Vývoj v čase" />
        <p className="text-sm text-muted-foreground">
          Potřebuješ aspoň dvě zakázky s vyplněnou částkou i časem, aby se dal ukázat trend hodinové sazby.
        </p>
      </div>
    )
  }

  const W = 100
  const H = 100
  const pad = 8
  const rates = rows.map(r => r.rate)
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  const range = max - min || 1

  const points = rows.map((r, i) => {
    const x = rows.length === 1 ? W / 2 : pad + (i / (rows.length - 1)) * (W - pad * 2)
    const y = H - pad - ((r.rate - min) / range) * (H - pad * 2)
    return { x, y, rate: r.rate, title: r.title }
  })
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')

  const half = Math.max(1, Math.floor(rows.length / 2))
  const olderAvg = rates.slice(0, half).reduce((s, r) => s + r, 0) / half
  const recentAvg = rates.slice(-half).reduce((s, r) => s + r, 0) / half
  const trendUp = recentAvg >= olderAvg

  return (
    <div>
      <SectionHeader
        icon={<Sparkles size={14} className="text-brand-500" strokeWidth={1.5} />}
        title="Vývoj v čase"
        sub="Hodinová sazba klientských zakázek chronologicky"
      />

      <div className="bg-slate-50 border border-border rounded-lg p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
          <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-500" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.8" className="fill-brand-600">
              <title>{`${p.title}: ${fmt(p.rate)} Kč/h`}</title>
            </circle>
          ))}
        </svg>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{fmt(min)} Kč/h nejnižší</span>
          <span>{fmt(max)} Kč/h nejvyšší</span>
        </div>
      </div>

      <div className={`flex items-center gap-1.5 mt-2 text-xs ${trendUp ? 'text-emerald-700' : 'text-red-600'}`}>
        {trendUp ? <ArrowUpRight size={13} strokeWidth={1.5} /> : <ArrowDownRight size={13} strokeWidth={1.5} />}
        <span>
          Posledních {half} v průměru {fmt(recentAvg)} Kč/h oproti {fmt(olderAvg)} Kč/h dřív
        </span>
      </div>
    </div>
  )
}

// ─── Spokojenost klientů ────────────────────────────────────────────────────

function ClientSatisfaction({ projects, surveys }: { projects: CompletedProject[]; surveys: ProjectSurvey[] }) {
  const projectIds = new Set(projects.map(p => p.id))
  const answered = surveys.filter(s => projectIds.has(s.completed_project_id))

  if (projects.length === 0) return null

  if (answered.length === 0) {
    return (
      <div>
        <SectionHeader icon={<Star size={14} className="text-amber-500" strokeWidth={1.5} />} title="Spokojenost klientů" />
        <p className="text-sm text-muted-foreground">
          Zatím žádný klient nevyplnil dotazník spokojenosti.{' '}
          <Link href="/dashboard/hodnoceni" className="text-brand-700 hover:underline">Zobrazit v Hodnocení →</Link>
        </p>
      </div>
    )
  }

  const overallAvg = answered.reduce((s, r) => s + surveyAverage(r), 0) / answered.length
  const perCategory = SURVEY_CATEGORIES.map(c => ({
    label: c.label,
    avg: answered.reduce((s, r) => s + (r[c.key] as number), 0) / answered.length,
  }))

  return (
    <div>
      <SectionHeader
        icon={<Star size={14} className="text-amber-500" strokeWidth={1.5} />}
        title="Spokojenost klientů"
        sub={`${answered.length} z ${projects.length} ${projects.length === 1 ? 'zakázky' : 'zakázek'} ohodnoceno`}
      />

      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl font-bold text-amber-600">{overallAvg.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">/ 5 průměr napříč kategoriemi</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
        {perCategory.map(c => (
          <div key={c.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-medium text-foreground">{c.avg.toFixed(1)}/5</span>
          </div>
        ))}
      </div>

      <Link href="/dashboard/hodnoceni" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
        Zobrazit všechna hodnocení <ChevronRight size={12} strokeWidth={1.5} />
      </Link>
    </div>
  )
}

// ─── Hlavní komponenta ──────────────────────────────────────────────────────

/**
 * Výkonnost dokončených zakázek — odpovídá na otázku „jak dobře pracuju".
 *
 * Peníze a daně (celkové příjmy, náklady, čistý výdělek) žijí ve Financích
 * (/hub/finance?tab=podnikani) — tady se neopakují, aby nevznikla dvě různě
 * počítaná čísla se stejným jménem. Hodinová sazba je výjimka: je to poměr
 * (příjem/čas), ne částka sama o sobě, takže zůstává jako výkonnostní metrika.
 */
export default function PerformanceOverview({
  projects,
  surveys,
}: {
  projects: CompletedProject[]
  surveys: ProjectSurvey[]
}) {
  const clientProjects = projects.filter(p => p.project_type === 'client')
  const clientHours = clientProjects.reduce((s, p) => s + (p.time_invested != null ? Number(p.time_invested) : 0), 0)
  const clientEarnings = clientProjects.reduce((s, p) => s + Number(p.amount), 0)
  const grossHourlyRate = clientHours > 0 ? clientEarnings / clientHours : 0
  const avgDifficulty = clientProjects.length > 0
    ? clientProjects.reduce((s, p) => s + p.difficulty, 0) / clientProjects.length
    : 0
  const totalHours = projects.reduce((s, p) => s + (p.time_invested != null ? Number(p.time_invested) : 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
          <TrendingUp size={15} className="text-brand-600" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Výkonnost</h3>
          <p className="text-xs text-muted-foreground">
            {/* Klientské zakázky, ne všechny řádky — osobní projekty s nulovou
                částkou by hodinovou sazbu jen zkreslily. */}
            Celkem {clientProjects.length}{' '}
            {clientProjects.length === 1
              ? 'klientská zakázka'
              : clientProjects.length < 5
                ? 'klientské zakázky'
                : 'klientských zakázek'}
            {totalHours > 0 && ` · ${fmt(totalHours)} h práce celkem`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Hodinová sazba"
          value={clientHours > 0 ? `${fmt(grossHourlyRate)} Kč/h` : '—'}
          sub="klientské příjmy / čas klientů"
          accent="blue"
          icon={<TrendingUp size={12} className="text-brand-500" strokeWidth={1.5} />}
        />
        <StatCard
          label="Průměrná náročnost"
          value={avgDifficulty > 0 ? `${avgDifficulty.toFixed(1)}/10` : '—'}
          icon={<Gauge size={12} className="text-brand-500" strokeWidth={1.5} />}
        />
        <StatCard
          label="Celkový čas"
          value={totalHours > 0 ? `${fmt(totalHours)} h` : '—'}
          sub="klientské i osobní projekty"
          icon={<Clock size={12} className="text-muted-foreground" strokeWidth={1.5} />}
        />
      </div>

      {clientProjects.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <DifficultyVsTime projects={clientProjects} />
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <EstimateVsReality projects={clientProjects} />
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <TrendOverTime projects={clientProjects} />
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <ClientSatisfaction projects={clientProjects} surveys={surveys} />
          </div>
        </div>
      )}
    </div>
  )
}
