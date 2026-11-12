// Navigace administrace (KP01, R-071): jedno místo pro menu, počty a hledání.
// Čisté funkce a data bez React a DB, aby šly testovat. Od AD03 (R-087) je menu
// jedno pro celý admin — Hub zanikl a jeho obrazovky jsou pod /dashboard.
//
// „Kontakty“ (AD09) jsou v Práci hned za Hovory: Hovory jsou co se má udělat,
// Kontakty kdo to je. Od AD11 (R-090) v menu nejsou Dokončené ani Hodnocení —
// dokončenost je stav zakázky, ne vlastní obrazovka.

export type NavIcon =
  | 'today' | 'projects' | 'requests' | 'inbox'
  | 'calendar' | 'calls' | 'contacts' | 'invoices' | 'costs' | 'finance' | 'clients' | 'news'
  | 'personal' | 'startup' | 'bell' | 'profile'

export type CountKey = 'requests' | 'leads' | 'notifications' | 'drafts'

export interface NavItem {
  href: string
  label: string
  icon: NavIcon
  /** Odznak s počtem nevyřízených věcí. */
  count?: CountKey
  /** Další adresy, na kterých je položka aktivní (detail zakázky, nová zakázka…). */
  also?: string[]
  /** Adresy podle vzoru (detail zakázky má v cestě id). Vzor je méně specifický než pevná adresa. */
  patterns?: RegExp[]
  /** Aktivní jen na přesné adrese (Dnes nesmí svítit na každé stránce /dashboard/…). */
  exact?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Přehled',
    items: [{ href: '/dashboard', label: 'Dnes', icon: 'today', exact: true }],
  },
  {
    label: 'Práce',
    items: [
      { href: '/dashboard/zakazky', label: 'Zakázky', icon: 'projects', also: ['/dashboard/new'], patterns: [/^\/dashboard\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/i] },
      // Jeden inbox pro všechny weby (AD02); staré adresy přesměrují, viz lib/legacy-redirects.mjs.
      { href: '/dashboard/poptavky', label: 'Poptávky z webů', icon: 'inbox', count: 'leads' },
      { href: '/dashboard/pozadavky', label: 'Požadavky klientů', icon: 'requests', count: 'requests' },
      { href: '/dashboard/calls', label: 'Hovory', icon: 'calls' },
      { href: '/dashboard/kontakty', label: 'Kontakty', icon: 'contacts' },
      { href: '/dashboard/calendar', label: 'Kalendář', icon: 'calendar' },
      // Dokončené a Hodnocení v menu nejsou (AD11, R-090): dokončená zakázka
      // je zakázka se stavem hotovo/zaplaceno, hodnocení je na ní. Přehled
      // výkonnosti a souhrn hodnocení jsou na Profilu.
    ],
  },
  {
    label: 'Peníze',
    items: [
      { href: '/dashboard/faktury', label: 'Faktury', icon: 'invoices' },
      { href: '/dashboard/naklady', label: 'Náklady', icon: 'costs' },
      { href: '/dashboard/finance', label: 'Finance a daně', icon: 'finance' },
    ],
  },
  {
    // ZakazIQ jako produkt pro cizí firmy — ne osobní systém, proto vlastní skupina.
    label: 'Klienti',
    items: [
      { href: '/dashboard/klientsky-prostor', label: 'Klientský prostor', icon: 'clients' },
      { href: '/dashboard/klienti', label: 'Klienti Workspace', icon: 'clients' },
      { href: '/dashboard/novinky', label: 'Novinky', icon: 'news' },
    ],
  },
  {
    label: 'Osobní',
    items: [
      { href: '/dashboard/projekty', label: 'Projekty', icon: 'personal' },
      { href: '/dashboard/startup', label: 'Startup', icon: 'startup' },
    ],
  },
]

/** Položky mimo skupiny (záhlaví): oznámení a profil. */
export const ADMIN_UTILITY_NAV: NavItem[] = [
  { href: '/dashboard/notifications', label: 'Oznámení', icon: 'bell', count: 'notifications' },
  { href: '/dashboard/profil', label: 'Profil a statistiky', icon: 'profile' },
]

/**
 * Čtyři nejčastější místa pro spodní lištu na telefonu; zbytek je v nabídce „Více“.
 * Po AD02 je hlavní inbox jeden (Poptávky z webů), proto je na liště místo
 * Požadavků klientů — ty mají odznak i v menu a hlásí se samy na Dnes.
 */
export const ADMIN_MOBILE_TABS: string[] = ['/dashboard', '/dashboard/zakazky', '/dashboard/poptavky', '/dashboard/calendar']

export const allNavItems = (): NavItem[] => [...ADMIN_NAV.flatMap((g) => g.items), ...ADMIN_UTILITY_NAV]

const startsWithPath = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`)

/** Je položka aktivní na dané adrese? Z víc shod vyhrává nejdelší (viz activeHref). */
/** Adresa položky, která má na `pathname` svítit (nejspecifičtější shoda), nebo null. */
export function activeHref(pathname: string): string | null {
  let best: { href: string; length: number } | null = null
  const consider = (href: string, length: number) => {
    if (!best || length > best.length) best = { href, length }
  }
  for (const item of allNavItems()) {
    const bases = item.exact ? [item.href] : [item.href, ...(item.also ?? [])]
    for (const base of bases) {
      const hit = item.exact ? pathname === base : startsWithPath(pathname, base)
      if (hit) consider(item.href, base.length)
    }
    if (item.patterns?.some((re) => re.test(pathname))) consider(item.href, 1)
  }
  return (best as { href: string } | null)?.href ?? null
}

export const formatBadge = (n: number): string => (n > 99 ? '99+' : String(n))

export type AdminCounts = Record<CountKey, number>
export const EMPTY_COUNTS: AdminCounts = { requests: 0, leads: 0, notifications: 0, drafts: 0 }
