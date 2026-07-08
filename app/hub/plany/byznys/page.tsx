import { Briefcase, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getBusinesses } from './byznys-plan-actions'
import { ByznysListClient } from './ByznysListClient'

export default async function ByznysPlanyPage() {
  const businesses = await getBusinesses()

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/hub/plany"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Plány
        </Link>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-700 to-brand-900 rounded-lg flex items-center justify-center shadow-sm">
            <Briefcase size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Strategické plánování</h1>
        </div>
        <p className="text-sm text-muted-foreground">Byznys strategie připravené na export do reálné sekce Byznys — funnel krok 2</p>
      </div>

      <ByznysListClient businesses={businesses} />
    </div>
  )
}
