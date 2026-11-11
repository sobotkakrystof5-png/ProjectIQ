import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadAdminCounts } from '@/lib/admin-counts'
import { AdminShell } from '@/components/admin/admin-shell'
import '../admin-tokens.css'

// Kostra administrace (KP01, R-071). Po sloučení byznysů (AD02) je /dashboard
// jediná sekce adminu; staré /alteno/* přesměruje lib/legacy-redirects.mjs.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Příslib, ne await (AD06): kostra se pošle hned a odznaky doskočí samy.
  const counts = loadAdminCounts()
  return (
    <AdminShell email={session.user?.email ?? ''} counts={counts}>
      {children}
    </AdminShell>
  )
}
