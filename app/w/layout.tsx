import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { csCZ } from '@clerk/localizations'
import { WsRoot } from '@/components/ws/ws-root'
import { clerkAppearance } from '@/components/ws/auth/clerk-appearance'
import { wsFontVariables } from '@/lib/ws/fonts'
import { WS_HOME_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'ZakazIQ', template: '%s · ZakazIQ' },
  // Aplikace za přihlášením — do vyhledávačů nepatří (přihlášení a registrace taky ne).
  robots: { index: false, follow: false },
}

// CSP na /w je vynucená s nonce z proxy.ts. Nonce dostanou jen dynamicky
// renderované stránky — statická by měla skripty bez nonce a prohlížeč je zablokuje.
export const dynamic = 'force-dynamic'

// Layout aplikace Workspace. Clerk jen tady (ne v kořenovém layoutu adminu):
// `dynamic` = ClerkProvider vezme nonce z hlavičky x-nonce a dá ho skriptu
// clerk-js. Telemetrie vypnutá — jinak by potřebovala další host v CSP.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
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
      <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
    </ClerkProvider>
  )
}
