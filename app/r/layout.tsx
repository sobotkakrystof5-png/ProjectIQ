import type { Metadata, Viewport } from 'next'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'Objednávka', template: '%s' },
}

export const viewport: Viewport = { themeColor: '#f4f6fb' }

// Objednávací stránka /r/[slug] (S11, R-016): bez přihlášení, bez Clerku.
// CSP je vynucená s nonce (proxy), nonce dostane jen dynamická stránka.
// Rámování jen z povolených domén byznysu (frame-ancestors v proxy.ts).
export const dynamic = 'force-dynamic'

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
}
