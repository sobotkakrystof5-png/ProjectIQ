'use client'

import { ErrorScreen, SUPPORT_HINT } from '@/components/ws/error-screen'
import { WS_HOME_PATH } from '@/lib/ws/paths'

// Chyba mimo obrazovky byznysu (Účet, průvodce, předplatné) i v kostře byznysu.
export default function WorkspaceError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-ground">
      <ErrorScreen description={SUPPORT_HINT} retry={retry} home={{ href: WS_HOME_PATH, label: 'Zpět do aplikace' }} className="pt-16" />
    </div>
  )
}
