'use client'

import { useState } from 'react'
import { NutritionSection } from './NutritionSection'
import { HealthScoreWidget } from './HealthScoreWidget'
import { WorkoutSection } from './WorkoutSection'
import { TrainingCalendar } from './TrainingCalendar'
import type { NutritionLog, WorkoutLog, HealthScore } from './sport-actions'

interface Props {
  today: string
  initialNutrition: NutritionLog[]
  initialTodayScore: HealthScore | null
  initialWeekScores: HealthScore[]
  initialRecentWorkouts: WorkoutLog[]
  initialMonthWorkouts: WorkoutLog[]
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
  year,
  month,
}: Props) {
  // Increment to signal sub-components to refresh their data
  const [healthTrigger, setHealthTrigger] = useState(0)
  const [calendarTrigger, setCalendarTrigger] = useState(0)

  const onNutritionMutated = () => setHealthTrigger(t => t + 1)
  const onWorkoutMutated = () => {
    setHealthTrigger(t => t + 1)
    setCalendarTrigger(t => t + 1)
  }

  return (
    <div className="space-y-6">
      {/* Nutriční deník — full width */}
      <NutritionSection
        initialDate={today}
        initialLogs={initialNutrition}
        onMutated={onNutritionMutated}
      />

      {/* Health Score + Gym log — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthScoreWidget
          initialToday={initialTodayScore}
          initialWeek={initialWeekScores}
          trigger={healthTrigger}
        />
        <WorkoutSection
          initialWorkouts={initialRecentWorkouts}
          onMutated={onWorkoutMutated}
        />
      </div>

      {/* Training calendar — full width */}
      <TrainingCalendar
        initialYear={year}
        initialMonth={month}
        initialWorkouts={initialMonthWorkouts}
        trigger={calendarTrigger}
      />
    </div>
  )
}
