'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { NAV, ROUTES } from './content'

/**
 * Přihlášený admin (NextAuth z kořenového SessionProvideru) uvidí místo „Přihlásit"
 * odkaz do administrace — dřív ho tam `/` přesměrovala sama (R-034).
 */
function SignInLink({ className }: { className?: string }) {
  const { status } = useSession()
  if (status === 'authenticated') {
    return (
      <a href={ROUTES.adminHome} className={className}>
        Do administrace
      </a>
    )
  }
  return (
    <a href={ROUTES.signIn} className={className}>
      Přihlásit
    </a>
  )
}

/** Která sekce je zrovna na obrazovce (pro zvýraznění v menu). */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const sections = NAV.map((n) => document.getElementById(n.id)).filter((el): el is HTMLElement => !!el)
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        let best: string | null = null
        let bestRatio = 0
        visible.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            best = id
            bestRatio = ratio
          }
        })
        setActive(best)
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [enabled])

  return active
}

function NavLinks({ active, onDark, onNavigate }: { active: string | null; onDark: boolean; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => (
        <a
          key={item.id}
          href={`/#${item.id}`}
          onClick={onNavigate}
          aria-current={active === item.id ? 'location' : undefined}
          className={cn(
            'inline-flex min-h-[40px] items-center rounded-full px-4 text-base transition-colors duration-200 ease-zq',
            onDark
              ? active === item.id
                ? 'bg-white text-navy-950'
                : 'text-navy-100 hover:bg-white/10 hover:text-white'
              : active === item.id
                ? 'bg-navy-700 text-white'
                : 'text-ink hover:bg-navy-50',
          )}
        >
          {item.label}
        </a>
      ))}
    </>
  )
}

/**
 * Hlavička landing page. `variant="hero"` = uvnitř tmavého úvodu; po odjetí z něj se nahoře
 * přichytí kompaktní tmavá pilulka. `variant="page"` = právní stránky (vždy tmavý pruh).
 */
export function Header({ variant = 'hero' }: { variant?: 'hero' | 'page' }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const pinnedBar = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)
  const [open, setOpen] = useState(false)
  const active = useActiveSection(variant === 'hero')

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Neviditelnou kopii vyřadit z tabulátoru i čteček. React 18 atribut `inert` nezná, proto přes DOM.
  useEffect(() => {
    if (pinnedBar.current) pinnedBar.current.inert = !pinned
  }, [pinned])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const bar = (compact: boolean) => (
    <div
      className={cn(
        'mx-auto flex max-w-[1200px] items-center justify-between gap-4',
        compact ? 'rounded-full bg-navy-950/95 py-1.5 pl-4 pr-1.5 shadow-lg shadow-navy-950/20' : 'px-5 py-5 sm:px-7',
      )}
    >
      <Link href="/" className="inline-flex min-h-[44px] items-center rounded-full" aria-label="ZakazIQ, úvod">
        <Logo size={compact ? 30 : 38} animated={!compact} wordmark onDark />
      </Link>

      <nav aria-label="Hlavní" className="hidden lg:block">
        <div className="flex gap-1 rounded-full border border-navy-200/15 bg-white/5 p-1">
          <NavLinks active={active} onDark />
        </div>
      </nav>

      <div className="flex items-center gap-1.5">
        <SignInLink className="hidden min-h-[44px] items-center rounded-full px-4 text-base text-navy-100 transition-colors hover:text-white sm:inline-flex" />
        <a
          href={ROUTES.signUp}
          className="inline-flex min-h-[44px] items-center rounded-full bg-white px-5 text-base font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50"
        >
          <span className="sm:hidden">Zkusit zdarma</span>
          <span className="hidden sm:inline">14 dní zdarma</span>
        </a>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? 'Zavřít menu' : 'Otevřít menu'}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
        >
          {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <header className={cn('relative z-20', variant === 'page' && 'bg-navy-950')}>
        {bar(false)}
        <div ref={sentinel} aria-hidden className="h-px" />
      </header>

      {/* Přichycená verze po odjetí z úvodu */}
      <div
        ref={pinnedBar}
        className={cn(
          'fixed inset-x-0 top-3 z-40 px-3 transition-[opacity,transform] duration-300 ease-zq',
          pinned ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-4 opacity-0',
        )}
      >
        {bar(true)}
      </div>

      {open && (
        <div
          id="landing-menu"
          className="fixed inset-x-3 top-[76px] z-50 rounded-panel bg-navy-950 p-3 text-white shadow-xl shadow-navy-950/30 animate-zq-pop-in lg:hidden"
        >
          <nav aria-label="Menu" className="flex flex-col">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`/#${item.id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center rounded-chip px-4 text-lg text-navy-100 hover:bg-white/10"
              >
                {item.label}
              </a>
            ))}
            <SignInLink className="flex min-h-[48px] items-center rounded-chip px-4 text-lg text-navy-100 hover:bg-white/10" />
          </nav>
        </div>
      )}
    </>
  )
}
