import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { PwaRegister } from '@/components/ws/app/pwa-register'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import { parseThemePref, THEME_COOKIE } from '@/lib/ws/theme'
import { parsePrivacyMode, PRIVACY_COOKIE } from '@/lib/ws/privacy'
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

// Layout aplikace Workspace. Přihlášení (Supabase Auth, R-080) hlídá proxy.ts
// a requireWorkspace(); layout žádného poskytovatele přihlášení nepotřebuje.
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // Vzhled z Účtu (S18); nonce kvůli skriptu „Podle systému“ ve WsRoot.
  const cookieJar = await cookies()
  const themePref = parseThemePref(cookieJar.get(THEME_COOKIE)?.value)
  const privacyMode = parsePrivacyMode(cookieJar.get(PRIVACY_COOKIE)?.value)
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <WsRoot fontClassName={wsFontVariables} themePref={themePref} privacyMode={privacyMode} nonce={nonce}>
      <PwaRegister />
      {children}
    </WsRoot>
  )
}
