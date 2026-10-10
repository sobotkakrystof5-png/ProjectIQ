import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PublicPage } from '@/components/ws/email/public-page'
import { PortalScreen } from '@/components/ws/portal/portal-screen'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { loadPortal, resolvePortal } from '@/lib/ws/portal'

// Klientský portál /z/[token] (S16, R-051): zákazník firmy bez registrace
// vidí svůj termín nebo zakázku. Neplatný, cizí i vypnutý odkaz = stejná 404.
// Interní poznámky firmy se sem nenačítají vůbec (lib/ws/portal.ts).

export const metadata: Metadata = { title: 'Váš termín', referrer: 'no-referrer' }

const load = cache(async (token: string) => {
  const ref = await resolvePortal(token)
  if (!ref) return null
  return loadPortal(ref)
})

export default async function PortalPage({ params }: { params: { token: string } }) {
  if (await hitLimit(LIMITS.portalViewPerIp, clientIp(headers()))) {
    return (
      <PublicPage title="Chvilku strpení">
        <p className="text-[15px] text-quiet">Stránku teď otevíralo moc lidí najednou. Zkuste ji prosím načíst za minutu.</p>
      </PublicPage>
    )
  }
  const view = await load(params.token)
  if (!view) notFound()
  return <PortalScreen token={params.token} view={view} />
}
