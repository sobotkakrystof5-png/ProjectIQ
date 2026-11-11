import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { HodnoceniDashboard } from '@/components/HodnoceniDashboard'
import { loadRatingsScreen } from '@/lib/admin/completed'

export default async function HodnoceniPage() {
  const { projects, surveys } = await loadRatingsScreen()

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
