import { z } from 'zod'
import { safeHttpUrl, stripControlChars } from '@/lib/security/html'
import { cleanForPrompt } from '@/lib/ai/untrusted'

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
 *
 * Verze 2 (N2, R-155) přidává `value` (odhad, kolik web klientovi přinese)
 * a `offer` (pozice v cenovém pásmu a obsah variant). **Ceny model neposílá**,
 * spočítá je server z pravidel (`pricing.ts`). Texty pro klienta jsou bez odkazů.
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
  required: ['sources', 'web', 'company', 'reviews', 'typical_job', 'competitors', 'signals', 'warnings', 'ask_client', 'value', 'offer'],
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
    value: {
      type: 'object',
      additionalProperties: false,
      description: 'Odhad, kolik dobrý web klientovi přinese. Je to odhad, ne fakt: vždy s předpoklady.',
      required: ['inquiries_per_month_min', 'inquiries_per_month_max', 'win_rate', 'current_loss', 'assumptions', 'confidence', 'sources'],
      properties: {
        inquiries_per_month_min: nullable('integer', 'Kolik poptávek měsíčně může dobrý web firmě přinést, spodní odhad.'),
        inquiries_per_month_max: nullable('integer', 'Totéž, horní odhad.'),
        win_rate: nullable('number', 'Jaký podíl poptávek se v oboru obvykle změní v zakázku, číslo 0–1 (0.3 = 30 %).'),
        current_loss: { type: 'string', description: 'Jednou až dvěma větami: o co firma dnes bez dobrého webu přichází.' },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Předpoklady odhadu, každý jednou větou (např. „v okolí hledá službu měsíčně kolem 200 lidí").',
        },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        sources: { type: 'array', items: { type: 'integer' }, description: 'Odkud předpoklady jsou, pokud nějaký zdroj mají.' },
      },
    },
    offer: {
      type: 'object',
      additionalProperties: false,
      description: 'Podklad pro tři varianty nabídky. Ceny nepiš, spočítá je server podle pravidel.',
      required: ['kind', 'position', 'position_reason', 'plus_system', 'extras', 'client_intro'],
      properties: {
        kind: {
          type: 'string',
          enum: ['web', 'eshop'],
          description: 'eshop jen když firma prodává zboží a dává smysl prodávat ho online, jinak web.',
        },
        position: {
          type: 'string',
          enum: ['low', 'mid', 'high'],
          description: 'Kde v cenovém pásmu firma je podle všeho, co o ní víš: velikost, obrat, recenze, aktivita, kolik si může dovolit.',
        },
        position_reason: { type: 'string', description: 'Jedna věta, proč tahle pozice. Jen pro Kryštofa.' },
        plus_system: {
          type: 'string',
          enum: ['rezervace', 'eshop', 'jine'],
          description: 'Jaký systém navíc dává ve variantě Plus smysl: rezervace termínů, e-shop, nebo jiné.',
        },
        extras: {
          type: 'object',
          additionalProperties: false,
          required: ['zaklad', 'doporucena', 'plus'],
          description: 'Nejvýš tři položky navíc ke každé variantě, šité na firmu (konkrétní služby, co klientům chybí). Pro klienta, bez cen a odkazů.',
          properties: {
            zaklad: { type: 'array', items: { type: 'string' } },
            doporucena: { type: 'array', items: { type: 'string' } },
            plus: { type: 'array', items: { type: 'string' } },
          },
        },
        client_intro: {
          type: 'string',
          description:
            'Odstavec pro klienta, 2–4 věty, oslovení vy: co mu web přinese. Bez údajů z rešerše (obrat, recenze, konkurence), bez cen a odkazů.',
        },
      },
    },
  },
} as const

/* ------------------------------------------------------------------ */
/* Kontrola serverem                                                   */
/* ------------------------------------------------------------------ */

/** Ořízne text na délku a zbaví ho řídicích znaků. Nikdy nevyhazuje. */
const text = (max: number) =>
  // Text složil agent z cizích webů: bez skrytých znaků a se zneškodněnými značkami,
  // protože rozbor se dál čte do dalších kroků s modelem (DECISIONS #062).
  z.unknown().transform((v) => (typeof v === 'string' ? cleanForPrompt(stripControlChars(v)).replace(/\s+/g, ' ').trim().slice(0, max) : ''))

const optionalText = (max: number) => text(max).transform((v) => (v === '' ? null : v))

const indexList = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)).slice(0, 10) : []))

