import type { Metadata } from 'next'
import Link from 'next/link'
import { getAuthIdentity } from '@/lib/supabase/server'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { acceptInvite } from '../../actions'
import { isInviteCodeShape } from '@/lib/portal/invite'
import { PORTAL_INVITE_PATH, PORTAL_SIGN_IN_PATH, PORTAL_SIGN_UP_PATH } from '@/lib/portal/paths'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Pozvánka', referrer: 'no-referrer' }

// Kód je v adrese jen na jedno použití. Pozvánku uplatní až tlačítko po přihlášení
// (ne samotné otevření odkazu, aby ji nespotřeboval náhled v e-mailu ani chat).
export default async function PozvankaPage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params
  if (!isInviteCodeShape(kod)) redirect(`${PORTAL_INVITE_PATH}/neplatna`)
  const signedIn = Boolean(await getAuthIdentity())
  const back = encodeURIComponent(`${PORTAL_INVITE_PATH}/${kod}`)

  async function accept() {
    'use server'
    await acceptInvite(kod)
  }

  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Pozvánka do vašeho prostoru</h1>
        <p className="mt-2 text-sm text-quiet">
          Uvidíte tu stav svého projektu, co se udělalo a co čeká na vás. Přihlásíte se e-mailem a heslem, nebo přes Google.
        </p>
        {signedIn ? (
          <form action={accept} className="mt-5">
            <button type="submit" className="inline-flex min-h-[44px] items-center rounded-chip bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800">
              Přijmout pozvánku
            </button>
          </form>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`${PORTAL_SIGN_UP_PATH}?next=${back}`} className="inline-flex min-h-[44px] items-center rounded-chip bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800">
              Vytvořit přístup
            </Link>
            <Link href={`${PORTAL_SIGN_IN_PATH}?next=${back}`} className="inline-flex min-h-[44px] items-center rounded-chip border border-navy-100 px-5 text-sm font-medium text-ink hover:border-navy-300">
              Už mám přístup, přihlásit se
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  )
}
