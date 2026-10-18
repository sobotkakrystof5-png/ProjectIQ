'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus, FilePlus2, FileText, Inbox, Link2, User, type LucideIcon } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { searchAction } from '@/app/w/[business]/actions'
import { normalize, parseCommand } from '@/lib/ws/command-parser'
import { hrefWith } from '@/lib/ws/detail-param'
import type { NewAction } from '@/lib/ws/features'
import { navHref, type AccountLink, type NavItem } from '@/lib/ws/nav'
import type { SearchHit } from '@/lib/ws/search'
import { formatDayShort, formatMinutes } from '@/lib/ws/time'
import { ACCOUNT_ICONS } from './account-menu'
import { copyOrderLink } from './copy-order-link'
import { NavIcon } from './nav-icon'

export type PaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  nav: NavItem[]
  /** Nastavení a Účet (jen majitel, RD01) — v hlavním menu nejsou, ⌘K je dál najde. */
  accountLinks: AccountLink[]
  /** Jen hotové akce (lib/ws/features.ts, R-043). */
  actions: NewAction[]
  orderUrl: string
  services: string[]
  today: string
}

const HIT_ICON = { zakaznik: User, poptavka: Inbox, faktura: FileText } as const
const HIT_GROUP = { zakaznik: 'Zákazníci', poptavka: 'Poptávky', faktura: 'Faktury' } as const

/**
 * ⌘K: najde zákazníka, poptávku nebo fakturu, přejde na obrazovku a umí
 * akce. „rezervace Tereza pátek 9:00" rozpozná parser a nabídne rezervaci
 * s předvyplněnými údaji (lib/ws/command-parser.ts).
 */
export function CommandPalette({ open, onOpenChange, slug, nav, accountLinks, actions: available, orderUrl, services, today }: PaletteProps) {
  const canBook = available.includes('booking')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const latest = useRef('')

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setError(null)
    }
  }, [open])

  // Hledání v DB až po krátké pauze v psaní; starší odpověď nepřepíše novější.
  useEffect(() => {
    const text = query.trim()
    latest.current = text
    if (text.length < 2) {
      setHits([])
      setError(null)
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAction({ slug, query: text })
        if (latest.current !== text) return
        if (res.ok) {
          setHits(res.data)
          setError(null)
        } else {
          setHits([])
          setError(res.error)
        }
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query, slug])

  const command = useMemo(() => (canBook ? parseCommand(query, { today, services }) : null), [query, today, services, canBook])

  const currentParams = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])
  const go = (href: string) => {
    onOpenChange(false)
    router.push(href, { scroll: false })
  }
  const openDetail = (value: string, extra: Record<string, string | null> = {}) =>
    go(hrefWith(pathname, currentParams, { detail: value, ...extra }))

  const q = normalize(query.trim())
  const matches = (label: string) => !q || normalize(label).includes(q)
  const navMatches = nav.filter((i) => matches(i.label))
  const accountMatches = accountLinks.filter((l) => matches(l.paletteLabel))

  const actions: { key: string; label: string; icon: LucideIcon; run: () => void }[] = []
  if (available.includes('booking')) actions.push({ key: 'booking', label: 'Nová rezervace', icon: CalendarPlus, run: () => openDetail('nova-rezervace') })
  if (available.includes('invoice')) actions.push({ key: 'invoice', label: 'Nová faktura', icon: FilePlus2, run: () => openDetail('nova-faktura') })
  if (available.includes('link')) {
    actions.push({
      key: 'link',
      label: 'Zkopírovat odkaz na objednání',
      icon: Link2,
      run: () => {
        onOpenChange(false)
        void copyOrderLink(orderUrl)
      },
    })
  }
  const visibleActions = actions.filter((a) => matches(a.label))

  const commandLabel = command
    ? [
        command.customer ?? 'bez jména',
        command.service,
        command.date ? formatDayShort(command.date) : null,
        command.minutes !== null ? `v ${formatMinutes(command.minutes)}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : null

  const groups = (['zakaznik', 'poptavka', 'faktura'] as const)
    .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      title="Hledat"
      description="Najděte zákazníka, poptávku nebo fakturu, nebo napište třeba „rezervace Tereza pátek 9:00“."
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Hledat, nebo „rezervace Tereza pátek 9:00“"
        aria-label="Hledat"
      />
      <CommandList>
        <CommandEmpty>
          {error ?? (pending ? 'Hledám…' : query.trim().length < 2 ? 'Napište aspoň dvě písmena.' : 'Nic jsme nenašli. Zkuste jiné slovo.')}
        </CommandEmpty>

        {command && commandLabel && (
          <CommandGroup heading="Příkaz">
            <CommandItem
              value="prikaz-rezervace"
              onSelect={() =>
                openDetail('nova-rezervace', {
                  kdo: command.customer,
                  den: command.date,
                  cas: command.minutes !== null ? String(command.minutes) : null,
                  sluzba: command.service,
                })
              }
            >
              <CalendarPlus size={18} strokeWidth={1.5} />
              <span className="min-w-0 truncate">
                Nová rezervace: <span className="font-semibold">{commandLabel}</span>
              </span>
            </CommandItem>
          </CommandGroup>
        )}

        {groups.map((g) => {
          const Icon = HIT_ICON[g.kind]
          return (
            <CommandGroup key={g.kind} heading={HIT_GROUP[g.kind]}>
              {g.items.map((h) => (
                <CommandItem
                  key={`${h.kind}-${h.id}`}
                  value={`${h.kind}-${h.id}`}
                  onSelect={() =>
                    h.kind === 'faktura' ? go(navHref(slug, 'faktury') + '?detail=faktura:' + h.id) : openDetail(`${h.kind}:${h.id}`)
                  }
                >
                  <Icon size={18} strokeWidth={1.5} />
                  <span className="min-w-0 truncate">{h.title}</span>
                  {h.subtitle && <CommandShortcut className="truncate">{h.subtitle}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}

        {visibleActions.length > 0 && (
          <CommandGroup heading="Akce">
            {visibleActions.map((a) => (
              <CommandItem key={a.key} value={`akce-${a.key}`} onSelect={a.run}>
                <a.icon size={18} strokeWidth={1.5} />
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {navMatches.length + accountMatches.length > 0 && (
          <CommandGroup heading="Přejít na">
            {navMatches.map((item) => (
              <CommandItem key={item.key} value={`nav-${item.key}`} onSelect={() => go(navHref(slug, item.segment))}>
                <NavIcon name={item.key} size={18} />
                {item.label}
              </CommandItem>
            ))}
            {accountMatches.map((l) => {
              const Icon = ACCOUNT_ICONS[l.key]
              return (
                <CommandItem key={l.key} value={`ucet-${l.key}`} onSelect={() => go(l.href)}>
                  <Icon aria-hidden size={18} strokeWidth={1.5} />
                  {l.paletteLabel}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
