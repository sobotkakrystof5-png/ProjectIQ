import { z } from 'zod'
import { safeHttpUrl, stripControlChars } from '@/lib/security/html'

/**
 * Výsledek rozboru firmy (navrhovač nabídek, N1, R-147).
 *
 * Úloha Claude Code ho pošle na `POST /api/public/rozbory/[id]` (R-149) — to
 * je jediný výstup, který admin z rozboru bere. Text pochází od modelu, který
 * četl cizí weby, takže je to **nedůvěryhodný vstup** (R-069): server ho tady
 * ořeže, zahodí, co nesedí, a vykresluje se jen jako text.
 *
 * Pravidlo B10 drží server, ne model: tvrzení bez platného zdroje se zahodí.
 * Odhad typické zakázky smí být bez zdroje, ale pak má vždy nízkou jistotu.
 */

const MAX_SOURCES = 40

/* ------------------------------------------------------------------ */
/* Schéma pro model (JSON Schema, posílá ho /api/public/rozbory)       */
/* ------------------------------------------------------------------ */

const claimSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'sources'],
  properties: {
    text: { type: 'string', description: 'Jedno zjištění česky, nejvýš 300 znaků.' },
    sources: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Indexy do pole sources (od nuly), odkud zjištění je. Aspoň jeden.',
    },
  },
} as const

const claims = (description: string) => ({ type: 'array', items: claimSchema, description }) as const
const nullable = (type: string, description: string) => ({ type: [type, 'null'], description }) as const

/** Tvar výsledku, který úloha posílá. Musí sedět na `rawResultSchema` níž. */
export const RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sources', 'web', 'company', 'reviews', 'typical_job', 'competitors', 'signals', 'warnings', 'ask_client'],
  properties: {
    sources: {
      type: 'array',
      description: 'Všechny zdroje, ze kterých rozbor vychází. Každý jen jednou.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'title'],
        properties: {
          url: { type: 'string', description: 'Přesná adresa stránky (https://…).' },
          title: { type: 'string', description: 'Krátký popis zdroje, např. „Web firmy – Ceník".' },
        },
      },
    },
    web: {
      type: 'object',
      additionalProperties: false,
      required: ['url', 'exists', 'state', 'tech', 'findings', 'gaps'],
      properties: {
        url: nullable('string', 'Adresa webu firmy, když nějaký má.'),
        exists: { type: 'boolean', description: 'Má firma vlastní web (ne jen profil na Facebooku nebo v katalogu)?' },
        state: {
          type: 'string',
          enum: ['none', 'outdated', 'ok', 'good'],
          description: 'none = web není, outdated = zastaralý nebo rozbitý, ok = použitelný, good = dobrý.',
        },
        tech: nullable('string', 'Na čem web běží (WordPress, Wix, Webnode, vlastní…), když to jde poznat.'),
        findings: claims('Co na webu je: služby, ceník, reference, formulář, jak vypadá na mobilu.'),
        gaps: claims('Co webu chybí, aby nosil poptávky.'),
      },
    },
    company: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'industry', 'city', 'ico', 'legal_form', 'founded_year', 'findings'],
      properties: {
        summary: { type: 'string', description: 'Dvě až čtyři věty, kdo firma je a co dělá. Bez hodnocení.' },
        industry: nullable('string', 'Obor.'),
        city: nullable('string', 'Město nebo oblast, kde působí.'),
        ico: nullable('string', 'IČO (8 číslic), když ho zdroj uvádí.'),
        legal_form: nullable('string', 'Právní forma (OSVČ, s.r.o., a.s.…).'),
        founded_year: nullable('integer', 'Rok vzniku podle rejstříku.'),
        findings: claims('Velikost, obrat a zisk z účetní závěrky, lidé, auta, provozovny, aktivita na sítích, inzeráty na práci, dotace, zakázky, média.'),
      },
    },
    reviews: {
      type: 'object',
      additionalProperties: false,
      required: ['count', 'rating', 'sources', 'praised', 'criticized'],
      properties: {
        count: nullable('integer', 'Počet recenzí (Google, Firmy.cz…).'),
        rating: nullable('number', 'Průměrné hodnocení 1–5.'),
        sources: { type: 'array', items: { type: 'integer' }, description: 'Odkud počet a hodnocení jsou.' },
        praised: claims('Co zákazníci chválí.'),
        criticized: claims('Co zákazníci vytýkají.'),
      },
    },
    typical_job: {
      type: 'object',
      additionalProperties: false,
      required: ['min_czk', 'max_czk', 'confidence', 'reasoning', 'sources'],
      properties: {
        min_czk: nullable('integer', 'Typická zakázka klienta od (Kč).'),
        max_czk: nullable('integer', 'Typická zakázka klienta do (Kč).'),
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        reasoning: { type: 'string', description: 'Jednou až dvěma větami, z čeho odhad je.' },
        sources: { type: 'array', items: { type: 'integer' } },
      },
    },
    competitors: {
      type: 'array',
      description: 'Dva až tři konkurenti v okolí.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url', 'note', 'sources'],
        properties: {
          name: { type: 'string' },
          url: nullable('string', 'Web konkurenta.'),
          note: { type: 'string', description: 'Čím se liší, jaké má ceny, jaký má web.' },
          sources: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
    signals: {
      type: 'array',
      description: 'Veřejné signály, kolik si firma může dovolit (velikost, obrat, recenze, reklama, růst).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'direction', 'sources'],
        properties: {
          text: { type: 'string' },
          direction: { type: 'string', enum: ['up', 'down', 'neutral'], description: 'up = může dát víc, down = méně.' },
          sources: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
    warnings: claims('Varování: insolvence, likvidace, zavřená provozovna, spory.'),
    ask_client: {
      type: 'array',
      items: { type: 'string' },
      description: 'Co se nepodařilo zjistit a je potřeba se zeptat klienta. Krátké otázky.',
    },
  },
} as const

/* ------------------------------------------------------------------ */
/* Kontrola serverem                                                   */
/* ------------------------------------------------------------------ */

/** Ořízne text na délku a zbaví ho řídicích znaků. Nikdy nevyhazuje. */
const text = (max: number) =>
  z.unknown().transform((v) => (typeof v === 'string' ? stripControlChars(v).replace(/\s+/g, ' ').trim().slice(0, max) : ''))

const optionalText = (max: number) => text(max).transform((v) => (v === '' ? null : v))

const indexList = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)).slice(0, 10) : []))

