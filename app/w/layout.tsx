import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { ClerkProvider } from '@clerk/nextjs'
import { csCZ } from '@clerk/localizations'
import { PwaRegister } from '@/components/ws/app/pwa-register'
import { WsRoot } from '@/components/ws/ws-root'
import { clerkAppearance } from '@/components/ws/auth/clerk-appearance'
import { wsFontVariables } from '@/lib/ws/fonts'
import { WS_HOME_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'
import { parseThemePref, THEME_COOKIE } from '@/lib/ws/theme'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'ZakazIQ', template: '%s · ZakazIQ' },
  // Aplikace za přihlášením — do vyhledávačů nepatří (přihlášení a registrace taky ne).
  robots: { index: false, follow: false },
  // PWA (S18): „Přidat na plochu“, ikona z loga, offline stránka (public/sw.js).
  manifest: '/zakaziq.webmanifest',
  icons: { icon: '/ikony/ikona.svg', apple: '/ikony/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'ZakazIQ', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1a36' },
  ],
  viewportFit: 'cover',
}

// CSP na /w je vynucená s nonce z proxy.ts. Nonce dostanou jen dynamicky
// renderované stránky — statická by měla skripty bez nonce a prohlížeč je zablokuje.
export const dynamic = 'force-dynamic'

// Layout aplikace Workspace. Clerk jen tady (ne v kořenovém layoutu adminu):
// `dynamic` = ClerkProvider vezme nonce z hlavičky x-nonce a dá ho skriptu
// clerk-js. Telemetrie vypnutá — jinak by potřebovala další host v CSP.
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // Vzhled z Účtu (S18); nonce kvůli skriptu „Podle systému“ ve WsRoot.
  const themePref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value)
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <ClerkProvider
      dynamic
      localization={csCZ}
      appearance={clerkAppearance}
      telemetry={false}
      signInUrl={WS_SIGN_IN_PATH}
      signUpUrl={WS_SIGN_UP_PATH}
      signInFallbackRedirectUrl={WS_HOME_PATH}
      signUpFallbackRedirectUrl={WS_ONBOARDING_PATH}
      afterSignOutUrl="/"
    >
      <WsRoot fontClassName={wsFontVariables} themePref={themePref} nonce={nonce}>
        <PwaRegister />
        {children}
      </WsRoot>
    </ClerkProvider>
  )
}
