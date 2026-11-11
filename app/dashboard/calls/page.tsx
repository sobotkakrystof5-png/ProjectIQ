import { PageShell } from '@/components/ws/app/page-header'
import { getLeads, getAllLeadNotes } from '@/app/calls-actions'
import LeadsTable from '@/components/LeadsTable'
import ProjectCalculator from '@/components/ProjectCalculator'
import type { ClientLead } from '@/lib/types'

export default async function CallsPage(
  props: {
    searchParams: Promise<{ lead?: string }>
  }
) {
  const searchParams = await props.searchParams
  const [rows, notes] = await Promise.all([getLeads(), getAllLeadNotes()])
  const leads = rows as unknown as ClientLead[]

  return (
    <PageShell width="table" className="gap-10">
      <LeadsTable initialLeads={leads} initialNotes={notes} focusLeadId={searchParams.lead} />
      <div className="border-t border-navy-100 pt-10">
        <ProjectCalculator />
      </div>
    </PageShell>
  )
}
