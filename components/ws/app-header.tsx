'use client'

import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

export type HeaderBusiness = { name: string; slug: string }

/**
 * Hlavička aplikace (zatím bez postranního panelu — kostru postaví S09).
 * Přepínač byznysů jako pilulky; přidání dalšího byznysu je v UI vypnuté (R-026),
 * proto tu „+ Přidat byznys“ není.
 */
export function AppHeader({ businesses, activeSlug }: { businesses: HeaderBusiness[]; activeSlug: string | null }) {
  return (
    <header className="border-b border-navy-100 bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-8">
        <Link href="/w" className="inline-flex min-h-[44px] items-center" aria-label="ZakazIQ, úvod aplikace">
          <Logo size={30} animated />
        </Link>

        <nav aria-label="Byznysy" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {businesses.map((b) => {
            const active = b.slug === activeSlug
            return (
              <span
                key={b.slug}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[36px] max-w-full items-center truncate rounded-full px-4 text-sm font-semibold',
                  active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-ink',
                )}
              >
                {b.name}
              </span>
            )
          })}
        </nav>

        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm text-quiet transition-colors duration-200 ease-zq hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut aria-hidden size={18} strokeWidth={1.5} />
            Odhlásit se
          </button>
        </SignOutButton>
      </div>
    </header>
  )
}
