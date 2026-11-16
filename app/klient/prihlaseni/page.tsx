import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { ClientSignInForm } from '@/components/portal/auth-forms'
import { getPortalIdentity } from '@/lib/portal/context'
import { safePortalNext } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení e-mailem a heslem (R-107). `next` jen uvnitř /klient.
export default async function KlientPrihlaseniPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePortalNext((await searchParams).next)
  if (await getPortalIdentity()) redirect(next)
  return (
    <AuthShell>
      <ClientSignInForm next={next} />
    </AuthShell>
  )
}
