'use client'

import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { CreditCard, LogOut, Palette, Settings, ShieldCheck, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeSwitch } from '@/components/ws/account/theme-switch'
import { useWsTheme } from '@/components/ws/ws-root'
import { ACCOUNT_PATH, type AccountLink, type AccountLinkKey } from '@/lib/ws/nav'
import { THEME_LABELS, THEME_PREFS, type ThemePref } from '@/lib/ws/theme'
import { cn } from '@/lib/ws/utils'

// Menu Účet (RD01): Nastavení firmy, Předplatné a doklady, Vzhled, Zpracování
// údajů, Odhlásit. Dole v postranním panelu je to jedno tlačítko, na telefonu
// stejné položky pod oddělovačem ve výsuvném menu. Nastavení tak není mezi
// pracovními částmi. Pracovník (nevlastník) vidí jen Vzhled a Odhlásit.

export const ACCOUNT_ICONS: Record<AccountLinkKey, LucideIcon> = { nastaveni: Settings, predplatne: CreditCard, zpracovani: ShieldCheck }

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const initialOf = (name: string): string => Array.from(name.trim())[0]?.toLocaleUpperCase('cs-CZ') ?? 'Ú'

/** Tlačítko Účet dole v postranním panelu (tablet a počítač). */
export function AccountMenu({
  businessName,
  links,
  triggerClassName,
}: {
  businessName: string
  links: AccountLink[]
  /** Vzhled položky panelu (stejný jako u ostatních, svítí podle `isAccountActive`). */
  triggerClassName: string
}) {
  const { pref, setPref } = useWsTheme()
  const { signOut } = useClerk()
  const main = links.filter((l) => l.key !== 'zpracovani')
  const processing = links.find((l) => l.key === 'zpracovani')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Účet, ${businessName}`} className={triggerClassName}>
          <span
            aria-hidden
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-navy-100 text-[13px] font-semibold leading-none text-navy-950"
          >
            {initialOf(businessName)}
          </span>
          <span>Účet</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={14} className="w-[260px]">
        {main.map((l) => (
          <LinkItem key={l.key} link={l} />
        ))}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette aria-hidden size={18} strokeWidth={1.5} />
            Vzhled
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
              {THEME_PREFS.map((p) => (
                <DropdownMenuRadioItem key={p} value={p}>
                  {THEME_LABELS[p]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {processing && <LinkItem link={processing} />}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ redirectUrl: '/' })}>
          <LogOut aria-hidden size={18} strokeWidth={1.5} />
          Odhlásit se
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LinkItem({ link }: { link: AccountLink }) {
  const Icon = ACCOUNT_ICONS[link.key]
  return (
    <DropdownMenuItem asChild>
      <Link href={link.href}>
        <Icon aria-hidden size={18} strokeWidth={1.5} />
        {link.label}
      </Link>
    </DropdownMenuItem>
  )
}

/** Předplatné je přesně `/w/ucet`; Zpracování údajů a export mají vlastní cesty pod ním. */
const linkActive = (pathname: string, link: AccountLink): boolean =>
  link.key === 'predplatne' ? pathname === ACCOUNT_PATH : pathname === link.href || pathname.startsWith(`${link.href}/`)

/** Účet ve výsuvném menu na telefonu: odkazy, Vzhled a Odhlásit pod oddělovačem. */
export function AccountSheetSection({ links, pathname }: { links: AccountLink[]; pathname: string }) {
  const { signOut } = useClerk()
  return (
    <section aria-label="Účet" className="mt-auto flex flex-col gap-1 border-t pt-3">
      <p className="px-3 pb-1 font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Účet</p>
      {links.map((l) => {
        const Icon = ACCOUNT_ICONS[l.key]
        const active = linkActive(pathname, l)
        return (
          <Link
            key={l.key}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-chip px-3 text-[15px] font-medium',
              active ? 'bg-navy-700 text-white' : 'text-ink hover:bg-accent',
              focusRing,
            )}
          >
            <Icon aria-hidden size={20} strokeWidth={1.5} />
            {l.label}
          </Link>
        )
      })}
      <div className="flex flex-col gap-2 px-3 py-2">
        <p className="text-[15px] font-medium">Vzhled</p>
        <ThemeSwitch />
      </div>
      <button
        type="button"
        onClick={() => void signOut({ redirectUrl: '/' })}
        className={cn('flex min-h-12 items-center gap-3 rounded-chip px-3 text-[15px] text-quiet hover:bg-accent hover:text-ink', focusRing)}
      >
        <LogOut aria-hidden size={20} strokeWidth={1.5} />
        Odhlásit se
      </button>
    </section>
  )
}
