import { getCompletedProjects, getProjectSurveys } from '@/app/completed-actions'
import CompletedProjectsTable from '@/components/CompletedProjectsTable'
import PerformanceOverview from '@/components/PerformanceOverview'
import type { CompletedProject, ProjectSurvey } from '@/lib/types'

export default async function DokoncenePage() {
  const [projectRows, surveyRows] = await Promise.all([
    getCompletedProjects(),
    getProjectSurveys(),
  ])
  const projects = projectRows as unknown as CompletedProject[]
  const surveys = surveyRows as unknown as ProjectSurvey[]

  return (
    <div className="space-y-10">
      <CompletedProjectsTable initialProjects={projects} />
      <div className="border-t border-border pt-10">
        <PerformanceOverview projects={projects} surveys={surveys} />
      </div>
    </div>
  )
}
