import { getCosts } from '@/app/completed-actions'
import CostsManager from '@/components/CostsManager'
import type { Cost } from '@/lib/types'

export default async function NakladyPage() {
  const rows = await getCosts()
  const costs = rows as unknown as Cost[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Náklady</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Eviduj fixní a jednorázové výdaje — výsledky se promítají do kalkulačky v sekci Dokončené zakázky.
        </p>
      </div>
      <CostsManager initialCosts={costs} />
    </div>
  )
}
