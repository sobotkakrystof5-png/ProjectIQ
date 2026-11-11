import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { getCosts } from '@/app/costs-actions'
import CostsManager from '@/components/CostsManager'

export default async function NakladyPage() {
  const costs = await getCosts()

  return (
    <PageShell>
      <PageHeader
        title="Náklady"
        subtitle="Fixní a jednorázové výdaje. Promítají se do přehledu ve Financích."
        subtitleFont="sans"
      />
      <CostsManager initialCosts={costs} />
    </PageShell>
  )
}
