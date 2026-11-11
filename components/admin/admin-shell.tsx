import Link from 'next/link'
import { Bell } from 'lucide-react'
import { LogoutButton } from '@/app/dashboard/LogoutButton'
import { formatBadge, type AdminCounts } from '@/lib/admin-nav'
import { cn } from '@/lib/utils'
import { AdminMobileTabs, AdminNavList } from './admin-nav'
import { AdminSearch } from './admin-search'

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="ZakazIQ, přejít na Dnes">
      <span className="flex h-8 w-8 items-center justify-center rounded-tiny bg-navy-700">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
          <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
          <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
          <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">ZakazIQ</span>
    </Link>
  )
}

function BellLink({ count }: { count: number }) {
  return (
    <Link
      href="/dashboard/notifications"
      title="Oznámení"
      aria-label={count > 0 ? `Oznámení, nepřečtených ${count}` : 'Oznámení'}
      className="relative flex h-11 w-11 items-center justify-center rounded-chip text-quiet hover:bg-navy-50 hover:text-ink"
    >
      <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {formatBadge(count)}
        </span>
      )}
    </Link>
  )
}

/**
 * Společná kostra administrace (KP01, R-071) pro /dashboard: postranní
 * menu na počítači, horní lišta a spodní lišta na telefonu, hledání ⌘K. Chrome
 * i obsah používá Dílky (`data-app="admin"`, app/admin-tokens.css); písma nese
 * <html> v kořenovém layoutu (R-081).
 */
export function AdminShell({
  email,
  counts,
  children,
}: {
  email: string
  counts: AdminCounts
  children: React.ReactNode
}) {
  const initials = email.slice(0, 2).toUpperCase()
  return (
    <div data-app="admin" className="min-h-screen bg-background">
      <a
        href="#obsah"
        className="sr-only z-50 rounded-chip bg-surface px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Přeskočit na obsah
      </a>

      {/* Počítač: pevné postranní menu */}
      <aside className="hidden font-ws lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col border-r border-navy-100 bg-surface">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Logo />
          <BellLink count={counts.notifications} />
        </div>
        <div className="px-3 pb-3">
          <AdminSearch className="w-full" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <AdminNavList counts={counts} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-navy-100 px-4 py-3">
          <Link href="/dashboard/profil" className="flex min-w-0 items-center gap-2" title="Profil a statistiky">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[11px] font-bold text-white">
              {initials}
            </span>
            <span className="truncate text-xs text-quiet">{email.split('@')[0]}</span>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Telefon: horní lišta */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-navy-100 bg-surface px-4 py-2 font-ws lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <AdminSearch />
            <BellLink count={counts.notifications} />
          </div>
        </header>

        <main id="obsah" className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      <div className="font-ws">
        <AdminMobileTabs counts={counts} />
      </div>
    </div>
  )
}
