import { getCompletedProjects, getProjectSurveys } from '@/app/completed-actions'
import { HodnoceniDashboard } from '@/components/HodnoceniDashboard'
import type { CompletedProject, ProjectSurvey } from '@/lib/types'

export default async function HodnoceniPage() {
  const [projectRows, surveyRows] = await Promise.all([
    getCompletedProjects(),
    getProjectSurveys(),
  ])
  const projects = (projectRows as unknown as CompletedProject[]).filter(p => p.project_type === 'client')
  const surveys = surveyRows as unknown as ProjectSurvey[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Hodnocení</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Dotazníky spokojenosti od klientů k dokončeným zakázkám
        </p>
      </div>
      <HodnoceniDashboard projects={projects} surveys={surveys} />
    </div>
  )
}
