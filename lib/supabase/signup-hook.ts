import 'server-only'

import { sql } from '@/lib/db'
import { signupAddressDigest } from '@/lib/ws/invite'

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
 * Workspace `/w` (R-154) má dva vlastní druhy oprávnění se stejným pravidlem:
 * pozvánku vlastníka do účtu od admina (`ws.account_invites`) a povolení
 * k registraci z landing page (`ws.signup_permits`, jen když je registrace
 * otevřená). Každý druh má vlastní klíč v metadatech i vlastní předponu HMAC,
 * takže otisk jednoho nikdy neplatí za druhý.
 */

/** Pozvánka do klientského prostoru (`portal.invites`). */
export const INVITE_METADATA_KEY = 'zakaziq_invite'
/** Pozvánka vlastníka do Workspace (`ws.account_invites`). */
export const WS_INVITE_METADATA_KEY = 'zakaziq_ws_invite'
/** Povolení k registraci do Workspace (`ws.signup_permits`). */
export const WS_SIGNUP_METADATA_KEY = 'zakaziq_ws_signup'

/** Klíče, které po založení účtu z metadat zase mažeme. */
export const PERMIT_METADATA_KEYS = [INVITE_METADATA_KEY, WS_INVITE_METADATA_KEY, WS_SIGNUP_METADATA_KEY] as const

const HASH_RE = /^[0-9a-f]{64}$/

export type SignupHookPayload = {
  user?: { email?: unknown; user_metadata?: Record<string, unknown> | null } | null
}

export type SignupDecision = { allow: true } | { allow: false; message: string }

/**
 * E-mail, na který je platná pozvánka s tímhle otiskem vázaná — nebo rovnou
 * odpověď ano/ne, když tabulka čitelný e-mail nedrží (povolení k registraci).
 */
export type InviteEmailLookup = (codeHash: string, email: string) => Promise<string | boolean | null>

/** Hledání e-mailu podle otisku pro každý druh oprávnění (klíč v `user_metadata`). */
export type PermitLookups = Partial<Record<(typeof PERMIT_METADATA_KEYS)[number], InviteEmailLookup>>

const REFUSED: SignupDecision = { allow: false, message: 'Registrace je jen na pozvánku.' }

/**
 * Pustí účet, když aspoň jeden otisk v metadatech patří platnému oprávnění
 * vázanému přesně na e-mail zakládaného účtu. Funkce místo slovníku = jen
 * pozvánky do klientského prostoru (zpětná kompatibilita).
 */
export async function decideSignup(
  payload: SignupHookPayload,
  lookups: PermitLookups | InviteEmailLookup,
): Promise<SignupDecision> {
  const email = typeof payload.user?.email === 'string' ? payload.user.email.trim().toLowerCase() : ''
  if (!email) return REFUSED
  const table: PermitLookups = typeof lookups === 'function' ? { [INVITE_METADATA_KEY]: lookups } : lookups
  const meta = payload.user?.user_metadata ?? {}

  for (const key of PERMIT_METADATA_KEYS) {
    const hash = meta[key]
    const lookup = table[key]
    if (!lookup || typeof hash !== 'string' || !HASH_RE.test(hash)) continue
    const allowed = await lookup(hash, email)
    if (allowed === true) return { allow: true }
    if (typeof allowed === 'string' && allowed.trim().toLowerCase() === email) return { allow: true }
  }
  return REFUSED
}

/** Platná pozvánka podle otisku (vlastník tabulek, jen čtení). */
export const inviteEmailByHash = async (codeHash: string): Promise<string | null> => {
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

/** Platná pozvánka vlastníka do Workspace podle otisku (R-154). */
export const wsInviteEmailByHash = async (codeHash: string): Promise<string | null> => {
  const rows = await sql`
    SELECT i.email
    FROM ws.account_invites i JOIN ws.accounts a ON a.id = i.account_id
    WHERE i.code_hash = ${codeHash} AND i.used_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now() AND a.delete_after IS NULL
    LIMIT 1
  `
  const row = rows[0] as { email: string } | undefined
  return row?.email ?? null
}

/** Platné povolení k registraci do Workspace pro tenhle e-mail (R-154). */
export const wsSignupAllowed: InviteEmailLookup = async (codeHash, email) => {
  const rows = await sql`
    SELECT 1 FROM ws.signup_permits
    WHERE code_hash = ${codeHash} AND address_digest = ${signupAddressDigest(email)} AND expires_at > now()
    LIMIT 1
  `
  return rows.length > 0
}

/** Všechny druhy oprávnění, které hook zná. */
export const signupPermitLookups: PermitLookups = {
  [INVITE_METADATA_KEY]: inviteEmailByHash,
  [WS_INVITE_METADATA_KEY]: wsInviteEmailByHash,
  [WS_SIGNUP_METADATA_KEY]: wsSignupAllowed,
}
