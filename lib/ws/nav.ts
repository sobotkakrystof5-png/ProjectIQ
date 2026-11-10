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
  | 'penize'
  | 'faktury'
  | 'prijmy'
  | 'dane'
  | 'navody'
  | 'nastaveni'

export type NavItem = {
  key: NavKey
  label: string
  /** Část cesty za /w/[byznys]; Dnes = ''. */
  segment: string
  /** Funkce, bez které položka není vidět. `null` = vždy. */
  module: WsModule | null
}

/** Všechny obrazovky pod /w/[byznys]. Hlavní menu z nich bere jen část (`navItems`). */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dnes', label: 'Dnes', segment: '', module: null },
  { key: 'poptavky', label: 'Poptávky', segment: 'poptavky', module: 'requests' },
  { key: 'kalendar', label: 'Kalendář', segment: 'kalendar', module: 'calendar' },
  { key: 'zakaznici', label: 'Zákazníci', segment: 'zakaznici', module: 'customers' },
  { key: 'zakazky', label: 'Zakázky', segment: 'zakazky', module: 'jobs' },
  { key: 'penize', label: 'Peníze', segment: 'penize', module: 'finance' },
  { key: 'faktury', label: 'Faktury', segment: 'faktury', module: 'invoices' },
  { key: 'prijmy', label: 'Příjmy', segment: 'prijmy', module: 'finance' },
  { key: 'dane', label: 'Daně', segment: 'dane', module: 'taxes' },
  { key: 'navody', label: 'Návody', segment: 'navody', module: null },
  { key: 'nastaveni', label: 'Nastavení', segment: 'nastaveni', module: null },
]

/** Poptávky a Zákazníci jsou v aplikaci vždy zapnuté (plán, Nastavení › Moduly). */
const ALWAYS: readonly WsModule[] = ['requests', 'customers']

export const isModuleOn = (enabled: ReadonlySet<string>, module: WsModule | null): boolean =>
  module === null || ALWAYS.includes(module) || enabled.has(module)

const byKey = (key: NavKey): NavItem => NAV_ITEMS.find((i) => i.key === key)!

/** Hlavní menu mimo Peníze, v pořadí, v jakém se ukazuje. */
const WORK_KEYS: readonly NavKey[] = ['dnes', 'poptavky', 'kalendar', 'zakaznici', 'zakazky']

/**
 * Obrazovky, které jsou záložkami jedné stránky Peníze (RD01). Pořadí = pořadí
 * záložek; Peníze vedou na první zapnutou, Přehled měsíce má přednost.
 */
const MONEY_KEYS = ['penize', 'faktury', 'prijmy', 'dane'] as const satisfies readonly NavKey[]

/** Jedna položka Peníze, nebo `null`, když není zapnutá žádná peněžní funkce. */
export function moneyItem(enabled: ReadonlySet<string>): NavItem | null {
  const first = MONEY_KEYS.map(byKey).find((i) => isModuleOn(enabled, i.module))
  return first ? { key: 'penize', label: 'Peníze', segment: first.segment, module: first.module } : null
}

/** Hlavní menu: práce, peníze a Návody (podle zapnutých funkcí). */
export function navItems(enabled: ReadonlySet<string>): NavItem[] {
  const work = WORK_KEYS.map(byKey).filter((i) => isModuleOn(enabled, i.module))
  const money = moneyItem(enabled)
  return money ? [...work, money, byKey('navody')] : [...work, byKey('navody')]
}

/** Cíle pro ⌘K „Přejít na“: hlavní menu a navíc záložky Peněz, které v menu samostatně nejsou. */
export function paletteItems(enabled: ReadonlySet<string>): NavItem[] {
  const tabs = (['faktury', 'prijmy', 'dane'] as const).map(byKey).filter((i) => isModuleOn(enabled, i.module))
  return [...navItems(enabled), ...tabs]
}

export function navHref(slug: string, segment: string): string {
  return segment ? `/w/${slug}/${segment}` : `/w/${slug}`
}