/** Text, který uvidí klient: bez odkazů a adres (obsah cizích webů nesmí klientovi podstrčit odkaz). */
export function stripLinks(value: string): string {
  return value
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const clientText = (max: number) => text(max * 2).transform((v) => stripLinks(v).slice(0, max))

const extraList = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v.slice(0, 3) : []))
  .pipe(z.array(clientText(120)))
  .transform((list) => list.filter((x) => x !== ''))

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
  value: z
    .object({
      inquiries_per_month_min: intOrNull(0, 10_000),
      inquiries_per_month_max: intOrNull(0, 10_000),
      win_rate: z.unknown().transform((v) => (typeof v === 'number' && v > 0 && v <= 1 ? Math.round(v * 100) / 100 : null)),
      current_loss: clientText(400),
      assumptions: z
        .unknown()
        .transform((v) => (Array.isArray(v) ? v.slice(0, 6) : []))
        .pipe(z.array(text(200)))
        .transform((list) => list.filter((a) => a !== '')),
      confidence,
      sources: indexList,
    })
    .nullable()
    .optional()
    .catch(null),
  offer: z
    .object({
      kind: z.enum(['web', 'eshop']).catch('web'),
      position: z.enum(['low', 'mid', 'high']).catch('mid'),
      position_reason: text(300),
      plus_system: z.enum(['rezervace', 'eshop', 'jine']).catch('jine'),
      extras: z
        .object({ zaklad: extraList, doporucena: extraList, plus: extraList })
        .catch({ zaklad: [], doporucena: [], plus: [] }),
      client_intro: clientText(1200),
    })
    .nullable()
    .optional()
    .catch(null),
})

export type Claim = { text: string; sources: number[] }

export type ValueEstimate = {
  inquiries: { min: number; max: number } | null
  win_rate: number | null
  current_loss: string
  assumptions: string[]
  confidence: 'low' | 'medium' | 'high'
  sources: number[]
}

export type OfferSuggestion = {
  kind: 'web' | 'eshop'
  position: 'low' | 'mid' | 'high'
  position_reason: string
  plus_system: 'rezervace' | 'eshop' | 'jine'
  extras: { zaklad: string[]; doporucena: string[]; plus: string[] }
  client_intro: string
}

export type OfferResearchResult = {
  /** 1 = rozbor N1 (bez odhadu hodnoty), 2 = s odhadem a podkladem pro varianty (N2). */
  v: 1 | 2
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
  value: ValueEstimate | null
  offer: OfferSuggestion | null
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

  const jobConfidence = jobSources.length === 0 ? 'low' : raw.typical_job.confidence
  const value = normalizeValue(raw.value ?? null, mapIndexes, jobConfidence)
  const offer: OfferSuggestion | null = raw.offer
    ? {
        kind: raw.offer.kind,
        position: raw.offer.position,
        position_reason: raw.offer.position_reason,
        plus_system: raw.offer.plus_system,
        extras: raw.offer.extras,
        client_intro: raw.offer.client_intro,
      }
    : null

  const result: OfferResearchResult = {
    v: 2,
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
      confidence: jobConfidence,
      reasoning: raw.typical_job.reasoning,
      sources: jobSources,
    },
    competitors,
    signals,
    warnings: keepClaims(raw.warnings),
    ask_client: raw.ask_client,
    value,
    offer,
    dropped: 0,
  }
  result.dropped = dropped
  return { ok: true, result }
}

const CONFIDENCE_ORDER = { low: 0, medium: 1, high: 2 } as const

/**
 * Odhad hodnoty: rozmezí poptávek srovnané, jistota nikdy vyšší než jistota
 * ceny typické zakázky (bez ceny zakázky je roční hodnota jen hádání).
 * Bez poptávek i předpokladů = žádný odhad.
 */
function normalizeValue(
  raw: {
    inquiries_per_month_min: number | null
    inquiries_per_month_max: number | null
    win_rate: number | null
    current_loss: string
    assumptions: string[]
    confidence: 'low' | 'medium' | 'high'
    sources: number[]
  } | null,
  mapIndexes: (list: number[]) => number[],
  jobConfidence: 'low' | 'medium' | 'high',
): ValueEstimate | null {
  if (raw === null) return null
  let lo = raw.inquiries_per_month_min
  let hi = raw.inquiries_per_month_max
  if (lo === null) lo = hi
  if (hi === null) hi = lo
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo]
  const inquiries = lo !== null && hi !== null ? { min: lo, max: hi } : null
  if (inquiries === null && raw.assumptions.length === 0 && raw.current_loss === '') return null
  const confidence = CONFIDENCE_ORDER[raw.confidence] > CONFIDENCE_ORDER[jobConfidence] ? jobConfidence : raw.confidence
  return {
    inquiries,
    win_rate: raw.win_rate,
    current_loss: raw.current_loss,
    assumptions: raw.assumptions,
    confidence,
    sources: mapIndexes(raw.sources),
  }
}

/** Uložený výsledek z databáze zpět do typu. Starý nebo poškozený záznam = null. Verze 1 dostane prázdný odhad. */
export function readStoredResult(value: unknown): OfferResearchResult | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Partial<OfferResearchResult>
  if ((v.v !== 1 && v.v !== 2) || !Array.isArray(v.sources) || typeof v.company?.summary !== 'string') return null
  return { ...(v as OfferResearchResult), value: v.value ?? null, offer: v.offer ?? null }
}
