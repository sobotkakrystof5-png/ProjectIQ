'use server'

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { hashAccountInviteCode, InviteConfigError, isAccountInviteCode } from '@/lib/ws/invite-code'
import { isUniqueViolation, wsSystem } from '@/lib/ws/db'
import { WS_INVITE_PATH, WS_NEW_PASSWORD_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

// Uplatnění pozvánky vlastníka (migrace 100). Kód se ověřuje v databázi
// (jednorázový, neprošlý, nezrušený, vázaný na e-mail); chyba neříká proč,
// aby kód nešlo hádat. Výjimka: kdo už vlastní jiný účet, dozví se to.

export async function acceptAccountInvite(code: string): Promise<never> {
  const user = await getAuthUser()
  const back = `${WS_INVITE_PATH}/${code}`
  if (!user) redirect(`${WS_SIGN_IN_PATH}?next=${encodeURIComponent(back)}`)
  if (!isAccountInviteCode(code)) redirect(`${back}?chyba=neplatna`)

  let accountId: string | null = null
  let ownsOther = false
  try {
    const email = user.emailConfirmed && user.email ? user.email : ''
    const [row] = await wsSystem<{ a: string | null }>`
      SELECT ws.redeem_account_invite(${hashAccountInviteCode(code)}, ${user.id}, ${email}, ${user.name}) AS a
    `
    accountId = row?.a ?? null
  } catch (e) {
    if (isUniqueViolation(e)) ownsOther = true
    else if (!(e instanceof InviteConfigError)) {
      console.error('[ws/pozvanka] uplatnění selhalo', { error: e instanceof Error ? e.name : 'unknown' })
    }
  }
  if (ownsOther) redirect(`${back}?chyba=vlastni-ucet`)
  if (!accountId) redirect(`${back}?chyba=neplatna`)

  // Pozvaný přes odkaz z e-mailu heslo nemá — nabídnout ho, pak předplatné.
  redirect(`${WS_NEW_PASSWORD_PATH}?next=${encodeURIComponent(WS_ONBOARDING_PATH)}`)
}
