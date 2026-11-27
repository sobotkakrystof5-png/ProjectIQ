import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsSignUpClosed, WsSignUpForm } from '@/components/ws/auth/auth-forms'
import { getWsIdentity } from '@/lib/ws/context'
import { WS_ONBOARDING_PATH, WS_SIGNUP_OPEN } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Registrace' }

// Registrace s ověřením e-mailu kódem (R-154). Dokud není spuštěné placení,
// je zavřená (R-134): stránka vede na formulář „Chci to vyzkoušet" a server
// action registraci odmítne i napřímo.
export default async function RegistracePage() {
  if (await getWsIdentity()) redirect(WS_ONBOARDING_PATH)
  return <AuthShell>{WS_SIGNUP_OPEN ? <WsSignUpForm /> : <WsSignUpClosed />}</AuthShell>
}
