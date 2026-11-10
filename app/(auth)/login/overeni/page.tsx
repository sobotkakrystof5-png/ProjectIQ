import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAdminCandidate, getAdminSession } from '@/lib/auth'
import { safeNextPath } from '@/lib/auth/redirect'
import { MfaGate } from '@/components/auth/mfa'
import { SignOutButton } from '@/components/auth/sign-out-button'

export const metadata: Metadata = { title: 'Ověření přihlášení' }

// Druhý krok přihlášení do administrace (R-081): kód z aplikace je povinný.
// Bez nastavené aplikace si ji admin nastaví tady. Proxy sem posílá každou
// admin stránku, dokud relace nemá úroveň aal2.
export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const next = safeNextPath(typeof sp.next === 'string' ? sp.next : null, '/dashboard')
  if (await getAdminSession()) redirect(next)
  if (!(await getAdminCandidate())) redirect(`/login?next=${encodeURIComponent(next)}`)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10 font-ws">
      <div className="w-full max-w-md">
        <MfaGate
          next={next}
          enroll="required"
          signOut={
            <SignOutButton target="admin" className="font-semibold text-navy-500 hover:text-navy-700">
              Odhlásit se
            </SignOutButton>
          }
        />
      </div>
    </div>
  )
}
