import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { Inbox, Bell, LayoutGrid, Bot } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { LogoutButton } from '@/app/dashboard/LogoutButton'
import { MobileNav } from '@/components/MobileNav'

function ProfileAvatar({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase()
  return (
    <Link
      href="/dashboard/profil"
      title="Profil & statistiky"
      className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-sm hover:opacity-80 transition-opacity shrink-0"
    >
      <span className="text-white text-[11px] font-bold tracking-tight">{initials}</span>
    </Link>
  )
}

export default async function AltenoLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [countRows, notifRows] = await Promise.all([
    sql`
      SELECT count(*)::int AS count FROM projects
      WHERE business = 'alteno' AND is_alteno_pending(source, alteno_confirmed)
    `,
    sql`SELECT count(*)::int AS count FROM notifications WHERE read = false`,
  ])
  const altenoCount = (countRows[0] as { count: number }).count
  const unreadNotifications = (notifRows[0] as { count: number }).count

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: '60px' }}>
          <div className="flex items-center gap-3">
            <MobileNav section="alteno" pendingCount={altenoCount} />
            <Link href="/alteno" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
                <Bot size={17} strokeWidth={1.5} className="text-white" />
              </div>
              <span className="font-semibold text-amber-700 text-[15px] tracking-tight">ALTENO</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-0.5">
              <Link
                href="/hub"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-amber-800 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                title="Hub — přehled všech modulů"
              >
                <LayoutGrid size={14} strokeWidth={1.5} />
                Hub
              </Link>
              <span className="w-px h-4 bg-border mx-1" />
              <Link
                href="/alteno"
                className="text-sm font-medium text-muted-foreground hover:text-amber-800 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
              >
                Zakázky
              </Link>
              <Link
                href="/alteno/rezervace"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-amber-800 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
              >
                <Inbox size={14} strokeWidth={1.5} />
                Rezervace
                {altenoCount > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                    {altenoCount > 9 ? '9+' : altenoCount}
                  </span>
                )}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/notifications"
              title="Oznámení"
              className="relative p-1.5 rounded-lg text-muted-foreground hover:text-amber-800 hover:bg-amber-50 transition-colors"
            >
              <Bell size={18} strokeWidth={1.5} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </Link>
            <ProfileAvatar email={session.user?.email ?? ''} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
