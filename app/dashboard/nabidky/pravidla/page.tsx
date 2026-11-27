import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { RulesForm } from '@/components/admin/offers/rules-form'
import { requireAdminPage } from '@/lib/auth'
import { loadPricingRules } from '@/lib/admin/offers/proposals'

export const metadata: Metadata = { title: 'Cenová pravidla' }
export const dynamic = 'force-dynamic'

/** Cenová pravidla navrhovače nabídek (R-147, plán oddíl 5). */
export default async function PricingRulesPage() {
  await requireAdminPage()
  const { rules, stored, updatedAt } = await loadPricingRules()
  return (
    <PageShell width="wide">
      <Link
        href="/dashboard/nabidky"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
        Nabídky
      </Link>
      <PageHeader
        title="Cenová pravidla"
        subtitle="Z nich se počítají tři varianty každé nabídky. Cena podle hodnoty pro klienta, ne podle hodin."
        subtitleFont="sans"
      />
      <RulesForm rules={rules} stored={stored} updatedAt={updatedAt} />
    </PageShell>
  )
}
