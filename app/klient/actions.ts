'use server'

import { redirect } from 'next/navigation'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { hashInviteCode, isInviteCodeShape, InviteConfigError } from '@/lib/portal/invite'
import { portalSystem } from '@/lib/portal/db'
import { PORTAL_HOME_PATH, PORTAL_INVITE_PATH, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Uplatnění pozvánky (KP05). Kód z adresy se ověřuje v databázi (jednorázový,
// neprošlý, nezrušený, případně vázaný na e-mail); chyba nikdy neříká proč, aby
// kód nešlo hádat.

export async function acceptInvite(code: string): Promise<never> {
  const { userId } = await auth()
  if (!userId) redirect(PORTAL_SIGN_IN_PATH)
  if (!isInviteCodeShape(code)) redirect(`${PORTAL_INVITE_PATH}/neplatna`)

  let clientId: string | null = null
  try {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
    // Vázanou pozvánku smí uplatnit jen ověřený e-mail.
    const email = primary?.verification?.status === 'verified' ? primary.emailAddress : ''
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null
    const rows = await portalSystem<{ c: string | null }>`
      SELECT portal.redeem_invite(${hashInviteCode(code)}, ${userId}, ${email}, ${name}) AS c
    `
    clientId = rows[0]?.c ?? null
  } catch (err) {
    if (!(err instanceof InviteConfigError)) {
      console.error('[portal] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
  }
  redirect(clientId ? PORTAL_HOME_PATH : `${PORTAL_INVITE_PATH}/neplatna`)
}
