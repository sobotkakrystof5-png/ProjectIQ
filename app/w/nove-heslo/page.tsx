import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsNewPasswordForm } from '@/components/ws/auth/auth-forms'
import { getWsIdentity } from '@/lib/ws/context'
import { WS_FORGOT_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nové heslo' }

// Sem vede odkaz z e-mailu (přes /w/auth/potvrzeni, které z něj udělá session),
// nebo Účet › Přihlášení u účtu, který vznikl kódem a heslo ještě nemá.
export default async function NoveHesloPage({ searchParams }: { searchParams: Promise<{ prvni?: string }> }) {
  if (!(await getWsIdentity())) redirect(WS_FORGOT_PATH)
  const first = (await searchParams).prvni === '1'
  return (
    <AuthShell>
      <WsNewPasswordForm first={first} />
    </AuthShell>
  )
}
