'use client'

import { ErrorScreen, SUPPORT_HINT } from '@/components/ws/error-screen'
import { PORTAL_HOME_PATH } from '@/lib/portal/paths'

// Klientský prostor (KP05): zpět na přehled zakázek.
export default function ClientSpaceError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-ground">
      <ErrorScreen description={SUPPORT_HINT} retry={retry} home={{ href: PORTAL_HOME_PATH, label: 'Zpět na přehled' }} className="pt-16" />
    </div>
  )
}