/** Položka podle části cesty, jen když je funkce zapnutá. */
export function navItemForSegment(segment: string, enabled: ReadonlySet<string>): NavItem | null {
  const item = NAV_ITEMS.find((i) => i.segment === segment && i.segment !== '')
  return item && isModuleOn(enabled, item.module) ? item : null
}

/** Svítí položka na téhle cestě? Peníze svítí na všech svých záložkách. */
export function isNavActive(pathname: string, slug: string, item: Pick<NavItem, 'key' | 'segment'>): boolean {
  if (item.segment === '') return pathname === navHref(slug, '')
  const segments: readonly string[] = item.key === 'penize' ? MONEY_KEYS.map((k) => byKey(k).segment) : [item.segment]
  return segments.some((s) => {
    const href = navHref(slug, s)
    return pathname === href || pathname.startsWith(`${href}/`)
  })
}

/** Cesta k účtu mimo byznys (S08). */
export const ACCOUNT_PATH = '/w/ucet'

export type AccountLinkKey = 'nastaveni' | 'predplatne' | 'zpracovani' | 'zabezpeceni'

/** Přihlášení a zabezpečení — 2FA, heslo, odhlášení všude (R-081). Pro každého. */
export const SECURITY_PATH = '/w/zabezpeceni'

export type AccountLink = {
  key: AccountLinkKey
  /** Text v menu Účet. */
  label: string
  /** Text v ⌘K. */
  paletteLabel: string
  href: string
}

const SECURITY_LINK: AccountLink = {
  key: 'zabezpeceni',
  label: 'Přihlášení a zabezpečení',
  paletteLabel: 'Zabezpečení a dvoufázové ověření',
  href: SECURITY_PATH,
}

/**
 * Odkazy z menu Účet (RD01). Firmu, předplatné a zpracování údajů mění jen
 * majitel; Přihlášení a zabezpečení (R-081) má každý, i pracovník — 2FA a heslo
 * jsou jeho vlastní. Adresy Nastavení se nemění (e-maily, ⌘K).
 */
export function accountLinks(slug: string, isOwner: boolean): AccountLink[] {
  if (!isOwner) return [SECURITY_LINK]
  return [
    { key: 'nastaveni', label: 'Nastavení firmy', paletteLabel: 'Nastavení', href: navHref(slug, 'nastaveni') },
    { key: 'predplatne', label: 'Předplatné a doklady', paletteLabel: 'Účet a předplatné', href: ACCOUNT_PATH },
    SECURITY_LINK,
    { key: 'zpracovani', label: 'Zpracování údajů', paletteLabel: 'Zpracování údajů', href: `${ACCOUNT_PATH}/zpracovani` },
  ]
}

/** Účet svítí na stránkách účtu i na Nastavení. */
export function isAccountActive(pathname: string, slug: string): boolean {
  const settings = navHref(slug, 'nastaveni')
  return (
    pathname === ACCOUNT_PATH ||
    pathname.startsWith(`${ACCOUNT_PATH}/`) ||
    pathname === SECURITY_PATH ||
    pathname === settings ||
    pathname.startsWith(`${settings}/`)
  )
}

export type BottomBarSlot =
  | { kind: 'link'; key: NavKey; label: string; segment: string }
  | { kind: 'new' }

/**
 * Spodní lišta na telefonu (mockup D): Dnes, Kalendář, +, Zákazníci, Peníze.
 * Bez kalendáře je na jeho místě Poptávky; Peníze vedou stejně jako v hlavním
 * menu na první zapnutou peněžní funkci, bez nich je tam Zakázky nebo nic.
 */
export function bottomBarSlots(enabled: ReadonlySet<string>): BottomBarSlot[] {
  const link = (item: NavItem): BottomBarSlot => ({ kind: 'link', key: item.key, label: item.label, segment: item.segment })
  const on = (key: NavKey) => isModuleOn(enabled, byKey(key).module)

  const second = on('kalendar') ? byKey('kalendar') : byKey('poptavky')
  const money = moneyItem(enabled)
  const fifth: BottomBarSlot | null = money ? link(money) : on('zakazky') ? link(byKey('zakazky')) : null

  return [link(byKey('dnes')), link(second), { kind: 'new' }, link(byKey('zakaznici')), ...(fifth ? [fifth] : [])]
}
