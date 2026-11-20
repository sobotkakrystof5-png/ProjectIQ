import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { ClientSignInForm } from '@/components/portal/auth-forms'
import { getPortalIdentity } from '@/lib/portal/context'
import { PORTAL_START_PATH, safePortalNext } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení e-mailem a heslem (R-107). `next` jen uvnitř /klient; bez něj
// /klient/start (chat s nepřečtenou zprávou, jinak přehled).
export default async function KlientPrihlaseniPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = (await searchParams).next
  const next = raw ? safePortalNext(raw) : PORTAL_START_PATH
  if (await getPortalIdentity()) redirect(next)
  return (
    <AuthShell>
      <ClientSignInForm next={next} />
    </AuthShell>
  )
}
