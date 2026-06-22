'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getWorkoutsMonth, type WorkoutLog } from './sport-actions'
import { MUSCLE_COLORS } from './WorkoutSection'

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

function buildGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1)
  const totalDays = new Date(year, month, 0).getDate()
  const startPad = (firstDay.getDay() + 6) % 7 // Mon-first (0=Mon)
  const grid: (number | null)[] = []
  for (let i = 0; i < startPad; i++) grid.push(null)
  for (let d = 1; d <= totalDays; d++) grid.push(d)
  return grid
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getWeekStart(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

interface Props {
  initialYear: number
  initialMonth: number
  initialWorkouts: WorkoutLog[]
  trigger: number
}

export function TrainingCalendar({ initialYear, initialMonth, initialWorkouts, trigger }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [workouts, setWorkouts] = useState<WorkoutLog[]>(initialWorkouts)
  const [loading, setLoading] = useState(false)

  const fetchWorkouts = async (y: number, m: number) => {
    setLoading(true)
    const w = await getWorkoutsMonth(y, m)
    setWorkouts(w)
    setLoading(false)
  }

  useEffect(() => {
    if (trigger > 0) fetchWorkouts(year, month)
  }, [trigger])

  const prevMonth = () => {
    const nm = month === 1 ? 12 : month - 1
    const ny = month === 1 ? year - 1 : year
    setMonth(nm); setYear(ny)
    fetchWorkouts(ny, nm)
  }

  const nextMonth = () => {
    const today = new Date()
    if (year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)) return
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    setMonth(nm); setYear(ny)
    fetchWorkouts(ny, nm)
  }

  const grid = buildGrid(year, month)

  // Map date → workouts
  const byDate: Record<string, WorkoutLog[]> = {}
  for (const w of workouts) {
    byDate[w.logged_date] = [...(byDate[w.logged_date] ?? []), w]
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const todayWeekStart = getWeekStart(todayIso)

  // Stats
  const thisMonthCount = workouts.length
  const thisWeekCount = workouts.filter(w => getWeekStart(w.logged_date) === todayWeekStart).length

  const canGoNext = !(year === new Date().getFullYear() && month >= new Date().getMonth() + 1)

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Tréninkový kalendář</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground">{thisWeekCount}</span> tento týden</span>
            <span>·</span>
            <span><span className="font-semibold text-foreground">{thisMonthCount}</span> tento měsíc</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <span className="text-xs font-medium w-28 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              disabled={!canGoNext}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <div className={cn('px-5 py-4', loading && 'opacity-50 pointer-events-none')}>
        {loading && (
          <div className="flex justify-center pb-2">
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {grid.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} />
            const iso = isoDate(year, month, day)
            const dayWorkouts = byDate[iso] ?? []
            const isToday = iso === todayIso

            return (
              <div
                key={iso}
                className={cn(
                  'relative flex flex-col items-center py-1.5 rounded-lg',
                  isToday && 'bg-rose-50',
                  dayWorkouts.length > 0 && 'cursor-default',
                )}
                title={dayWorkouts.map(w => w.title).join(', ')}
              >
                <span className={cn(
                  'text-xs tabular-nums',
                  isToday ? 'font-bold text-rose-600' : 'text-foreground'
                )}>
                  {day}
                </span>
                {dayWorkouts.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[24px]">
                    {dayWorkouts.slice(0, 3).map((w, i) => {
                      const primary = w.muscle_groups[0]
                      return (
                        <div
                          key={i}
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            primary ? MUSCLE_COLORS[primary] ?? 'bg-rose-400' : 'bg-rose-400'
                          )}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1.5">
          {Object.entries(MUSCLE_COLORS).map(([m, color]) => (
            <div key={m} className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', color)} />
              <span className="text-[10px] text-muted-foreground">{m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
