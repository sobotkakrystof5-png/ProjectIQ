import { PageHeader, PageShell } from '@/components/ws/app/page-header'
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
    <PageShell>
      <PageHeader
        title="Hodnocení"
        subtitle="Dotazníky spokojenosti od klientů k dokončeným zakázkám."
        subtitleFont="sans"
      />
      <HodnoceniDashboard projects={projects} surveys={surveys} />
    </PageShell>
  )
}
