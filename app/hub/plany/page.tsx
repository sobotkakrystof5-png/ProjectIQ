import { Target } from 'lucide-react'
import { getPlans } from './plany-actions'
import { PlanyDashboard } from './PlanyDashboard'

export default async function PlanyPage() {
  const plans = await getPlans()

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
            <Target size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Plány</h1>
        </div>
        <p className="text-sm text-muted-foreground">Nápady na budoucí projekty — analýza, potenciál a rozhodování před spuštěním</p>
      </div>

      <PlanyDashboard plans={plans} />
    </div>
  )
}
