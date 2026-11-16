import 'server-only'

import { sql } from '@/lib/db'

/**
 * Hook Supabase Auth „Before User Created" (R-107). Supabase se nás před
 * založením **každého** účtu zeptá, jestli smí vzniknout. Účet vznikne jen
 * tehdy, když nese otisk platné pozvánky do klientského prostoru a e-mail
 * sedí na e-mail, na který je pozvánka vázaná. Všechno ostatní se odmítne —
 * i registrace přímo přes API Supabase s veřejným klíčem.
 *
 * Proč otisk v `user_metadata`: e-mail pozvaného zná víc lidí (třeba kdokoli
 * v kopii e-mailu), otisk kódu ale jen ten, kdo kód má. Otisk je HMAC s pepřem
 * `PORTAL_INVITE_PEPPER` (`lib/portal/invite.ts`), z kódu se spočítat dá,
 * z otisku kód ne. `user_metadata` sice vyplňuje volající, ale podvrhnout jde
 * jen otisk, který existuje v databázi — a ten zná jen server.
 *
 * **Účet admina tudy nevznikne.** Kdyby se musel založit znovu, hook se na
 * chvíli vypne v Supabase (Authentication → Hooks). Povolit `ADMIN_EMAIL`
 * natrvalo by znamenalo, že po smazání účtu si ho může založit kdokoli.
 *
 * Workspace `/w` (F2 plánu `docs/AUTH-SUPABASE-PLAN.md`) sem přidá vlastní
 * druh oprávnění k registraci. Do té doby hook Workspace nezná.
 */

export const INVITE_METADATA_KEY = 'zakaziq_invite'

const HASH_RE = /^[0-9a-f]{64}$/

export type SignupHookPayload = {
  user?: { email?: unknown; user_metadata?: Record<string, unknown> | null } | null
}

export type SignupDecision = { allow: true } | { allow: false; message: string }

/** E-mail, na který je platná pozvánka s tímhle otiskem vázaná. */
export type InviteEmailLookup = (codeHash: string) => Promise<string | null>

const REFUSED: SignupDecision = { allow: false, message: 'Registrace je jen na pozvánku.' }

export async function decideSignup(payload: SignupHookPayload, lookup: InviteEmailLookup): Promise<SignupDecision> {
  const email = typeof payload.user?.email === 'string' ? payload.user.email.trim().toLowerCase() : ''
  const hash = payload.user?.user_metadata?.[INVITE_METADATA_KEY]
  if (!email || typeof hash !== 'string' || !HASH_RE.test(hash)) return REFUSED

  const invited = await lookup(hash)
  if (!invited || invited.trim().toLowerCase() !== email) return REFUSED
  return { allow: true }
}

/** Platná pozvánka podle otisku (vlastník tabulek, jen čtení). */
export const inviteEmailByHash: InviteEmailLookup = async (codeHash) => {
  const rows = await sql`
    SELECT i.email
    FROM portal.invites i JOIN portal.clients c ON c.id = i.client_id
    WHERE i.code_hash = ${codeHash} AND i.used_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now() AND c.archived_at IS NULL AND i.email IS NOT NULL
    LIMIT 1
  `
  const row = rows[0] as { email: string } | undefined
  return row?.email ?? null
}
