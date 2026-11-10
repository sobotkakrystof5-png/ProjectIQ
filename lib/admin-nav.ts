// Navigace administrace (KP01, R-071): jedno místo pro menu, počty a hledání.
// Čisté funkce a data bez React a DB, aby šly testovat. Hub má vlastní postranní
// panel a v tomhle menu je jen odkaz.

export type NavIcon =
  | 'today' | 'projects' | 'requests' | 'inbox' | 'templates' | 'done' | 'rating'
  | 'calendar' | 'calls' | 'invoices' | 'costs' | 'finance' | 'clients' | 'news' | 'hub' | 'bell' | 'profile' | 'security'

export type CountKey = 'requests' | 'vizeon' | 'alteno' | 'notifications' | 'drafts'

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
    label: 'Dnes',
    items: [{ href: '/dashboard', label: 'Dnes', icon: 'today', exact: true }],
  },
  {
    label: 'Zakázky',
    items: [
      { href: '/dashboard/zakazky', label: 'Zakázky', icon: 'projects', also: ['/dashboard/new', '/alteno'], patterns: [/^\/dashboard\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/i] },
      { href: '/dashboard/pozadavky', label: 'Požadavky klientů', icon: 'requests', count: 'requests' },
      { href: '/dashboard/vizeon', label: 'Poptávky VIZEON', icon: 'inbox', count: 'vizeon' },
      { href: '/alteno/rezervace', label: 'Rezervace ALTENO', icon: 'inbox', count: 'alteno' },
      { href: '/dashboard/sablony', label: 'Šablony webu', icon: 'templates' },
      { href: '/dashboard/dokoncene', label: 'Dokončené', icon: 'done' },
      { href: '/dashboard/hodnoceni', label: 'Hodnocení', icon: 'rating' },
    ],
  },
  {
    label: 'Kalendář a hovory',
    items: [
      { href: '/dashboard/calendar', label: 'Kalendář', icon: 'calendar' },
      { href: '/dashboard/calls', label: 'Hovory', icon: 'calls' },
    ],
  },
  {
    label: 'Peníze',
    items: [
      { href: '/dashboard/faktury', label: 'Faktury', icon: 'invoices' },
      { href: '/dashboard/naklady', label: 'Náklady', icon: 'costs' },
      { href: '/hub/finance', label: 'Finance a daně', icon: 'finance' },
    ],
  },
  {
    label: 'Klienti',
    items: [
      { href: '/dashboard/klientsky-prostor', label: 'Klientský prostor', icon: 'clients' },
      { href: '/dashboard/klienti', label: 'Klienti Workspace', icon: 'clients' },
      { href: '/dashboard/novinky', label: 'Novinky', icon: 'news' },
    ],
  },
  {
    label: 'Osobní',
    items: [{ href: '/hub', label: 'Hub', icon: 'hub' }],
  },
]

/** Položky mimo skupiny (záhlaví): oznámení, profil a zabezpečení (R-081). */
export const ADMIN_UTILITY_NAV: NavItem[] = [
  { href: '/dashboard/notifications', label: 'Oznámení', icon: 'bell', count: 'notifications' },
  { href: '/dashboard/profil', label: 'Profil a statistiky', icon: 'profile' },
  { href: '/dashboard/zabezpeceni', label: 'Přihlášení a zabezpečení', icon: 'security' },
]

/** Čtyři nejčastější místa pro spodní lištu na telefonu; zbytek je v nabídce „Více“. */
export const ADMIN_MOBILE_TABS: string[] = ['/dashboard', '/dashboard/zakazky', '/dashboard/pozadavky', '/dashboard/calendar']

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
export const EMPTY_COUNTS: AdminCounts = { requests: 0, vizeon: 0, alteno: 0, notifications: 0, drafts: 0 }
