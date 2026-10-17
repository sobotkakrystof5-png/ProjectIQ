import 'server-only'

// Kdo smí do /dashboard/klienti a /dashboard/novinky: jen admin s NextAuth
// session (R-001, jeden admin). Přihlášení Workspace (Clerk) tu nic neznamená.
// Každá server action adminu nad ws začíná `const admin = await getAdmin()`.

export type AdminIdentity = { email: string }
export type AdminAuthProvider = () => Promise<AdminIdentity | null>

const nextAuthProvider: AdminAuthProvider = async () => {
  const [{ getServerSession }, { authOptions }] = await Promise.all([import('next-auth'), import('@/lib/auth')])
  const session = await getServerSession(authOptions)
  if (!session) return null
  return { email: session.user?.email ?? 'admin' }
}

let provider: AdminAuthProvider = nextAuthProvider

/** Jen pro testy. `null` vrátí NextAuth. */
export function setAdminAuthForTests(next: AdminAuthProvider | null): void {
  provider = next ?? nextAuthProvider
}

export async function getAdmin(): Promise<AdminIdentity | null> {
  return provider()
}

/**
 * Zápis do ws.audit_log: „provedl admin“. Bez e-mailu — audit účtu může číst
 * i klient (ws_app pod RLS) a admin je jeden (R-001).
 */
export const adminActor = (_admin: AdminIdentity): string => 'admin'
