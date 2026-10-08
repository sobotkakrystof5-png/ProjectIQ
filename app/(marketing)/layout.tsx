import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'

// Layout landing page — stejné tokeny a písma jako Workspace (design systém Dílky).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
}
