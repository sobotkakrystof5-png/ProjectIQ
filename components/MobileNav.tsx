'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, LayoutGrid, Inbox, CalendarDays, PhoneCall,
  CheckCircle2, Star, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  vizeonCount: number
}

export function MobileNav({ vizeonCount }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const links = [
    { href: '/hub', label: 'Hub', icon: LayoutGrid },
    { href: '/dashboard', label: 'Zakázky', icon: null },
    { href: '/dashboard/vizeon', label: 'Vizeon', icon: Inbox, badge: vizeonCount },
    { href: '/dashboard/calendar', label: 'Kalendář', icon: CalendarDays },
    { href: '/dashboard/calls', label: 'Hovory', icon: PhoneCall },
    { href: '/dashboard/dokoncene', label: 'Dokončené', icon: CheckCircle2 },
    { href: '/dashboard/hodnoceni', label: 'Hodnocení', icon: Star },
    { href: '/dashboard/naklady', label: 'Náklady', icon: Receipt },
  ]

  return (
    <>
      {/* Hamburger button — only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-brand-50 hover:text-brand-800 transition-colors"
        aria-label="Otevřít menu"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl sm:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-[60px] border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 brand-gradient rounded-lg flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="font-semibold text-brand-800 text-[15px]">ZakazIQ</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Zavřít menu"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col p-3 gap-0.5 overflow-y-auto">
          {links.map(({ href, label, icon: Icon, badge }) => {
            const isActive = pathname === href || (href !== '/hub' && href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-muted-foreground hover:text-brand-800 hover:bg-brand-50',
                )}
              >
                {Icon && <Icon size={17} strokeWidth={1.5} className="shrink-0" />}
                <span className="flex-1">{label}</span>
                {!!badge && badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
