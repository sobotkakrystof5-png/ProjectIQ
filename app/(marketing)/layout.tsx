import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'
import './landing.css'

// CSP na landing page je vynucená s nonce z proxy.ts (R-033, DECISIONS #007).
// Nonce dostanou jen dynamicky renderované stránky — statická by měla skripty bez nonce.
export const dynamic = 'force-dynamic'

// Layout landing page — stejné tokeny a písma jako Workspace (design systém Dílky).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <WsRoot fontClassName={wsFontVariables} className="overflow-x-clip">
      <div data-page="landing">{children}</div>
    </WsRoot>
  )
}
