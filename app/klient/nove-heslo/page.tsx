import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { NewPasswordForm } from '@/components/portal/auth-forms'
import { getPortalIdentity } from '@/lib/portal/context'
import { PORTAL_FORGOT_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Nové heslo' }

// Sem vede odkaz z e-mailu (přes /klient/auth/potvrzeni, které z něj udělá session).
export default async function NoveHesloPage() {
  if (!(await getPortalIdentity())) redirect(PORTAL_FORGOT_PATH)
  return (
    <AuthShell>
      <NewPasswordForm />
    </AuthShell>
  )
}
