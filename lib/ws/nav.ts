import type { WsModule } from './templates/types'

// Navigace aplikace: položky postranního panelu a spodní lišty podle
// zapnutých funkcí byznysu. Bez závislostí — importuje ji serverová stránka
// i klientská kostra.

export type NavKey =
  | 'dnes'
  | 'poptavky'
  | 'kalendar'
  | 'zakaznici'
  | 'zakazky'
  | 'faktury'
  | 'prijmy'
  | 'dane'
  | 'nastaveni'

export type NavItem = {
  key: NavKey
  label: string
  /** Část cesty za /w/[byznys]; Dnes = ''. */
  segment: string
  /** Funkce, bez které položka není vidět. `null` = vždy. */
  module: WsModule | null
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dnes', label: 'Dnes', segment: '', module: null },
  { key: 'poptavky', label: 'Poptávky', segment: 'poptavky', module: 'requests' },
  { key: 'kalendar', label: 'Kalendář', segment: 'kalendar', module: 'calendar' },
  { key: 'zakaznici', label: 'Zákazníci', segment: 'zakaznici', module: 'customers' },
  { key: 'zakazky', label: 'Zakázky', segment: 'zakazky', module: 'jobs' },
  { key: 'faktury', label: 'Faktury', segment: 'faktury', module: 'invoices' },
  { key: 'prijmy', label: 'Příjmy', segment: 'prijmy', module: 'finance' },
  { key: 'dane', label: 'Daně', segment: 'dane', module: 'taxes' },
  { key: 'nastaveni', label: 'Nastavení', segment: 'nastaveni', module: null },
]

/** Poptávky a Zákazníci jsou v aplikaci vždy zapnuté (plán, Nastavení › Moduly). */
const ALWAYS: readonly WsModule[] = ['requests', 'customers']

export const isModuleOn = (enabled: ReadonlySet<string>, module: WsModule | null): boolean =>
  module === null || ALWAYS.includes(module) || enabled.has(module)

export function navItems(enabled: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter((item) => isModuleOn(enabled, item.module))
}

export function navHref(slug: string, segment: string): string {
  return segment ? `/w/${slug}/${segment}` : `/w/${slug}`
}

/** Položka podle části cesty, jen když je funkce zapnutá. */
export function navItemForSegment(segment: string, enabled: ReadonlySet<string>): NavItem | null {
  const item = NAV_ITEMS.find((i) => i.segment === segment && i.segment !== '')
  return item && isModuleOn(enabled, item.module) ? item : null
}

export type BottomBarSlot =
  | { kind: 'link'; key: NavKey | 'penize'; label: string; segment: string }
  | { kind: 'new' }

/**
 * Spodní lišta na telefonu (mockup D): Dnes, Kalendář, +, Zákazníci, Peníze.
 * Bez kalendáře je na jeho místě Poptávky; Peníze vedou na první zapnutou
 * peněžní funkci (Příjmy → Faktury → Daně), bez nich je tam Zakázky nebo nic.
 */
export function bottomBarSlots(enabled: ReadonlySet<string>): BottomBarSlot[] {
  const link = (item: NavItem, label = item.label, key: NavKey | 'penize' = item.key): BottomBarSlot => ({
    kind: 'link',
    key,
    label,
    segment: item.segment,
  })
  const byKey = (key: NavKey) => NAV_ITEMS.find((i) => i.key === key)!
  const on = (key: NavKey) => isModuleOn(enabled, byKey(key).module)

  const second = on('kalendar') ? byKey('kalendar') : byKey('poptavky')
  const money = (['prijmy', 'faktury', 'dane'] as const).find(on)
  const fifth: BottomBarSlot | null = money
    ? link(byKey(money), 'Peníze', 'penize')
    : on('zakazky')
      ? link(byKey('zakazky'))
      : null

  return [link(byKey('dnes')), link(second), { kind: 'new' }, link(byKey('zakaznici')), ...(fifth ? [fifth] : [])]
}
