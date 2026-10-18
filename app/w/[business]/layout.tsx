import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppFrame } from '@/components/ws/app/app-frame'
import { BillingBanner } from '@/components/ws/billing/billing-banner'
import { hasRole } from '@/lib/ws/context'
import { getFrameChrome } from '@/lib/ws/chrome'
import { LAST_BUSINESS_COOKIE, WS_ONBOARDING_PATH } from '@/lib/ws/paths'
import { orderPageUrl } from '@/lib/ws/app-origin'
import { loadBusinessScope } from '@/lib/ws/scope'
import { pragueParts } from '@/lib/ws/time'

// Kostra aplikace pro jeden byznys (S09): postranní panel, hlavička,
// spodní lišta, ⌘K. Byznys z URL se ověří proti účtu — cizí slug = 404.
//
// RD02: účet, byznys, předplatné, funkce a byznysy přijdou jedním dotazem
// (loadBusinessScope). Zvonek, novinky a služby pro ⌘K se do DB ptají zároveň
// se stránkou a do hotové kostry se doplní (Promise v `chrome`), takže stránka
// na ně nečeká.

export default async function BusinessLayout(
  props: {
    children: React.ReactNode
    params: Promise<{ business: string }>
  }
) {
  const params = await props.params

  const {
    children
  } = props

  const { ctx, business, billing, modules, businesses } = await loadBusinessScope(params.business)
  // Účet, který nikdy neprošel Checkoutem, dokončí průvodce (S08, krok 2).
  if (billing.access === 'none') redirect(WS_ONBOARDING_PATH)

  const isOwner = hasRole(ctx, 'owner')
  const chrome = getFrameChrome(ctx, business)

  return (
    <AppFrame
      business={{ name: business.name, slug: business.slug }}
      businesses={businesses}
      enabledModules={Array.from(modules)}
      isOwner={isOwner}
      orderUrl={await orderPageUrl(business.slug)}
      today={pragueParts(new Date()).date}
      chrome={chrome}
      rememberedSlug={(await cookies()).get(LAST_BUSINESS_COOKIE)?.value ?? null}
    >
      {(billing.access === 'grace' || billing.access === 'read_only') && (
        <div className="px-4 pt-4 sm:px-6 lg:px-8">
          <BillingBanner state={billing} isOwner={isOwner} />
        </div>
      )}
      {children}
    </AppFrame>
  )
}
