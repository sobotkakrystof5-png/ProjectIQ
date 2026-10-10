import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { SegmentSettings } from '@/components/ws/settings/segment-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { getSegmentRules } from '@/lib/ws/segments'

export const metadata: Metadata = { title: 'Skupiny zákazníků' }

/** Nastavení › Skupiny zákazníků (S12). Jen vlastník. Výchozí hranice přišly se šablonou oboru. */
export default async function SegmentSettingsPage({ params }: { params: { business: string } }) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  requireRole(ctx, 'owner')
  const [rules, billing] = await Promise.all([getSegmentRules(ctx, business), getBillingState(ctx.accountId)])

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href={navHref(business.slug, 'nastaveni')}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] font-medium text-quiet hover:text-ink"
      >
        <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        Nastavení
      </Link>
      <AccentHeading accent="podle návštěv.">Skupiny zákazníků</AccentHeading>
      <p className="text-[15px] text-quiet">
        Každý zákazník je v jedné skupině. Počítá se sama z návštěv a zakázek, jednou denně a po každé návštěvě.
      </p>
      <SegmentSettings slug={business.slug} rules={rules} readOnly={!canWrite(billing)} />
    </div>
  )
}
