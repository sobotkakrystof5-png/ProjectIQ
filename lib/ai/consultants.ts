/**
 * Role konzultantů u startupového projektu (`/dashboard/startup/[id]`).
 *
 * Číselník je čistý a sdílený: prohlížeč z něj bere dlaždice a nadpis okénka,
 * server z něj staví systémový prompt (`lib/ai/prompts.ts`). Jeden seznam,
 * takže UI nemůže nabídnout roli, kterou server nezná — a právě tohle je
 * důvod, proč z prohlížeče chodí jen `mode`, ne hotový prompt (AD14).
 */

export const CONSULT_MODES = [
  'marketing',
  'pr',
  'launch',
  'business',
  'design',
  'finance',
  'operations',
  'coo',
] as const

export type ConsultMode = (typeof CONSULT_MODES)[number]

export type ConsultProfile = { icon: string; name: string; description: string }

export const CONSULT_PROFILES: Record<ConsultMode, ConsultProfile> = {
  marketing: {
    icon: '📣',
    name: 'Marketingový stratég',
    description: 'Pomáhá s propagací, obsahovou strategií a růstem',
  },
  pr: {
    icon: '📰',
    name: 'PR a komunikace',
    description: 'Tiskové zprávy, mediální strategie, budování značky',
  },
  launch: {
    icon: '🚀',
    name: 'Spuštění produktu',
    description: 'Plánování spuštění, cesta na trh, Product Hunt',
  },
  business: {
    icon: '💰',
    name: 'Byznys poradce',
    description: 'Byznysová rozhodnutí, ceny, partnerství, růst',
  },
  design: {
    icon: '🎨',
    name: 'Grafický designér',
    description: 'Identita značky, vizuální styl, doporučení k rozhraní',
  },
  finance: {
    icon: '📊',
    name: 'Finanční analytik',
    description: 'Finanční odhady, jednotková ekonomika, investice',
  },
  operations: {
    icon: '⚙️',
    name: 'Chod firmy',
    description: 'Procesy, automatizace, chod firmy a týmu',
  },
  coo: {
    icon: '🤝',
    name: 'Vaše pravá ruka',
    description: 'Sleduje rozhodnutí, plány a změny projektu',
  },
}

export function isConsultMode(value: unknown): value is ConsultMode {
  return typeof value === 'string' && (CONSULT_MODES as readonly string[]).includes(value)
}
