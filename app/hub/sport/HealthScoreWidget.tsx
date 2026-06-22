'use client'

import { useState, useEffect } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getHealthScoresWeek,
  getHealthScoresMonth,
  getHealthScoresAllTime,
  getHealthScoreToday,
  type HealthScore,
} from './sport-actions'

type Period = 'today' | 'week' | 'month' | 'alltime'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Dnes',
  week: 'Týden',
  month: 'Měsíc',
  alltime: 'Vše',
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 15.9
  const dash = (score / 100) * circumference

  const color =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#f59e0b' :
    score >= 40 ? '#f97316' :
    '#ef4444'

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="2.8" />
        <circle
          cx="18" cy="18" r="15.9"
          fill="none"
          stroke={color}
          strokeWidth="2.8"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground tabular-nums">{score}</span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
    </div>
  )
}

function MiniBarChart({ scores }: { scores: HealthScore[] }) {
  if (!scores.length) return null
  const max = Math.max(...scores.map(s => s.score), 1)

  return (
    <div className="flex items-end gap-1 h-12">
      {scores.map(s => {
        const h = Math.round((s.score / max) * 100)
        const color =
          s.score >= 80 ? 'bg-emerald-400' :
          s.score >= 60 ? 'bg-amber-400' :
          s.score >= 40 ? 'bg-orange-400' :
          'bg-rose-400'
        const day = new Date(s.scored_date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short' })
        return (
          <div key={s.scored_date} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${s.score}`}>
            <div className="w-full flex items-end justify-center" style={{ height: '36px' }}>
              <div
                className={cn('w-full rounded-sm transition-all', color)}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{day.slice(0, 2)}</span>
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  initialToday: HealthScore | null
  initialWeek: HealthScore[]
  trigger: number
}

export function HealthScoreWidget({ initialToday, initialWeek, trigger }: Props) {
  const [period, setPeriod] = useState<Period>('today')
  const [loading, setLoading] = useState(false)
  const [todayScore, setTodayScore] = useState<HealthScore | null>(initialToday)
  const [weekScores, setWeekScores] = useState<HealthScore[]>(initialWeek)
  const [monthScores, setMonthScores] = useState<HealthScore[]>([])
  const [allScores, setAllScores] = useState<HealthScore[]>([])

  const refreshToday = async () => {
    const s = await getHealthScoreToday()
    setTodayScore(s)
    const w = await getHealthScoresWeek()
    setWeekScores(w)
  }

  useEffect(() => {
    if (trigger > 0) refreshToday()
  }, [trigger])

  useEffect(() => {
    if (period === 'month' && !monthScores.length) {
      setLoading(true)
      getHealthScoresMonth().then(s => { setMonthScores(s); setLoading(false) })
    }
    if (period === 'alltime' && !allScores.length) {
      setLoading(true)
      getHealthScoresAllTime().then(s => { setAllScores(s); setLoading(false) })
    }
  }, [period])

  const displayScore = todayScore?.score ?? 0
  const breakdown = {
    protein: todayScore?.protein_score ?? 0,
    carbs: todayScore?.carbs_score ?? 0,
    fat: todayScore?.fat_score ?? 0,
    activity: todayScore?.activity_score ?? 0,
  }

  const chartScores =
    period === 'today' ? weekScores :
    period === 'week' ? weekScores :
    period === 'month' ? monthScores :
    allScores.slice(-30)

  const avgScore =
    chartScores.length
      ? Math.round(chartScores.reduce((s, x) => s + x.score, 0) / chartScores.length)
      : 0

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={14} strokeWidth={1.5} className="text-rose-500" />
          <h2 className="text-sm font-semibold text-foreground">Health Score</h2>
        </div>
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
                period === p ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Ring + breakdown (always today) */}
        <div className="flex items-center gap-5">
          <ScoreRing score={displayScore} />
          <div className="flex-1 space-y-2">
            {[
              { label: 'Proteiny', value: breakdown.protein, color: 'bg-blue-400' },
              { label: 'Sacharidy', value: breakdown.carbs, color: 'bg-amber-400' },
              { label: 'Tuky', value: breakdown.fat, color: 'bg-emerald-400' },
              { label: 'Aktivita', value: breakdown.activity, color: 'bg-rose-400' },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0">{m.label}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', m.color)}
                    style={{ width: `${m.value}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{m.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-muted-foreground" />
          </div>
        ) : chartScores.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {period === 'today' || period === 'week' ? '7 dní' : period === 'month' ? 'Tento měsíc' : 'Posledních 30 dní'}
              </p>
              <p className="text-[10px] text-muted-foreground">Průměr: <span className="font-semibold text-foreground">{avgScore}</span></p>
            </div>
            <MiniBarChart scores={period === 'alltime' ? allScores.slice(-30) : chartScores} />
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center py-2">Žádná data pro toto období</p>
        )}

        {!todayScore && (
          <p className="text-[10px] text-muted-foreground/70 text-center">
            Přidej jídlo nebo trénink pro dnešní skóre
          </p>
        )}
      </div>
    </div>
  )
}
