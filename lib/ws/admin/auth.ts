import 'server-only'

// Kdo smí do /dashboard/klienti a /dashboard/novinky: jen admin (R-001, jeden
// admin; od R-080 účet Supabase Auth s ADMIN_EMAIL, viz lib/auth.ts). Přihlášení
// do Workspace tu nic neznamená. Každá server action adminu nad ws začíná
// `const admin = await getAdmin()`.

export type AdminIdentity = { email: string }
export type AdminAuthProvider = () => Promise<AdminIdentity | null>

const supabaseAdminProvider: AdminAuthProvider = async () => {
  const { getAdminSession } = await import('@/lib/auth')
  const session = await getAdminSession()
  return session ? { email: session.user.email } : null
}

let provider: AdminAuthProvider = supabaseAdminProvider

/** Jen pro testy. `null` vrátí skutečné přihlášení (Supabase). */
export function setAdminAuthForTests(next: AdminAuthProvider | null): void {
  provider = next ?? supabaseAdminProvider
}

export async function getAdmin(): Promise<AdminIdentity | null> {
  return provider()
}

/**
 * Zápis do ws.audit_log: „provedl admin“. Bez e-mailu — audit účtu může číst
 * i klient (ws_app pod RLS) a admin je jeden (R-001).
 */
export const adminActor = (_admin: AdminIdentity): string => 'admin'
