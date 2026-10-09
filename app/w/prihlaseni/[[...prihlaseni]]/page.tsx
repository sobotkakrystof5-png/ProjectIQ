import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení e-mailovým kódem nebo přes Google, bez hesla (AGENTS.md B4).
// Catch-all cesta kvůli krokům Clerku (/w/prihlaseni/factor-one…).
export default function PrihlaseniPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={WS_SIGN_IN_PATH} signUpUrl={WS_SIGN_UP_PATH} />
    </AuthShell>
  )
}
