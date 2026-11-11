import { PageShell } from '@/components/ws/app/page-header'
import { getCallsScreen } from '@/app/calls-actions'
import LeadsTable from '@/components/LeadsTable'
import ProjectCalculator from '@/components/ProjectCalculator'

export default async function CallsPage(
  props: {
    searchParams: Promise<{ lead?: string }>
  }
) {
  const searchParams = await props.searchParams
  const { leads, notes } = await getCallsScreen()

  return (
    <PageShell width="table" className="gap-10">
      <LeadsTable initialLeads={leads} initialNotes={notes} focusLeadId={searchParams.lead} />
      <div className="border-t border-navy-100 pt-10">
        <ProjectCalculator />
      </div>
    </PageShell>
  )
}
