import 'server-only'
import { cache } from 'react'
import { getAuthIdentity, getAuthUser } from './supabase/server'
import { isAdminIdentity } from './auth/admin-identity'

// Přihlášení do admin konzole (/dashboard, /alteno, /hub) přes Supabase Auth
// (R-080, dřív NextAuth). Admin je jediný účet s ADMIN_EMAIL a ověřeným
// e-mailem (lib/auth/admin-identity.ts). Od R-081 navíc povinně dvoufázové
// ověření: relace musí mít úroveň aal2 (heslo + kód z aplikace). Kontrolu dělá
// i proxy.ts; tady je ta rozhodující — uživatel se čte přímo z Auth serveru
// (zrušená relace = null), úroveň z ověřeného JWT.

export type AdminSession = { user: { id: string; email: string } }

/**
 * Admin účet přihlášený heslem, ať už s 2FA, nebo bez — jen pro /login a
 * /login/overeni, kde se druhý faktor ověřuje nebo zakládá. Jinde vždy
 * `getAdminSession`. Jednou na požadavek.
 */
export const getAdminCandidate = cache(async (): Promise<AdminSession | null> => {
  const user = await getAuthUser()
  if (!user || !user.emailConfirmed || !user.email || !isAdminIdentity(user)) return null
  return { user: { id: user.id, email: user.email } }
})

/** Session admina ověřená i druhým faktorem, nebo null. Jednou na požadavek. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const [candidate, identity] = await Promise.all([getAdminCandidate(), getAuthIdentity()])
  if (!candidate || !identity || identity.id !== candidate.user.id || identity.aal !== 'aal2') return null
  return candidate
})

export async function requireAuth(): Promise<void> {
  if (!(await getAdminSession())) throw new Error('Neautorizovaný přístup')
}
