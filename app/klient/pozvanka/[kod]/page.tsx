import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { InviteSignUpForm } from '@/components/portal/auth-forms'
import { acceptInvite, signOutClient } from '../../actions'
import { getPortalIdentity } from '@/lib/portal/context'
import { hashInviteCode, isInviteCodeShape } from '@/lib/portal/invite'
import { PORTAL_INVITE_PATH, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'
import { inviteEmailByHash } from '@/lib/supabase/signup-hook'

export const metadata: Metadata = { title: 'Pozvánka', referrer: 'no-referrer' }

const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-chip bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800'
const SECONDARY =
  'inline-flex min-h-[44px] items-center rounded-chip border border-navy-100 px-5 text-sm font-medium text-ink hover:border-navy-300'

async function invitedEmail(code: string): Promise<string | null> {
  try {
    return await inviteEmailByHash(hashInviteCode(code))
  } catch {
    return null
  }
}

// Kód je v adrese jen na jedno použití. Pozvánku uplatní až tlačítko (ne samotné
// otevření odkazu, aby ji nespotřeboval náhled v e-mailu ani chat). Pozvánka je
// vázaná na e-mail (migrace 113): přístup se zakládá jen s ním.
export default async function PozvankaPage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params
  if (!isInviteCodeShape(kod)) redirect(`${PORTAL_INVITE_PATH}/neplatna`)
  const email = await invitedEmail(kod)
  if (!email) redirect(`${PORTAL_INVITE_PATH}/neplatna`)

  const identity = await getPortalIdentity()
  const back = encodeURIComponent(`${PORTAL_INVITE_PATH}/${kod}`)
  const signInHref = `${PORTAL_SIGN_IN_PATH}?next=${back}`
  const sameEmail = identity?.email?.trim().toLowerCase() === email.trim().toLowerCase()

  async function accept() {
    'use server'
    await acceptInvite(kod)
  }

  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Pozvánka do vašeho prostoru</h1>
        <p className="mt-2 text-sm text-quiet">
          Uvidíte tu stav svého projektu, co se udělalo a co čeká na vás.
        </p>

        {identity && sameEmail && (
          <form action={accept} className="mt-5">
            <button type="submit" className={BUTTON}>
              Přijmout pozvánku
            </button>
          </form>
        )}

        {identity && !sameEmail && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink">
              Pozvánka je pro e-mail <strong className="font-semibold">{email}</strong>, ale jste přihlášení jiným účtem.
              Odhlaste se a pokračujte s tímhle e-mailem.
            </p>
            <form action={signOutClient}>
              <button type="submit" className={SECONDARY}>
                Odhlásit se
              </button>
            </form>
          </div>
        )}

        {!identity && <InviteSignUpForm code={kod} email={email} signInHref={signInHref} />}
      </div>
    </AuthShell>
  )
}
