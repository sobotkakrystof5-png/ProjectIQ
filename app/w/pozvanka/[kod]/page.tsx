import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { getAuthIdentity } from '@/lib/supabase/server'
import { isAccountInviteCode } from '@/lib/ws/invite-code'
import { WS_INVITE_PATH, WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'
import { acceptAccountInvite } from './actions'

export const metadata: Metadata = { title: 'Pozvánka', referrer: 'no-referrer' }

// Pozvánka vlastníka do účtu, který připravil admin (S17, migrace 100). Kód je
// v adrese jen na jedno použití; uplatní ho až tlačítko po přihlášení (ne samotné
// otevření odkazu, aby ho nespotřeboval náhled v e-mailu ani chat).
export default async function PozvankaPage({
  params,
  searchParams,
}: {
  params: Promise<{ kod: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { kod } = await params
  const { chyba } = await searchParams
  const valid = isAccountInviteCode(kod)
  const signedIn = Boolean(await getAuthIdentity())
  if (valid && !signedIn) redirect(`${WS_SIGN_IN_PATH}?next=${encodeURIComponent(`${WS_INVITE_PATH}/${kod}`)}`)

  async function accept() {
    'use server'
    await acceptAccountInvite(kod)
  }

  const problem =
    !valid || chyba === 'neplatna'
      ? 'Pozvánka už neplatí, byla použitá, nebo patří jinému e-mailu. Napište nám prosím a pošleme novou.'
      : chyba === 'vlastni-ucet'
        ? 'S tímhle e-mailem už máte vlastní účet. Napište nám prosím, převedeme to.'
        : null

  return (
    <AuthShell>
      <div className="rounded-panel border border-navy-100 bg-surface px-6 py-8 sm:px-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Pozvánka do ZakazIQ</h1>
        {problem ? (
          <>
            <p role="alert" className="mt-2 text-[15px] text-danger">
              {problem}
            </p>
            <Link href={WS_SIGN_UP_PATH} className="mt-6 inline-flex h-11 items-center rounded-full border border-navy-100 px-5 text-[15px] font-semibold text-ink hover:bg-navy-50">
              Založit vlastní účet
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-quiet">Účet je připravený. Převezměte si ho a pokračujte k předplatnému.</p>
            <form action={accept} className="mt-6">
              <button type="submit" className="inline-flex h-11 items-center rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800">
                Převzít účet
              </button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  )
}
