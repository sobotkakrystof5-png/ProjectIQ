import { getCompletedProjects, getCosts } from '@/app/completed-actions'
import CompletedProjectsTable from '@/components/CompletedProjectsTable'
import EarningsCalculator from '@/components/EarningsCalculator'
import type { CompletedProject, Cost } from '@/lib/types'

export default async function DokoncenePage() {
  const [projectRows, costRows] = await Promise.all([
    getCompletedProjects(),
    getCosts(),
  ])
  const projects = projectRows as unknown as CompletedProject[]
  const costs = costRows as unknown as Cost[]

  return (
    <div className="space-y-10">
      <CompletedProjectsTable initialProjects={projects} />
      <div className="border-t border-border pt-10">
        <EarningsCalculator projects={projects} costs={costs} />
      </div>
    </div>
  )
}
