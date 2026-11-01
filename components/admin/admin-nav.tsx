'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import {
  ADMIN_MOBILE_TABS,
  ADMIN_NAV,
  ADMIN_UTILITY_NAV,
  activeHref,
  allNavItems,
  formatBadge,
  type AdminCounts,
  type NavItem,
} from '@/lib/admin-nav'
import { NavGlyph } from './admin-icons'
import { cn } from '@/lib/utils'

function Badge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-semibold leading-5 text-signal-ink',
        className,
      )}
    >
      {formatBadge(n)}
    </span>
  )
}

function NavLink({ item, active, counts, onNavigate }: { item: NavItem; active: boolean; counts: AdminCounts; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] items-center gap-3 rounded-chip px-3 text-sm font-medium transition-colors lg:min-h-[40px]',
        active ? 'bg-navy-50 text-navy-700' : 'text-quiet hover:bg-navy-50/60 hover:text-ink',
      )}
    >
      <NavGlyph name={item.icon} />
      <span className="truncate">{item.label}</span>
      {item.count && <Badge n={counts[item.count]} />}
    </Link>
  )
}

/** Skupiny položek menu; společné pro postranní panel i šuplík na telefonu. */
export function AdminNavList({ counts, onNavigate }: { counts: AdminCounts; onNavigate?: () => void }) {
  const pathname = usePathname()
  const current = activeHref(pathname)
  return (
    <nav aria-label="Hlavní nabídka" className="space-y-5">
      {ADMIN_NAV.map((group) => (
        <div key={group.label}>
          {group.items.length > 1 || group.label !== group.items[0].label ? (
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-quiet">{group.label}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={current === item.href} counts={counts} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="space-y-0.5 border-t border-navy-100 pt-3 lg:hidden">
        {ADMIN_UTILITY_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={current === item.href} counts={counts} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Spodní lišta na telefonu: čtyři hlavní místa a „Více“ s celým menu. */
export function AdminMobileTabs({ counts }: { counts: AdminCounts }) {
  const pathname = usePathname()
  const current = activeHref(pathname)
  const [open, setOpen] = useState(false)
  const items = ADMIN_MOBILE_TABS.map((href) => allNavItems().find((i) => i.href === href)).filter(
    (i): i is NavItem => Boolean(i),
  )
  const moreActive = current !== null && !ADMIN_MOBILE_TABS.includes(current)

  return (
    <>
      <nav
        aria-label="Rychlá nabídka"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => {
            const active = current === item.href
            const badge = item.count ? counts[item.count] : 0
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                    active ? 'text-navy-700' : 'text-quiet',
                  )}
                >
                  <NavGlyph name={item.icon} />
                  {item.label.split(' ')[0]}
                  {badge > 0 && (
                    <span className="absolute right-[22%] top-1.5 min-w-[16px] rounded-full bg-signal px-1 text-center text-[10px] font-semibold leading-4 text-signal-ink">
                      {formatBadge(badge)}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                'flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                moreActive ? 'text-navy-700' : 'text-quiet',
              )}
            >
              <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
              Více
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Celá nabídka">
          <button
            type="button"
            aria-label="Zavřít nabídku"
            className="absolute inset-0 bg-navy-950/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-panel bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Nabídka</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-chip text-quiet hover:bg-navy-50"
                aria-label="Zavřít"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <AdminNavList counts={counts} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
