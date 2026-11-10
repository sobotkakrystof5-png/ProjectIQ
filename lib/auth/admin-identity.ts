// Kdo je admin (R-001: jeden admin). Od R-080 sdílí admin s Workspace
// a klientským prostorem jednu databázi uživatelů Supabase Auth, takže samotné
// přihlášení nestačí — admin je jen účet s e-mailem ADMIN_EMAIL (a je-li
// nastavené, i s id ADMIN_USER_ID). Bez závislostí, používá ho i proxy.ts.

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

export function isAdminIdentity(user: { id: string | null; email: string | null } | null): boolean {
  const adminEmail = norm(process.env.ADMIN_EMAIL)
  if (!user?.id || !adminEmail || norm(user.email) !== adminEmail) return false
  const adminId = process.env.ADMIN_USER_ID?.trim()
  return !adminId || adminId === user.id
}
