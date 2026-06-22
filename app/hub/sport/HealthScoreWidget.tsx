'use client'

import { useState, useEffect } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getHealthScoresWeek,
  getHealthScoreToday,
  type HealthScore,
} from './sport-actions'
import { scoreToGrade } from './profile'

interface Props {
  initialToday: HealthScore | null
  initialWeek: HealthScore[]
  trigger: number
}

function ComponentBar({
  label,
  score,
  color,
  emoji,
}: {
  label: string
  score: number
  color: string
  emoji: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg w-7 text-center shrink-0">{emoji}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-sm font-semibold tabular-nums">{score}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', color)}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function HealthScoreWidget({ initialToday, initialWeek, trigger }: Props) {
  const [todayScore, setTodayScore] = useState<HealthScore | null>(initialToday)
  const [weekScores, setWeekScores] = useState<HealthScore[]>(initialWeek)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (trigger > 0) {
      setLoading(true)
      Promise.all([getHealthScoreToday(), getHealthScoresWeek()]).then(([s, w]) => {
        setTodayScore(s)
        setWeekScores(w)
        setLoading(false)
      })
    }
  }, [trigger])

  const score = todayScore?.score ?? 0
  const grade = scoreToGrade(score)
  const weekAvg = weekScores.length
    ? Math.round(weekScores.reduce((s, x) => s + x.score, 0) / weekScores.length)
    : 0

  const breakdown = [
    { label: 'Bílkoviny', score: todayScore?.protein_score ?? 0, color: 'bg-blue-400', emoji: '🥩' },
    { label: 'Sacharidy', score: todayScore?.carbs_score ?? 0, color: 'bg-amber-400', emoji: '🍞' },
    { label: 'Tuky', score: todayScore?.fat_score ?? 0, color: 'bg-emerald-400', emoji: '🥑' },
    { label: 'Trénink', score: todayScore?.activity_score ?? 0, color: 'bg-rose-400', emoji: '💪' },
  ]

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Trophy size={16} strokeWidth={1.5} className="text-rose-500" />
        <h2 className="text-base font-semibold text-foreground">Zdravotní skóre dnes</h2>
        {loading && <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-muted-foreground ml-auto" />}
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Velké hodnocení */}
        <div className="flex items-center gap-5">
          <div className={cn(
            'w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-sm',
            grade.bg
          )}>
            <span className="text-5xl font-black text-white leading-none">{grade.grade}</span>
          </div>

          <div className="flex-1">
            <p className="text-3xl font-bold text-foreground tabular-nums leading-none">
              {score}
              <span className="text-lg font-normal text-muted-foreground"> / 100</span>
            </p>
            <p className={cn('text-lg font-semibold mt-1', grade.text)}>{grade.label}</p>
            {weekScores.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                Průměr týdne: <span className="font-semibold text-foreground">{weekAvg} bodů</span>
              </p>
            )}
          </div>
        </div>

        {/* Co tvoří skóre — procenta plnění */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Co tvoří skóre</p>
          {breakdown.map(b => (
            <ComponentBar key={b.label} {...b} />
          ))}
        </div>

        {/* Týdenní trend */}
        {weekScores.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Posledních 7 dní</p>
            <div className="flex items-end gap-1.5 h-10">
              {weekScores.map(s => {
                const h = Math.max(4, Math.round((s.score / 100) * 36))
                const g = scoreToGrade(s.score)
                const day = new Date(s.scored_date + 'T00:00:00')
                  .toLocaleDateString('cs-CZ', { weekday: 'short' })
                return (
                  <div
                    key={s.scored_date}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${day}: ${s.score} bodů`}
                  >
                    <div className="w-full flex items-end justify-center" style={{ height: '36px' }}>
                      <div className={cn('w-full rounded-sm', g.bg)} style={{ height: `${h}px` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{day.slice(0, 2)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!todayScore && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Přidej jídlo nebo trénink — skóre se spočítá samo
          </p>
        )}
      </div>
    </div>
  )
}
