import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsAcceptInviteButton, WsInviteSignUpForm } from '@/components/ws/auth/auth-forms'
import { signOutWorkspace } from '@/app/w/auth-actions'
import { getWsIdentity } from '@/lib/ws/context'
import { wsSystem } from '@/lib/ws/db'
import { hashWsInviteCode, isWsInviteCodeShape } from '@/lib/ws/invite'
import { WS_INVITE_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Pozvánka', referrer: 'no-referrer' }

const SECONDARY =
  'inline-flex min-h-11 items-center rounded-chip border border-navy-100 px-5 text-sm font-medium text-ink hover:border-navy-300'

async function invitePreview(code: string): Promise<{ email: string; businessName: string | null } | null> {
  try {
    const [row] = await wsSystem<{ email: string; business_name: string | null }>`
      SELECT email, business_name FROM ws.account_invite_preview(${hashWsInviteCode(code)})
    `
    return row ? { email: row.email, businessName: row.business_name } : null
  } catch {
    return null
  }
}

// Pozvánka vlastníka do účtu, který připravil admin (S17, R-154). Kód je v adrese
// jen na jedno použití; uplatní ho až tlačítko (ne samotné otevření odkazu, aby
// ho nespotřeboval náhled v e-mailu ani chat). Přístup se zakládá jen s e-mailem,
// na který pozvánka zní.
export default async function PozvankaPage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params
  if (!isWsInviteCodeShape(kod)) redirect(`${WS_INVITE_PATH}/neplatna`)
  const invite = await invitePreview(kod)
  if (!invite) redirect(`${WS_INVITE_PATH}/neplatna`)

  const identity = await getWsIdentity()
  const signInHref = `${WS_SIGN_IN_PATH}?next=${encodeURIComponent(`${WS_INVITE_PATH}/${kod}`)}`
  const sameEmail = identity?.email?.trim().toLowerCase() === invite.email

  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">
          {invite.businessName ? `ZakazIQ pro ${invite.businessName}` : 'Vaše ZakazIQ je připravené'}
        </h1>
        <p className="mt-2 text-sm text-quiet">
          Poptávky, kalendář, zákazníci a faktury na jednom místě. Stačí si nastavit přístup.
        </p>

        {identity && sameEmail && <WsAcceptInviteButton code={kod} />}

        {identity && !sameEmail && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink">
              Pozvánka je pro e-mail <strong className="font-semibold">{invite.email}</strong>, ale jste přihlášení jiným účtem.
              Odhlaste se a pokračujte s tímhle e-mailem.
            </p>
            <form action={signOutWorkspace}>
              <button type="submit" className={SECONDARY}>
                Odhlásit se
              </button>
            </form>
          </div>
        )}

        {!identity && <WsInviteSignUpForm code={kod} email={invite.email} signInHref={signInHref} />}
      </div>
    </AuthShell>
  )
}
