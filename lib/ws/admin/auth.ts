import 'server-only'

// Kdo smí do /dashboard/klienti a /dashboard/novinky: jen admin se session
// Supabase, jejíž e-mail se rovná `ADMIN_EMAIL` (R-001, jeden admin; přihlášení
// vede Supabase od R-105). Přihlášení Workspace (Clerk) tu nic neznamená.
// Každá server action adminu nad ws začíná `const admin = await getAdmin()`.

import { getAdminSession, setAdminSessionForTests, type AdminSession } from '@/lib/auth'

export type AdminIdentity = { email: string }
export type AdminAuthProvider = () => Promise<AdminIdentity | null>

/** Jen pro testy. `null` vrátí skutečné přihlášení přes Supabase. */
export function setAdminAuthForTests(next: AdminAuthProvider | null): void {
  if (!next) {
    setAdminSessionForTests(null)
    return
  }
  setAdminSessionForTests(async (): Promise<AdminSession | null> => {
    const identity = await next()
    return identity ? { email: identity.email, userId: 'test', aal: 'aal2' } : null
  })
}

export async function getAdmin(): Promise<AdminIdentity | null> {
  const session = await getAdminSession()
  return session ? { email: session.email } : null
}

/**
 * Zápis do ws.audit_log: „provedl admin“. Bez e-mailu — audit účtu může číst
 * i klient (ws_app pod RLS) a admin je jeden (R-001).
 */
export const adminActor = (_admin: AdminIdentity): string => 'admin'
