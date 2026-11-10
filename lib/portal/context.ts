import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getAuthIdentity, type AuthIdentity } from '@/lib/supabase/server'
import { portalSystem } from './db'
import { PORTAL_MFA_PATH, PORTAL_NO_ACCESS_PATH, PORTAL_REVOKED_PATH, PORTAL_SIGN_IN_PATH } from './paths'

// Kdo je přihlášený klient (KP05). Supabase Auth řekne, kdo je člověk (R-080);
// které firmě patří, řekne tabulka portal.members (funkce memberships_for_user).
// Bez členství není přístup, i když je člověk přihlášený. clientId se nikdy
// nebere z URL ani z formuláře.
//
// R-081: stejný dotaz zjistí i to, jestli relace ještě platí (Odhlásit všude
// z jiného zařízení) a jestli má člověk zapnuté 2FA (portal.auth_state). Bez
// platné relace nebo bez ověřeného kódu kontext není.

export interface PortalContext {
  userId: string
  clientId: string
  memberId: string
  role: 'owner' | 'member'
  clientName: string
}

type PortalAuth =
  | { status: 'anonymous' }
  | { status: 'revoked' }
  | { status: 'mfa'; identity: AuthIdentity }
  | { status: 'ok'; identity: AuthIdentity; ctx: PortalContext | null }

type Row = {
  session_ok: boolean
  mfa_enrolled: boolean
  client_id: string | null
  member_id: string | null
  role: string | null
  client_name: string | null
}

const loadPortalAuth = cache(async (): Promise<PortalAuth> => {
  const identity = await getAuthIdentity()
  if (!identity) return { status: 'anonymous' }
  const rows = await portalSystem<Row>`
    SELECT a.session_ok, a.mfa_enrolled, m.client_id, m.member_id, m.role, m.client_name
    FROM portal.auth_state(${identity.id}, ${identity.sessionId}) a
    LEFT JOIN LATERAL portal.memberships_for_user(${identity.id}) m ON true
  `
  const first = rows[0]
  if (!first?.session_ok) return { status: 'revoked' }
  if (first.mfa_enrolled && identity.aal !== 'aal2') return { status: 'mfa', identity }
  const ctx: PortalContext | null =
    first.client_id && first.member_id
      ? {
          userId: identity.id,
          clientId: first.client_id,
          memberId: first.member_id,
          role: first.role === 'owner' ? 'owner' : 'member',
          clientName: first.client_name ?? '',
        }
      : null
  return { status: 'ok', identity, ctx }
})

/** Kontext přihlášeného člena firmy, nebo null (nepřihlášený, zrušená relace, chybí kód 2FA, bez členství). */
export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  const auth = await loadPortalAuth()
  return auth.status === 'ok' ? auth.ctx : null
})

/** Přihlášený člověk s platnou relací (a kódem 2FA, má-li ho zapnutý) — i bez členství firmy. */
export async function requirePortalIdentity(): Promise<AuthIdentity> {
  const auth = await loadPortalAuth()
  if (auth.status === 'anonymous') redirect(PORTAL_SIGN_IN_PATH)
  if (auth.status === 'revoked') redirect(PORTAL_REVOKED_PATH)
  if (auth.status === 'mfa') redirect(PORTAL_MFA_PATH)
  return auth.identity
}

/** Přihlášený člen firmy, jinak přesměrování na přihlášení / ověření / „bez přístupu“. */
export async function requireClient(): Promise<PortalContext> {
  await requirePortalIdentity()
  const ctx = await getPortalContext()
  if (!ctx) redirect(PORTAL_NO_ACCESS_PATH)
  return ctx
}