const rawClaim = z.object({ text: text(300), sources: indexList })
const rawClaims = (max: number) =>
  z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, max) : []))
    .pipe(z.array(rawClaim.catch({ text: '', sources: [] })))

const intOrNull = (min: number, max: number) =>
  z.unknown().transform((v) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null))

const confidence = z.enum(['low', 'medium', 'high']).catch('low')

const rawResultSchema = z.object({
  sources: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, MAX_SOURCES * 2) : []))
    .pipe(z.array(z.object({ url: z.unknown(), title: text(120) }).catch({ url: null, title: '' }))),
  web: z.object({
    url: z.unknown(),
    exists: z.boolean().catch(false),
    state: z.enum(['none', 'outdated', 'ok', 'good']).catch('none'),
    tech: optionalText(60),
    findings: rawClaims(12),
    gaps: rawClaims(10),
  }),
  company: z.object({
    summary: text(700),
    industry: optionalText(80),
    city: optionalText(80),
    ico: z.unknown(),
    legal_form: optionalText(60),
    founded_year: intOrNull(1800, new Date().getFullYear()),
    findings: rawClaims(15),
  }),
  reviews: z
    .object({
      count: intOrNull(0, 1_000_000),
      rating: z.unknown().transform((v) => (typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : null)),
      sources: indexList,
      praised: rawClaims(5),
      criticized: rawClaims(5),
    })
    .catch({ count: null, rating: null, sources: [], praised: [], criticized: [] }),
  typical_job: z
    .object({
      min_czk: intOrNull(0, 1_000_000_000),
      max_czk: intOrNull(0, 1_000_000_000),
      confidence,
      reasoning: text(400),
      sources: indexList,
    })
    .catch({ min_czk: null, max_czk: null, confidence: 'low', reasoning: '', sources: [] }),
  competitors: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 5) : []))
    .pipe(
      z.array(
        z
          .object({ name: text(120), url: z.unknown(), note: text(300), sources: indexList })
          .catch({ name: '', url: null, note: '', sources: [] }),
      ),
    ),
  signals: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 10) : []))
    .pipe(
      z.array(
        z
          .object({ text: text(300), direction: z.enum(['up', 'down', 'neutral']).catch('neutral'), sources: indexList })
          .catch({ text: '', direction: 'neutral', sources: [] }),
      ),
    ),
  warnings: rawClaims(5),
  ask_client: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 8) : []))
    .pipe(z.array(text(200)))
    .transform((list) => list.filter((q) => q !== '')),
})

export type Claim = { text: string; sources: number[] }

export type OfferResearchResult = {
  v: 1
  sources: { url: string; title: string }[]
  web: {
    url: string | null
    exists: boolean
    state: 'none' | 'outdated' | 'ok' | 'good'
    tech: string | null
    findings: Claim[]
    gaps: Claim[]
  }
  company: {
    summary: string
    industry: string | null
    city: string | null
    ico: string | null
    legal_form: string | null
    founded_year: number | null
    findings: Claim[]
  }
  reviews: { count: number | null; rating: number | null; sources: number[]; praised: Claim[]; criticized: Claim[] }
  typical_job: {
    min_czk: number | null
    max_czk: number | null
    confidence: 'low' | 'medium' | 'high'
    reasoning: string
    sources: number[]
  }
  competitors: { name: string; url: string | null; note: string; sources: number[] }[]
  signals: { text: string; direction: 'up' | 'down' | 'neutral'; sources: number[] }[]
  warnings: Claim[]
  ask_client: string[]
  /** Kolik tvrzení server zahodil, protože neměla platný zdroj. Jen pro kontrolu kvality. */
  dropped: number
}

