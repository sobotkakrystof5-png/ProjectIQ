'use client'

import { Suspense, use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Search } from 'lucide-react'
import { useCommandShortcut } from '@/components/ui/command'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Logo } from '@/components/ws/brand'
import { rememberBusinessAction } from '@/app/w/[business]/actions'
import { EMPTY_CHROME, type FrameChrome } from '@/lib/ws/frame-chrome'
import { newActions } from '@/lib/ws/features'
import {
  accountLinks,
  bottomBarSlots,
  isAccountActive,
  isNavActive,
  navHref,
  navItems,
  paletteItems,
  type NavItem,
} from '@/lib/ws/nav'
import { cn } from '@/lib/ws/utils'
import { AccountMenu, AccountSheetSection } from './account-menu'
import { LiveRefresh } from './booking/live-refresh'
import { CommandPalette } from './command-palette'
import { NavIcon } from './nav-icon'
import { NewMenu } from './new-menu'
import { NotificationsBell } from './notifications-bell'

export type FrameBusiness = { name: string; slug: string }

export type AppFrameProps = {
  business: FrameBusiness
  businesses: FrameBusiness[]
  enabledModules: string[]
  isOwner: boolean
  orderUrl: string
  today: string
  /** Zvonek a názvy služeb pro ⌘K přijdou, až budou — kostra a stránka na ně nečekají. Nikdy nevyhodí chybu. */
  chrome: Promise<FrameChrome>
  /** Slug z cookie — když se liší od otevřeného byznysu, uloží se nový. */
  rememberedSlug: string | null
  children: React.ReactNode
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Kostra aplikace Workspace (S09, mockup C a D): postranní panel navy-950
 * jen se zapnutými funkcemi, hlavička s přepínačem byznysů, hledáním (⌘K),
 * zvonkem a „+ Nová"; na telefonu spodní lišta a menu v panelu.
 * Hlavní menu má nejvýš šest položek; Nastavení a předplatné jsou v Účtu (RD01).
 */
export function AppFrame(props: AppFrameProps) {
  const { business, businesses, isOwner, orderUrl, chrome, rememberedSlug, children } = props
  const pathname = usePathname()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [services, setServices] = useState<string[]>([])
  useCommandShortcut(setPaletteOpen)

  useEffect(() => {
    let current = true
    void chrome.then((c) => current && setServices(c.services))
    return () => {
      current = false
    }
  }, [chrome])

  const enabled = useMemo(() => new Set(props.enabledModules), [props.enabledModules])
  const nav = useMemo(() => navItems(enabled), [enabled])
  const palette = useMemo(() => paletteItems(enabled), [enabled])
  const account = useMemo(() => accountLinks(business.slug, isOwner), [business.slug, isOwner])
  const actions = useMemo(() => newActions(enabled), [enabled])
  // Bez hotové akce není „+“ ani ve spodní liště (R-043).
  const slots = useMemo(
    () => bottomBarSlots(enabled).filter((s) => s.kind !== 'new' || actions.length > 0),
    [enabled, actions],
  )
  const root = navHref(business.slug, '')

  useEffect(() => {
    if (rememberedSlug !== business.slug) void rememberBusinessAction(business.slug)
  }, [rememberedSlug, business.slug])

  // Menu na telefonu se po přechodu zavře samo.
  useEffect(() => setMenuOpen(false), [pathname])

  const openSearch = () => setPaletteOpen(true)

  return (
    <div data-ws-frame className="min-h-screen bg-ground text-ink md:pl-[92px]">
      <a
        href="#obsah"
        className="sr-only z-50 rounded-full bg-surface px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Přeskočit na obsah
      </a>

      {/* Postranní panel (tablet a desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[92px] flex-col items-center gap-1 bg-navy-950 py-4 md:flex">
        <Link href={root} aria-label={`${business.name}, Dnes`} className={cn('mb-4 rounded-chip p-1.5', focusRing)}>
          <Logo size={34} animated />
        </Link>
        <nav aria-label="Hlavní" className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
          {nav.map((item) => (
            <SideLink key={item.key} item={item} href={navHref(business.slug, item.segment)} active={isNavActive(pathname, business.slug, item)} />
          ))}
        </nav>
        <div className="flex w-full flex-col items-center gap-1 px-2">
          <AccountMenu
            businessName={business.name}
            links={account}
            triggerClassName={cn(sideItemClass(isAccountActive(pathname, business.slug)), focusRing)}
          />
        </div>
      </aside>

      {/* Hlavička */}
      <header className="sticky top-0 z-20 border-b bg-surface">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-5 md:gap-4 md:px-6">
          <Link href={root} className={cn('flex min-w-0 items-center gap-2.5 rounded-chip md:hidden', focusRing)}>
            <Logo size={28} />
            <span className="truncate text-[15px] font-semibold">{business.name}</span>
          </Link>

          <nav aria-label="Byznysy" className="hidden min-w-0 items-center gap-1.5 md:flex">
            {businesses.map((b) => {
              const active = b.slug === business.slug
              return (
                <Link
                  key={b.slug}
                  href={navHref(b.slug, '')}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[36px] max-w-[240px] items-center truncate rounded-full px-4 text-sm font-semibold transition-colors duration-200 ease-zq',
                    active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-ink hover:bg-navy-100 dark:bg-navy-800 dark:text-navy-50',
                    focusRing,
                  )}
                >
                  <span className="truncate">{b.name}</span>
                </Link>
              )
            })}
            {enabled.has('finance') && <Link href={navHref(business.slug, 'penize') + '?rozsah=ucet'} className={cn('inline-flex min-h-11 items-center rounded-full px-4 text-sm text-quiet hover:bg-navy-50', focusRing)}>Vše · jedno IČO</Link>}
          </nav>

          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={openSearch}
              className={cn(
                'hidden h-11 w-[clamp(200px,24vw,320px)] items-center gap-2.5 rounded-full border bg-ground px-4 text-left text-[15px] text-quiet transition-colors duration-200 ease-zq hover:border-navy-300 md:flex',
                focusRing,
              )}
            >
              <Search aria-hidden size={18} strokeWidth={1.5} />
              <span className="flex-1 truncate">Hledat zákazníka, poptávku…</span>
              <kbd className="font-num text-xs">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={openSearch}
              aria-label="Hledat"
              className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink md:hidden', focusRing)}
            >
              <Search aria-hidden size={20} strokeWidth={1.5} />
            </button>
            <Suspense fallback={<NotificationsBell slug={business.slug} {...EMPTY_CHROME.bell} />}>
              <FrameBell slug={business.slug} chrome={chrome} />
            </Suspense>
            <div className="hidden md:block">
              <NewMenu variant="header" actions={actions} orderUrl={orderUrl} onSearch={openSearch} />
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menu"
              className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink md:hidden', focusRing)}
            >
              <Menu aria-hidden size={22} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main id="obsah" className="pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-0">
        <LiveRefresh slug={business.slug} />
        {children}
      </main>

      {/* Spodní lišta (telefon, mockup D) */}
      <nav
        aria-label="Rychlá navigace"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex h-[68px] max-w-md items-stretch justify-around px-1">
          {slots.map((slot) =>
            slot.kind === 'new' ? (
              <li key="new" className="flex items-start justify-center">
                <NewMenu variant="bar" actions={actions} orderUrl={orderUrl} onSearch={openSearch} />
              </li>
            ) : (
              <li key={slot.key} className="flex flex-1">
                {(() => {
                  const href = navHref(business.slug, slot.segment)
                  const active = isNavActive(pathname, business.slug, slot)
                  return (
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex flex-1 flex-col items-center justify-center gap-1 rounded-chip text-[11px] font-medium',
                        active ? 'text-navy-700 dark:text-navy-200' : 'text-quiet',
                        focusRing,
                      )}
                    >
                      <NavIcon name={slot.key} />
                      {slot.label}
                    </Link>
                  )
                })()}
              </li>
            ),
          )}
        </ul>
      </nav>

      {/* Menu na telefonu: všechno, co se do lišty nevešlo */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{business.name}</SheetTitle>
            <SheetDescription>Kam chcete jít?</SheetDescription>
          </SheetHeader>
          {businesses.length > 1 && (
            <nav aria-label="Byznysy" className="flex flex-wrap gap-1.5">
              {businesses.map((b) => (
                <Link
                  key={b.slug}
                  href={navHref(b.slug, '')}
                  aria-current={b.slug === business.slug ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold',
                    b.slug === business.slug ? 'bg-navy-700 text-white' : 'bg-navy-50 text-ink dark:bg-navy-800 dark:text-navy-50',
                    focusRing,
                  )}
                >
                  {b.name}
                </Link>
              ))}
            </nav>
          )}
          <nav aria-label="Hlavní" className="flex flex-col gap-1">
            {nav.map((item) => {
              const href = navHref(business.slug, item.segment)
              return (
                <MenuLink key={item.key} href={href} icon={item.key} label={item.label} active={isNavActive(pathname, business.slug, item)} />
              )
            })}
          </nav>
          <AccountSheetSection links={account} pathname={pathname} />
        </SheetContent>
      </Sheet>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        slug={business.slug}
        nav={palette}
        accountLinks={account}
        actions={actions}
        orderUrl={orderUrl}
        services={services}
        today={props.today}
      />
    </div>
  )
}

function FrameBell({ slug, chrome }: { slug: string; chrome: Promise<FrameChrome> }) {
  const { bell } = use(chrome)
  return <NotificationsBell slug={slug} items={bell.items} unread={bell.unread} news={bell.news} newsUnseen={bell.newsUnseen} />
}

function sideItemClass(active: boolean) {
  return cn(
    'flex w-[72px] flex-col items-center gap-1 rounded-chip px-1 py-2.5 text-[11px] font-medium leading-none transition-colors duration-200 ease-zq',
    active ? 'bg-navy-700 text-white' : 'text-navy-200 hover:bg-navy-800 hover:text-white',
  )
}

function SideLink({ item, href, active }: { item: NavItem; href: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn(sideItemClass(active), focusRing)}>
      <NavIcon name={item.key} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  )
}

function MenuLink({ href, icon, label, active }: { href: string; icon: NavItem['key']; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-chip px-3 text-[15px] font-medium',
        active ? 'bg-navy-700 text-white' : 'text-ink hover:bg-accent',
        focusRing,
      )}
    >
      <NavIcon name={icon} size={20} />
      {label}
    </Link>
  )
}
