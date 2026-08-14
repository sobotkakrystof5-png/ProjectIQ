// Dva byznysy nad jedním datovým modelem — VIZEON (tvorba webů) a ALTENO
// (AI automatizace). Sekce /dashboard a /alteno jsou stejný software; liší se
// jen brandingem, cestami a hodnotou sloupce `business` v databázi.
// Nikdy nesestavuj cesty ani `source` ručně — ber je vždy odsud, ať obě
// sekce nemůžou rozjet.

export type Business = 'vizeon' | 'alteno'

export interface BusinessConfig {
  key: Business
  /** Verzálkový název pro nadpisy a badge v UI */
  label: string
  /** Název v běžném textu — emaily, notifikace */
  name: string
  /** Doména webu, ze kterého chodí veřejné poptávky */
  domain: string
  /** Kořen sekce v adminu */
  basePath: string
  /** Inbox nepotvrzených poptávek z webu */
  inboxPath: string
  /** Hodnota projects.source u poptávek z webu */
  source: string
  /** Fallback typu služby v emailech, když ho klient nevyplnil */
  defaultServiceType: string
}

export const BUSINESSES: Record<Business, BusinessConfig> = {
  vizeon: {
    key: 'vizeon',
    label: 'VIZEON',
    name: 'Vizeon',
    domain: 'vizeon.cz',
    basePath: '/dashboard',
    inboxPath: '/dashboard/vizeon',
    source: 'vizeon_web',
    defaultServiceType: 'Webový projekt',
  },
  alteno: {
    key: 'alteno',
    label: 'ALTENO',
    name: 'Alteno',
    domain: 'alteno.cz',
    basePath: '/alteno',
    inboxPath: '/alteno/rezervace',
    source: 'alteno_web',
    defaultServiceType: 'AI automatizace',
  },
}

export function projectPath(business: Business, projectId: string): string {
  return `${BUSINESSES[business].basePath}/${projectId}`
}

/** Bezpečné zúžení hodnoty ze sloupce `business` — neznámé hodnoty spadnou na VIZEON. */
export function toBusiness(value: string | null | undefined): Business {
  return value === 'alteno' ? 'alteno' : 'vizeon'
}
