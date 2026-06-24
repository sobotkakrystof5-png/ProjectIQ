import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { CalendarDays, PhoneCall, CheckCircle2, Receipt, Inbox, Star, Bell, LayoutGrid } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { LogoutButton } from './LogoutButton'
import { MobileNav } from '@/components/MobileNav'

function ProfileAvatar({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase()
  return (
    <Link
      href="/dashboard/profil"
      title="Profil & statistiky"
      className="w-8 h-8 brand-gradient rounded-full flex items-center justify-center shadow-sm hover:opacity-80 transition-opacity shrink-0"
    >
      <span className="text-white text-[11px] font-bold tracking-tight">{initials}</span>
    </Link>
  )
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [countRows, notifRows] = await Promise.all([
    sql`
      SELECT count(*)::int AS count FROM projects
      WHERE source = 'vizeon_web' AND (vizeon_confirmed = false OR vizeon_confirmed IS NULL)
    `,
    sql`SELECT count(*)::int AS count FROM notifications WHERE read = false`,
  ])
  const vizeonCount = (countRows[0] as { count: number }).count
  const unreadNotifications = (notifRows[0] as { count: number }).count

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: '60px' }}>
          <div className="flex items-center gap-3">
            <MobileNav vizeonCount={vizeonCount} />
            <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
              <div className="w-8 h-8 brand-gradient rounded-lg flex items-center justify-center shadow-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
                  <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                  <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                  <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
                </svg>
              </div>
              <span className="font-semibold text-brand-800 text-[15px] tracking-tight">ZakazIQ</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-0.5">
              <Link
                href="/hub"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
                title="Hub — přehled všech modulů"
              >
                <LayoutGrid size={14} strokeWidth={1.5} />
                Hub
              </Link>
              <span className="w-px h-4 bg-border mx-1" />
              <Link
                href="/dashboard"
                className="text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                Zakázky
              </Link>
              <Link
                href="/dashboard/vizeon"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <Inbox size={14} strokeWidth={1.5} />
                Vizeon
                {vizeonCount > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none">
                    {vizeonCount > 9 ? '9+' : vizeonCount}
                  </span>
                )}
              </Link>
              <Link
                href="/dashboard/calendar"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <CalendarDays size={14} strokeWidth={1.5} />
                Kalendář
              </Link>
              <Link
                href="/dashboard/calls"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <PhoneCall size={14} strokeWidth={1.5} />
                Hovory
              </Link>
              <Link
                href="/dashboard/dokoncene"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <CheckCircle2 size={14} strokeWidth={1.5} />
                Dokončené
              </Link>
              <Link
                href="/dashboard/hodnoceni"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <Star size={14} strokeWidth={1.5} />
                Hodnocení
              </Link>
              <Link
                href="/dashboard/naklady"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <Receipt size={14} strokeWidth={1.5} />
                Náklady
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/notifications"
              title="Oznámení"
              className="relative p-1.5 rounded-lg text-muted-foreground hover:text-brand-800 hover:bg-brand-50 transition-colors"
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
