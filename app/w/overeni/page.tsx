import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { MfaGate } from '@/components/auth/mfa'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { getAuthIdentity } from '@/lib/supabase/server'
import { WS_HOME_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Ověření přihlášení' }

// Kód z aplikace po přihlášení, má-li člověk zapnuté 2FA (R-081). Sem posílá
// requireIdentity(); tahle stránka ho sama nevolá, jinak by se točila v kruhu.
export default async function WsMfaPage() {
  const identity = await getAuthIdentity()
  if (!identity) redirect(WS_SIGN_IN_PATH)
  if (identity.aal === 'aal2') redirect(WS_HOME_PATH)

  return (
    <AuthShell>
      <MfaGate
        next={WS_HOME_PATH}
        enroll="never"
        signOut={
          <SignOutButton target="w-prihlaseni" className="font-semibold text-navy-500 hover:text-navy-700">
            Odhlásit se
          </SignOutButton>
        }
      />
    </AuthShell>
  )
}
