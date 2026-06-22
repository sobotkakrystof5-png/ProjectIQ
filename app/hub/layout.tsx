import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { HubSidebarNav } from '@/components/HubSidebarNav'
import { LogoutButton } from '@/app/dashboard/LogoutButton'

function HubLogo() {
  return (
    <div className="w-8 h-8 brand-gradient rounded-lg flex items-center justify-center shadow-sm shrink-0">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
        <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
        <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
        <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  )
}

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const email = session.user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — fixed, full height */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-56 lg:flex-col">
        <div className="flex flex-col h-full bg-white border-r border-border">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-border shrink-0">
            <Link href="/hub" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <HubLogo />
              <div>
                <span className="font-semibold text-brand-800 text-[14px] tracking-tight block leading-tight">ZakazIQ</span>
                <span className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase">Hub</span>
              </div>
            </Link>
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-y-auto py-3">
            <HubSidebarNav />
          </div>

          {/* Profile + logout */}
          <div className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex items-center justify-between">
              <Link href="/dashboard/profil" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0">
                <div className="w-7 h-7 brand-gradient rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-[11px] font-bold">{initials}</span>
                </div>
                <span className="text-xs text-muted-foreground truncate">{email.split('@')[0]}</span>
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <header className="lg:hidden bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="px-4 flex items-center justify-between" style={{ height: '56px' }}>
          <Link href="/hub" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <HubLogo />
            <div>
              <span className="font-semibold text-brand-800 text-[14px] tracking-tight leading-tight">ZakazIQ</span>
              <span className="ml-1.5 text-[10px] text-muted-foreground font-semibold tracking-widest uppercase">Hub</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/profil" className="w-7 h-7 brand-gradient rounded-full flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">{initials}</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
        {/* Mobile module tabs */}
        <div className="border-t border-border overflow-x-auto">
          <HubSidebarNav mobile />
        </div>
      </header>

      {/* Content area — offset by sidebar on desktop */}
      <div className="lg:pl-56">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
