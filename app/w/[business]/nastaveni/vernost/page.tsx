import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { LoyaltySettings } from '@/components/ws/settings/loyalty-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { getBookingOptions } from '@/lib/ws/calendar'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { getLoyaltyProgram } from '@/lib/ws/loyalty'
import { navHref } from '@/lib/ws/nav'

export const metadata: Metadata = { title: 'Věrnost' }

/** Nastavení › Věrnost (S12). Jen vlastník. */
export default async function LoyaltySettingsPage(props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  requireRole(ctx, 'owner')
  const [program, options, billing] = await Promise.all([
    getLoyaltyProgram(ctx, business),
    getBookingOptions(ctx, business),
    getBillingState(ctx.accountId),
  ])

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href={navHref(business.slug, 'nastaveni')}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] font-medium text-quiet hover:text-ink"
      >
        <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        Nastavení
      </Link>
      <AccentHeading accent="se vyplatí.">Věrnost</AccentHeading>
      <LoyaltySettings
        slug={business.slug}
        businessName={business.name}
        program={program}
        services={options.services.map((s) => ({ id: s.id, name: s.name }))}
        readOnly={!canWrite(billing)}
      />
    </div>
  )
}
