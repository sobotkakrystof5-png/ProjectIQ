// Jeden byznys, tři zdroje poptávek (AD02, R-088).
//
// VIZEON ani ALTENO už nejsou dvě firmy — je to jedna firma, která přijímá
// poptávky z několika webů. U zakázky, termínu a leadu se proto eviduje jen
// `lead_origin`: odkud poptávka přišla. Ruční zakázka má `source = 'manual'`
// a `lead_origin` podle toho, ke kterému webu patří.
//
// Všechno, co se u zdroje liší (název, doména, hodnota `source`, API klíč,
// vlastní okno rate limitu), je jen tady. Přidání dalšího webu (estetik.cz)
// je jeden řádek v LEAD_ORIGINS, ne nová routa ani nová konfigurace.

export type LeadOrigin = 'vizeon' | 'alteno' | 'prvotka' | 'jiny'

export interface LeadOriginConfig {
  key: LeadOrigin
  /** Verzálkový název pro odznaky a filtry v UI */
  label: string
  /** Název v běžném textu — e-maily, oznámení */
  name: string
  /** Doména webu, ze kterého chodí veřejné poptávky; null = zdroj bez webu */
  domain: string | null
  /** Hodnota `projects.source` u poptávky z tohoto webu; null = jen ručně */
  source: string | null
  /** Fallback typu služby, když ho formulář nevyplnil */
  defaultServiceType: string
}

export const LEAD_ORIGINS: Record<LeadOrigin, LeadOriginConfig> = {
  vizeon: {
    key: 'vizeon',
    label: 'VIZEON',
    name: 'Vizeon',
    domain: 'vizeon.cz',
    source: 'vizeon_web',
    defaultServiceType: 'Webový projekt',
  },
  alteno: {
    key: 'alteno',
    label: 'ALTENO',
    name: 'Alteno',
    domain: 'alteno.cz',
    source: 'alteno_web',
    defaultServiceType: 'AI automatizace',
  },
  prvotka: {
    key: 'prvotka',
    // Prvotka je zatím SaaS ve vývoji, ne hotová nabídka — proto obecný typ
    // služby „Poptávka z webu“ místo konkrétní služby, kterou si nevymýšlíme.
    // Až bude nabídka hotová, změní se tenhle jeden řádek.
    label: 'PRVOTKA',
    name: 'Prvotka',
    domain: 'prvotka.cz',
    source: 'prvotka_web',
    defaultServiceType: 'Poptávka z webu',
  },
  jiny: {
    key: 'jiny',
    label: 'JINÝ ZDROJ',
    name: 'Jiný zdroj',
    domain: null,
    source: null,
    defaultServiceType: 'Zakázka',
  },
}

/** Zdroje s vlastním webem — pro filtry v UI a výpis napojení. */
export const WEB_LEAD_ORIGINS: LeadOriginConfig[] = [
  LEAD_ORIGINS.vizeon,
  LEAD_ORIGINS.alteno,
  LEAD_ORIGINS.prvotka,
]

/** Výchozí zdroj pro ruční zakázku a pro admin blokace v kalendáři. */
export const DEFAULT_LEAD_ORIGIN: LeadOrigin = 'vizeon'

/**
 * Bezpečné zúžení hodnoty ze sloupce `lead_origin`. Neznámá hodnota spadne na
 * VIZEON stejně jako dřív `toBusiness` — stejná funkce zároveň normalizuje
 * `section` z payloadu cizího vizeon-lead-agenta, který posílá leady VIZEONu.
 */
export function toLeadOrigin(value: string | null | undefined): LeadOrigin {
  return value === 'alteno' || value === 'prvotka' || value === 'jiny' ? value : DEFAULT_LEAD_ORIGIN
}

/**
 * Env proměnné s klíči jednotlivých endpointů. Schválně **mimo LEAD_ORIGINS**:
 * ten se importuje i do klientských komponent (štítek zdroje na kartě), a názvy
 * secretů nemají co dělat v bundlu pro prohlížeč. Čte se jen na serveru.
 *
 * Každý web má vlastní klíč — kdyby unikl z jednoho repa, nepustí poptávky
 * za ostatní weby.
 */
export const LEAD_ORIGIN_KEYS: Record<LeadOrigin, { booking: string | null; lead: string | null }> = {
  vizeon: { booking: 'VIZEON_API_KEY', lead: null },
  alteno: { booking: 'ALTENO_API_KEY', lead: 'ALTENO_LEAD_WEBHOOK_SECRET' },
  prvotka: { booking: null, lead: 'PRVOTKA_LEAD_WEBHOOK_SECRET' },
  jiny: { booking: null, lead: null },
}

/** Vlastní okno rate limitu per zdroj — tři weby si limit nesmí brát navzájem. */
export const bookingRateLimitKey = (origin: LeadOrigin): string => `${origin}_booking`
export const leadRateLimitKey = (origin: LeadOrigin): string => `${origin}_lead`

/**
 * Adresa pro admin oznámení. Jeden byznys = jedna schránka: poptávky ze všech
 * webů chodí na VIZEON_ADMIN_EMAIL (info@vizeon.cz), ADMIN_EMAIL je záloha.
 */
export function adminEmail(): string | undefined {
  return process.env.VIZEON_ADMIN_EMAIL || process.env.ADMIN_EMAIL
}

/** Detail zakázky — jedna sekce adminu, žádné `basePath` per byznys. */
export const projectPath = (projectId: string): string => `/dashboard/${projectId}`

/** Jeden inbox nepotvrzených poptávek ze všech webů. */
export const LEADS_INBOX_PATH = '/dashboard/poptavky'
