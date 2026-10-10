import type { Metadata, Viewport } from 'next'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'ZakazIQ', template: '%s · ZakazIQ' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#f4f6fb' }

// Veřejné odkazy Workspace pod /z (R-016): odkazy z e-mailů (S15 — potvrzení
// poptávky majitelem, odhlášení, termín do kalendáře), později klientský
// portál (S16). Bez přihlášení a bez Clerku, oprávnění dává podepsaný odkaz.
// CSP je vynucená s nonce (middleware), proto dynamicky.
export const dynamic = 'force-dynamic'

export default function PublicLinkLayout({ children }: { children: React.ReactNode }) {
  return <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
}
