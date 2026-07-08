import { GraduationCap } from 'lucide-react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSchoolGoals, getSchoolGoalActions } from './skola-actions'
import { SkolaClient } from './SkolaClient'

export default async function SkolaPlanyPage() {
  const goals = await getSchoolGoals()
  const actionsByGoal = Object.fromEntries(
    await Promise.all(goals.map(async (g) => [g.id, await getSchoolGoalActions(g.id)] as const))
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
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-violet-700 rounded-lg flex items-center justify-center shadow-sm">
            <GraduationCap size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Cíle ve studiu</h1>
        </div>
        <p className="text-sm text-muted-foreground">Čeho chci ve škole dosáhnout a jak se tam dostanu</p>
      </div>

      <SkolaClient goals={goals} actionsByGoal={actionsByGoal} />
    </div>
  )
}
