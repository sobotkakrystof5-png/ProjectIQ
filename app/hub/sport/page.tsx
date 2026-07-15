import { Dumbbell } from 'lucide-react'
import { SportClient } from './SportClient'
import { getPragueNow } from '@/lib/prague-time'
import {
  getNutritionDay,
  getWorkoutsMonth,
  getWorkoutsRecent,
  getHealthScoreToday,
  getHealthScoresWeek,
  getWeightLogs,
  getLastWeight,
} from './sport-actions'

export default async function SportPage() {
  const now = getPragueNow()
  const today = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`
  const year = now.year
  const month = now.month

  const [
    initialNutrition,
    initialTodayScore,
    initialWeekScores,
    initialRecentWorkouts,
    initialMonthWorkouts,
    initialWeightLogs,
    initialLastWeight,
  ] = await Promise.all([
    getNutritionDay(today),
    getHealthScoreToday(),
    getHealthScoresWeek(),
    getWorkoutsRecent(),
    getWorkoutsMonth(year, month),
    getWeightLogs(30),
    getLastWeight(),
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-sm shrink-0 mt-0.5">
          <Dumbbell size={20} strokeWidth={1.5} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-0.5">Sport & Zdraví</h1>
          <p className="text-sm text-muted-foreground">
            Jídlo, váha, trénink a zdravotní skóre — vše na jednom místě
          </p>
        </div>
      </div>

      <SportClient
        today={today}
        initialNutrition={initialNutrition}
        initialTodayScore={initialTodayScore}
        initialWeekScores={initialWeekScores}
        initialRecentWorkouts={initialRecentWorkouts}
        initialMonthWorkouts={initialMonthWorkouts}
        initialWeightLogs={initialWeightLogs}
        initialLastWeight={initialLastWeight}
        year={year}
        month={month}
      />
    </div>
  )
}
