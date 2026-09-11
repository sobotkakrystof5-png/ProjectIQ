import { getLeads, getAllLeadNotes } from '@/app/calls-actions'
import LeadsTable from '@/components/LeadsTable'
import ProjectCalculator from '@/components/ProjectCalculator'
import type { ClientLead } from '@/lib/types'

export default async function CallsPage({
  searchParams,
}: {
  searchParams: { lead?: string }
}) {
  const [rows, notes] = await Promise.all([getLeads(), getAllLeadNotes()])
  const leads = rows as unknown as ClientLead[]

  return (
    <div className="space-y-10">
      <LeadsTable initialLeads={leads} initialNotes={notes} focusLeadId={searchParams.lead} />
      <div className="border-t border-border pt-10">
        <ProjectCalculator />
      </div>
    </div>
  )
}
