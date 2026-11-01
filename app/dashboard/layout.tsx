import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadAdminCounts } from '@/lib/admin-counts'
import { AdminShell } from '@/components/admin/admin-shell'
import '../admin-tokens.css'

// Kostra administrace (KP01, R-071): sdílí ji /dashboard a /alteno.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const counts = await loadAdminCounts()
  return (
    <AdminShell email={session.user?.email ?? ''} counts={counts}>
      {children}
    </AdminShell>
  )
}
