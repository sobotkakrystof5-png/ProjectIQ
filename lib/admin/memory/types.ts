/**
 * Číselníky paměti projektu (AD15). Čte je i prohlížeč, takže tenhle soubor
 * nesmí sahat na databázi ani na `server-only` — stejné dělení jako
 * `lib/ai/consultants.ts` vedle `lib/ai/prompts.ts`.
 */

export const MEMORY_SCOPES = ['project', 'contact', 'global'] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export const MEMORY_KINDS = ['summary', 'preference', 'risk', 'glossary'] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export const MEMORY_SOURCES = ['manual', 'activity', 'assistant'] as const
export type MemorySource = (typeof MEMORY_SOURCES)[number]

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  summary: 'Shrnutí',
  preference: 'Jak to chce',
  risk: 'Pozor na',
  glossary: 'Co znamená',
}

export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  manual: 'Zapsáno ručně',
  activity: 'Ze zpráv o práci',
  assistant: 'Od asistenta',
}

/** Paměť je věta nebo dvě, ne zápis z porady. */
export const MEMORY_TEXT_MAX = 600

/**
 * Co jde předvyplnit do nové zakázky u známého klienta (AD15).
 *
 * Všechno je spočítané z historie (`lib/admin/memory/facts.ts`) — do
 * formuláře se nikdy nedostane text, který napsal model (R-085). `lines`
 * jsou věty pro člověka, aby viděl, odkud se to vzalo.
 */
export type ProjectPrefill = {
  contactId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  serviceType: string
  price: string
  lines: string[]
}
