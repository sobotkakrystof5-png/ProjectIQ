import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getBusiness, getBusinessPhases } from '../byznys-plan-actions'
import { ByznysDetailClient } from './ByznysDetailClient'

interface Props {
  params: { id: string }
}

export default async function ByznysDetailPage({ params }: Props) {
  const [business, phases] = await Promise.all([
    getBusiness(params.id),
    getBusinessPhases(params.id),
  ])

  if (!business) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/hub/plany/byznys"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Byznys strategie
        </Link>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{business.title}</h1>
      </div>

      <ByznysDetailClient business={business} phases={phases} />
    </div>
  )
}
