import type { Metadata } from 'next'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'ZakazIQ', template: '%s · ZakazIQ' },
}

// Layout aplikace Workspace. Přihlášení přes Clerk a requireWorkspace() přibudou v S07.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WsRoot fontClassName={wsFontVariables}>{children}</WsRoot>
}
