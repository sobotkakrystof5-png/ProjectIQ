import { Dumbbell, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getHealthGoals, getHealthGoalActions, getHealthGoalLogs } from './sport-goals-actions'
import { SportClient } from './SportClient'

export default async function SportPlanyPage() {
  const goals = await getHealthGoals()
  const actionsByGoal = Object.fromEntries(
    await Promise.all(goals.map(async (g) => [g.id, await getHealthGoalActions(g.id)] as const))
  )
  const logsByGoal = Object.fromEntries(
    await Promise.all(goals.map(async (g) => [g.id, await getHealthGoalLogs(g.id)] as const))
  )

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/hub/plany"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Plány
        </Link>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-rose-700 rounded-lg flex items-center justify-center shadow-sm">
            <Dumbbell size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Zdravotní a sportovní cíle</h1>
        </div>
        <p className="text-sm text-muted-foreground">Cíle, kroky k jejich dosažení a vývoj hodnot v čase</p>
      </div>

      <SportClient goals={goals} actionsByGoal={actionsByGoal} logsByGoal={logsByGoal} />
    </div>
  )
}