export type NormalizeOutcome = { ok: true; result: OfferResearchResult } | { ok: false; reason: 'invalid_result' }

/**
 * Z toho, co poslal model, udělá výsledek, který smí do databáze a na obrazovku.
 *
 * - zdroje: jen http(s) adresy, každá jednou; indexy tvrzení se přečíslují,
 * - tvrzení bez platného zdroje se zahodí (B10),
 * - recenze bez zdroje nemají počet ani hodnocení,
 * - odhad zakázky bez zdroje má vždy nízkou jistotu, prohozené meze se srovnají,
 * - IČO jen 8 číslic, web firmy a konkurentů jen bezpečná adresa.
 *
 * Neplatný tvar (ne objekt, chybí `company.summary`) = `invalid_result`.
 */
export function normalizeResult(input: unknown): NormalizeOutcome {
  const parsed = rawResultSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_result' }
  const raw = parsed.data
  if (raw.company.summary === '') return { ok: false, reason: 'invalid_result' }

  // Zdroje: bezpečné adresy, bez duplicit. `remap[i]` = nový index, nebo -1.
  const sources: { url: string; title: string }[] = []
  const seen = new Map<string, number>()
  const remap: number[] = raw.sources.map((source) => {
    const url = safeHttpUrl(source.url)
    if (url === null) return -1
    const known = seen.get(url)
    if (known !== undefined) return known
    if (sources.length >= MAX_SOURCES) return -1
    sources.push({ url, title: source.title || new URL(url).hostname })
    seen.set(url, sources.length - 1)
    return sources.length - 1
  })

  const mapIndexes = (list: number[]): number[] => {
    const out = new Set<number>()
    for (const i of list) {
      const mapped = i >= 0 && i < remap.length ? remap[i] : -1
      if (mapped >= 0) out.add(mapped)
    }
    return [...out]
  }

  let dropped = 0
  const keepClaims = (list: { text: string; sources: number[] }[]): Claim[] => {
    const out: Claim[] = []
    for (const claim of list) {
      const mapped = mapIndexes(claim.sources)
      if (claim.text === '' || mapped.length === 0) {
        if (claim.text !== '') dropped++
        continue
      }
      out.push({ text: claim.text, sources: mapped })
    }
    return out
  }

  const reviewSources = mapIndexes(raw.reviews.sources)
  const jobSources = mapIndexes(raw.typical_job.sources)
  let { min_czk, max_czk } = raw.typical_job
  if (min_czk !== null && max_czk !== null && min_czk > max_czk) [min_czk, max_czk] = [max_czk, min_czk]

  const competitors = raw.competitors
    .map((c) => ({ name: c.name, url: safeHttpUrl(c.url), note: c.note, sources: mapIndexes(c.sources) }))
    .filter((c) => {
      const keep = c.name !== '' && c.sources.length > 0
      if (!keep && c.name !== '') dropped++
      return keep
    })

  const signals = raw.signals
    .map((s) => ({ text: s.text, direction: s.direction, sources: mapIndexes(s.sources) }))
    .filter((s) => {
      const keep = s.text !== '' && s.sources.length > 0
      if (!keep && s.text !== '') dropped++
      return keep
    })

  const ico = typeof raw.company.ico === 'string' && /^\d{8}$/.test(raw.company.ico.replace(/\s/g, '')) ? raw.company.ico.replace(/\s/g, '') : null

  const result: OfferResearchResult = {
    v: 1,
    sources,
    web: {
      url: safeHttpUrl(raw.web.url),
      exists: raw.web.exists,
      state: raw.web.exists ? raw.web.state : 'none',
      tech: raw.web.tech,
      findings: keepClaims(raw.web.findings),
      gaps: keepClaims(raw.web.gaps),
    },
    company: {
      summary: raw.company.summary,
      industry: raw.company.industry,
      city: raw.company.city,
      ico,
      legal_form: raw.company.legal_form,
      founded_year: raw.company.founded_year,
      findings: keepClaims(raw.company.findings),
    },
    reviews: {
      count: reviewSources.length > 0 ? raw.reviews.count : null,
      rating: reviewSources.length > 0 ? raw.reviews.rating : null,
      sources: reviewSources,
      praised: keepClaims(raw.reviews.praised),
      criticized: keepClaims(raw.reviews.criticized),
    },
    typical_job: {
      min_czk,
      max_czk,
      confidence: jobSources.length === 0 ? 'low' : raw.typical_job.confidence,
      reasoning: raw.typical_job.reasoning,
      sources: jobSources,
    },
    competitors,
    signals,
    warnings: keepClaims(raw.warnings),
    ask_client: raw.ask_client,
    dropped: 0,
  }
  result.dropped = dropped
  return { ok: true, result }
}

/** Uložený výsledek z databáze zpět do typu. Starý nebo poškozený záznam = null. */
export function readStoredResult(value: unknown): OfferResearchResult | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Partial<OfferResearchResult>
  if (v.v !== 1 || !Array.isArray(v.sources) || typeof v.company?.summary !== 'string') return null
  return v as OfferResearchResult
}
