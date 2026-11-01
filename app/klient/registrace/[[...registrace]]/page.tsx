import type { Metadata } from 'next'
import { SignUp } from '@clerk/nextjs'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { PORTAL_SIGN_IN_PATH, PORTAL_SIGN_UP_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Registrace' }

// Registraci otevírá pozvánka (/klient/pozvanka/<kód>), která sem posílá s návratem zpět.
export default function KlientRegistracePage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={PORTAL_SIGN_UP_PATH} signInUrl={PORTAL_SIGN_IN_PATH} />
    </AuthShell>
  )
}
