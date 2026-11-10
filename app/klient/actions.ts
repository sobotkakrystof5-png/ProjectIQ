'use server'

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { hashInviteCode, isInviteCodeShape, InviteConfigError } from '@/lib/portal/invite'
import { portalSystem } from '@/lib/portal/db'
import { PORTAL_HOME_PATH, PORTAL_INVITE_PATH, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Uplatnění pozvánky (KP05). Kód z adresy se ověřuje v databázi (jednorázový,
// neprošlý, nezrušený, případně vázaný na e-mail); chyba nikdy neříká proč, aby
// kód nešlo hádat.

export async function acceptInvite(code: string): Promise<never> {
  // Uživatel přímo z Auth serveru: e-mail a jeho ověření musí být aktuální.
  const user = await getAuthUser()
  if (!user) redirect(PORTAL_SIGN_IN_PATH)
  if (!isInviteCodeShape(code)) redirect(`${PORTAL_INVITE_PATH}/neplatna`)

  let clientId: string | null = null
  try {
    // Vázanou pozvánku smí uplatnit jen ověřený e-mail.
    const email = user.emailConfirmed && user.email ? user.email : ''
    const rows = await portalSystem<{ c: string | null }>`
      SELECT portal.redeem_invite_for_user(${hashInviteCode(code)}, ${user.id}, ${email}, ${user.name}) AS c
    `
    clientId = rows[0]?.c ?? null
  } catch (err) {
    if (!(err instanceof InviteConfigError)) {
      console.error('[portal] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
  }
  redirect(clientId ? PORTAL_HOME_PATH : `${PORTAL_INVITE_PATH}/neplatna`)
}
