import type { Metadata } from 'next'
import { PortalFrame } from '@/components/portal/portal-frame'
import { SecuritySettings } from '@/components/auth/security-settings'
import { getPortalContext, requirePortalIdentity } from '@/lib/portal/context'
import { PORTAL_SECURITY_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Přihlášení a zabezpečení' }

// Přihlášení a zabezpečení klienta (R-081): 2FA, heslo, e-mail, odhlášení všude.
export default async function PortalSecurityPage() {
  const identity = await requirePortalIdentity()
  const ctx = await getPortalContext()

  return (
    <PortalFrame clientName={ctx?.clientName ?? ''}>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Přihlášení a zabezpečení</h1>
      <p className="mb-6 mt-1 text-sm text-quiet">Kdo a jak se dostane k vašemu účtu.</p>
      <SecuritySettings signOutTarget="klient" email={identity.email} returnPath={PORTAL_SECURITY_PATH} />
    </PortalFrame>
  )
}
