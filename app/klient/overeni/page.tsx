import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { MfaGate } from '@/components/auth/mfa'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { getAuthIdentity } from '@/lib/supabase/server'
import { PORTAL_HOME_PATH, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Ověření přihlášení' }

// Kód z aplikace po přihlášení do klientského prostoru, má-li ho člověk
// zapnutý (R-081). Sem posílá requireClient(); stránka ho sama nevolá.
export default async function PortalMfaPage() {
  const identity = await getAuthIdentity()
  if (!identity) redirect(PORTAL_SIGN_IN_PATH)
  if (identity.aal === 'aal2') redirect(PORTAL_HOME_PATH)

  return (
    <AuthShell>
      <MfaGate
        next={PORTAL_HOME_PATH}
        enroll="never"
        signOut={
          <SignOutButton target="klient" className="font-semibold text-navy-500 hover:text-navy-700">
            Odhlásit se
          </SignOutButton>
        }
      />
    </AuthShell>
  )
}
