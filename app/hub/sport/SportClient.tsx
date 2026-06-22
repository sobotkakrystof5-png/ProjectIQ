'use client'

import { useState } from 'react'
import { NutritionSection } from './NutritionSection'
import { HealthScoreWidget } from './HealthScoreWidget'
import { WorkoutSection } from './WorkoutSection'
import { WeightSection } from './WeightSection'
import { TrainingCalendar } from './TrainingCalendar'
import type { NutritionLog, WorkoutLog, HealthScore, WeightLog } from './sport-actions'

interface Props {
  today: string
  initialNutrition: NutritionLog[]
  initialTodayScore: HealthScore | null
  initialWeekScores: HealthScore[]
  initialRecentWorkouts: WorkoutLog[]
  initialMonthWorkouts: WorkoutLog[]
  initialWeightLogs: WeightLog[]
  initialLastWeight: WeightLog | null
  year: number
  month: number
}

export function SportClient({
  today,
  initialNutrition,
  initialTodayScore,
  initialWeekScores,
  initialRecentWorkouts,
  initialMonthWorkouts,
  initialWeightLogs,
  initialLastWeight,
  year,
  month,
}: Props) {
  const [healthTrigger, setHealthTrigger] = useState(0)
  const [calendarTrigger, setCalendarTrigger] = useState(0)

  const onNutritionMutated = () => setHealthTrigger(t => t + 1)
  const onWorkoutMutated = () => {
    setHealthTrigger(t => t + 1)
    setCalendarTrigger(t => t + 1)
  }

  return (
    <div className="space-y-6">
      {/* Řádek 1: Zdravotní skóre + Jídlo — vedle sebe na desktopu */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <HealthScoreWidget
          initialToday={initialTodayScore}
          initialWeek={initialWeekScores}
          trigger={healthTrigger}
        />
        <NutritionSection
          initialDate={today}
          initialLogs={initialNutrition}
          onMutated={onNutritionMutated}
        />
      </div>

      {/* Řádek 2: Váha + Trénink — vedle sebe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeightSection
          initialLogs={initialWeightLogs}
          initialLast={initialLastWeight}
        />
        <WorkoutSection
          initialWorkouts={initialRecentWorkouts}
          onMutated={onWorkoutMutated}
        />
      </div>

      {/* Řádek 3: Tréninkový kalendář */}
      <TrainingCalendar
        initialYear={year}
        initialMonth={month}
        initialWorkouts={initialMonthWorkouts}
        trigger={calendarTrigger}
      />
    </div>
  )
}
