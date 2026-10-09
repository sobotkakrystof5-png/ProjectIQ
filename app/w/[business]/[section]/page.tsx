import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { AccentHeading, EmptyState } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { NAV_ITEMS, navHref, navItemForSegment } from '@/lib/ws/nav'
import { pragueToday } from '@/lib/ws/time'

// Zástupná obrazovka pro části, které ještě nejsou postavené (Poptávky,
// Kalendář… postaví S10–S14). Jakmile vznikne app/w/[business]/<část>/page.tsx,
// má přednost před touhle dynamickou cestou. Neznámá nebo vypnutá část = 404.

type SearchParams = Record<string, string | string[] | undefined>

export function generateMetadata({ params }: { params: { section: string } }): Metadata {
  const item = NAV_ITEMS.find((i) => i.segment === params.section && i.segment !== '')
  return { title: item?.label ?? 'Nenalezeno' }
}

export default async function SectionPlaceholder({
  params,
  searchParams,
}: {
  params: { business: string; section: string }
  searchParams: SearchParams
}) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const item = navItemForSegment(params.section, await getEnabledModules(ctx, business))
  if (!item) notFound()

  const pathname = navHref(business.slug, item.segment)
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AccentHeading>{item.label}</AccentHeading>
      <EmptyState
        title="Tuhle obrazovku právě stavíme"
        description="Všechno důležité zatím najdete na obrazovce Dnes. Hledat můžete přes ⌘K."
        action={
          <Link href={navHref(business.slug, '')} className={buttonVariants({ variant: 'outline' })}>
            Zpět na Dnes
          </Link>
        }
      />
      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={pragueToday()} />
    </div>
  )
}
