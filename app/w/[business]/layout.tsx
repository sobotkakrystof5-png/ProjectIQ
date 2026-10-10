import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppFrame } from '@/components/ws/app/app-frame'
import { BillingBanner } from '@/components/ws/billing/billing-banner'
import { getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { LAST_BUSINESS_COOKIE, WS_ONBOARDING_PATH } from '@/lib/ws/paths'
import { orderPageUrl } from '@/lib/ws/app-origin'
import { formatDayShort, formatMinutes, pragueParts } from '@/lib/ws/time'
import { getBusinesses, getEnabledModules, getNotifications } from '@/lib/ws/today'
import { wsDb } from '@/lib/ws/db'
import { getNews } from '@/lib/ws/email/inbox'

// Kostra aplikace pro jeden byznys (S09): postranní panel, hlavička,
// spodní lišta, ⌘K. Byznys z URL se ověří proti účtu — cizí slug = 404.

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { business: string }
}) {
  const ctx = await requireWorkspace()
  const [business, billing] = await Promise.all([requireBusiness(ctx, params.business), getBillingState(ctx.accountId)])
  // Účet, který nikdy neprošel Checkoutem, dokončí průvodce (S08, krok 2).
  if (billing.access === 'none') redirect(WS_ONBOARDING_PATH)

  const [businesses, modules, notifications, services, news] = await Promise.all([
    getBusinesses(ctx),
    getEnabledModules(ctx, business),
    getNotifications(ctx, business),
    wsDb(ctx)<{ name: string }>`
      SELECT name FROM ws.services
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND active
      ORDER BY position, name
    `,
    getNews(ctx).catch(() => ({ items: [], unseen: false })),
  ])
  const isOwner = hasRole(ctx, 'owner')
  const now = new Date()

  return (
    <AppFrame
      business={{ name: business.name, slug: business.slug }}
      businesses={businesses}
      enabledModules={Array.from(modules)}
      isOwner={isOwner}
      orderUrl={orderPageUrl(business.slug)}
      services={services.map((s) => s.name)}
      today={pragueParts(now).date}
      notifications={{
        unread: notifications.unread,
        items: notifications.items.map((n) => {
          const at = pragueParts(n.created_at)
          return {
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            read: n.read,
            at: `${formatDayShort(at.date)} ${formatMinutes(at.minutes)}`,
          }
        }),
        news: news.items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, at: formatDayShort(pragueParts(n.publishedAt).date) })),
        newsUnseen: news.unseen,
      }}
      rememberedSlug={cookies().get(LAST_BUSINESS_COOKIE)?.value ?? null}
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
