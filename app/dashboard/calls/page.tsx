import { getLeads } from '@/app/calls-actions'
import LeadsTable from '@/components/LeadsTable'
import ProjectCalculator from '@/components/ProjectCalculator'
import type { ClientLead } from '@/lib/types'

export default async function CallsPage() {
  const rows = await getLeads()
  const leads = rows as unknown as ClientLead[]

  return (
    <div className="space-y-10">
      <LeadsTable initialLeads={leads} />
      <div className="border-t border-border pt-10">
        <ProjectCalculator />
      </div>
    </div>
  )
}
