import type { Metadata } from 'next'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'ZakazIQ', template: '%s · ZakazIQ' },
}

// CSP na /w je vynucená s nonce z middleware.ts. Nonce dostanou jen dynamicky
// renderované stránky — statická by měla skripty bez nonce a prohlížeč je zablokuje.
export const dynamic = 'force-dynamic'

// Layout aplikace Workspace. Přihlášení přes Clerk a requireWorkspace() přibudou v S07.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
}
