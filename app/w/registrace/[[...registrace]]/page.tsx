import type { Metadata } from 'next'
import { SignUp } from '@clerk/nextjs'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Registrace' }

// Registrace e-mailovým kódem nebo přes Google, bez hesla. Po ní průvodce
// /w/novy (signUpFallbackRedirectUrl v app/w/layout.tsx).
export default function RegistracePage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={WS_SIGN_UP_PATH} signInUrl={WS_SIGN_IN_PATH} />
    </AuthShell>
  )
}
