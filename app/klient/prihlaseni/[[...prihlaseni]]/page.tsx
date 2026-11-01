import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { PORTAL_SIGN_IN_PATH, PORTAL_SIGN_UP_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení e-mailovým kódem, bez hesla. Catch-all kvůli krokům Clerku.
export default function KlientPrihlaseniPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={PORTAL_SIGN_IN_PATH} signUpUrl={PORTAL_SIGN_UP_PATH} />
    </AuthShell>
  )
}
