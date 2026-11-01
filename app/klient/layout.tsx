import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { csCZ } from '@clerk/localizations'
import { WsRoot } from '@/components/ws/ws-root'
import { clerkAppearance } from '@/components/ws/auth/clerk-appearance'
import { wsFontVariables } from '@/lib/ws/fonts'
import { PORTAL_HOME_PATH, PORTAL_SIGN_IN_PATH, PORTAL_SIGN_UP_PATH } from '@/lib/portal/paths'
import { headers } from 'next/headers'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'Váš projekt', template: '%s · ZakazIQ' },
  // Za přihlášením, do vyhledávačů nepatří.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#f4f6fb',
  viewportFit: 'cover',
}

// CSP na /klient je vynucená s nonce z proxy.ts (stejně jako /w): nonce dostanou
// jen dynamicky renderované stránky.
export const dynamic = 'force-dynamic'

// Klientský prostor (KP05). Clerk jen tady a pod /w; bez organizací — klienta
// určuje tabulka portal.members, ne organizace Clerku.
export default async function KlientLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <ClerkProvider
      dynamic
      localization={csCZ}
      appearance={clerkAppearance}
      telemetry={false}
      signInUrl={PORTAL_SIGN_IN_PATH}
      signUpUrl={PORTAL_SIGN_UP_PATH}
      signInFallbackRedirectUrl={PORTAL_HOME_PATH}
      signUpFallbackRedirectUrl={PORTAL_HOME_PATH}
      afterSignOutUrl={PORTAL_SIGN_IN_PATH}
    >
      <WsRoot fontClassName={wsFontVariables} nonce={nonce}>
        {children}
      </WsRoot>
    </ClerkProvider>
  )
}
