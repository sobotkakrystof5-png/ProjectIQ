import { z } from 'zod'

/**
 * Cenová pravidla navrhovače nabídek (R-147, N2; pravidla v docs/admin/NABIDKY-PLAN.md, oddíl 5).
 *
 * Cenu **nepočítá model**. Model z rozboru odhadne, kolik stojí jedna typická
 * zakázka klienta, kolik poptávek měsíčně mu web přinese, kolik z nich se změní
 * v zakázku, a kde v pásmu firma je (dolní / střední / horní třetina);
 * čísla spočítá tenhle soubor z pravidel, která žijí v `admin_settings.pricing_rules`
 * a Kryštof je mění v adminu. Výchozí hodnoty níž jsou tabulka z oddílu 5.3.
 *
 * Pásmo určuje **měsíční přínos webu** = zakázky z webu za měsíc × cena jedné
 * zakázky (R-157, Kryštof 2026-11-28: počet zakázek hraje velkou roli). Když
 * počet zakázek odhadnout nejde, pásmo se vezme z ceny jedné zakázky jako dřív.
 *
 * Soubor je čistý (žádná databáze, žádné `server-only`): čte ho server
 * i editor nabídky v prohlížeči, takže přepočet v okně a na serveru sedí.
 */

export const VARIANT_KEYS = ['zaklad', 'doporucena', 'plus'] as const
export type VariantKey = (typeof VARIANT_KEYS)[number]
export const VARIANT_NAMES: Record<VariantKey, string> = { zaklad: 'Základ', doporucena: 'Doporučená', plus: 'Plus' }

export type Position = 'low' | 'mid' | 'high'
export const POSITION_LABEL: Record<Position, string> = { low: 'dolní třetina', mid: 'střed', high: 'horní třetina' }

export type OfferKind = 'web' | 'eshop'

export type Range = { min: number; max: number }
export type VariantRanges = Record<VariantKey, Range>
/**
 * Pásmo podle měsíčního přínosu webu: platí pro přínos pod `upTo` Kč měsíčně.
 * Když počet zakázek chybí, platí záložní hranice `jobUpTo` pro cenu jedné zakázky.
 * Poslední pásmo je bez horní meze v obou řadách.
 */
export type PricingBand = { upTo: number | null; jobUpTo: number | null; ranges: VariantRanges }

/** Z čeho se pásmo vzalo: měsíční přínos, jen cena zakázky, nebo nic (druhé pásmo naslepo). */
export type BandBasis = 'value' | 'job' | 'assumed'

export type PricingRules = {
  version: number
  bands: PricingBand[]
  eshop: VariantRanges
  /** Žádná varianta webu pod touto cenou (Micro a Promo navrhovač nenabízí). */
  floor: number
  /** Nad touto cenou jde nabídka poslat jen s potvrzením Kryštofa. */
  confirmAbove: number
  /** Spěch (rychleji než běžný termín), v procentech. */
  rushPercent: number
  /** Každý další jazyk, v procentech. */
  languagePercent: number
  managementMonthly: number
  depositPercent: number
  /** Kolik dní nabídka platí; po nich bez odpovědi = „neodpověděl". */
  validityDays: number
  /** Co varianta obsahuje (pro klienta). Model k tomu přidá nejvýš tři položky šité na firmu. */
  includes: Record<VariantKey, string[]>
  eshopIncludes: Record<VariantKey, string[]>
  /** Co je v ceně vždy, u všech variant. */
  always: string[]
  /** Co dostane klient se správou (stránka nabídky, u ceny správy). */
  managementIncludes: string[]
}

const r = (min: number, max: number): Range => ({ min, max })

/**
 * Tabulka z oddílu 5.3 (přijata 2026-11-25, Plus a e-shop potvrzené 2026-11-28).
 * Hranice měsíčního přínosu navrhl agent 2026-11-28 (R-157), Kryštof je mění v adminu.
 */
export const DEFAULT_PRICING_RULES: PricingRules = {
  version: 1,
  bands: [
    { upTo: 20_000, jobUpTo: 10_000, ranges: { zaklad: r(10_000, 10_000), doporucena: r(12_000, 15_000), plus: r(18_000, 24_000) } },
    { upTo: 100_000, jobUpTo: 100_000, ranges: { zaklad: r(12_000, 18_000), doporucena: r(18_000, 25_000), plus: r(30_000, 40_000) } },
    { upTo: 500_000, jobUpTo: 1_000_000, ranges: { zaklad: r(18_000, 25_000), doporucena: r(25_000, 40_000), plus: r(45_000, 55_000) } },
    { upTo: null, jobUpTo: null, ranges: { zaklad: r(25_000, 30_000), doporucena: r(40_000, 50_000), plus: r(55_000, 70_000) } },
  ],
  eshop: { zaklad: r(30_000, 40_000), doporucena: r(40_000, 50_000), plus: r(50_000, 80_000) },
  floor: 10_000,
  confirmAbove: 50_000,
  rushPercent: 25,
  languagePercent: 30,
  managementMonthly: 999,
  depositPercent: 30,
  validityDays: 14,
  includes: {
    zaklad: [
      'Prezentační web s vašimi službami, referencemi a kontaktem',
      'Funguje na telefonu i na počítači',
    ],
    doporucena: [
      'Všechno ze Základu',
      'Samostatná stránka pro každou službu, psaná tak, aby přinášela poptávky',
      'Poptávkový formulář, poptávky vám chodí rovnou do e-mailu',
      'Místní SEO, aby vás lidé našli ve vašem městě a okolí',
    ],
    // Systém navíc (rezervace, e-shop) doplní návrh podle rozboru firmy (proposal-model.ts).
    plus: ['Všechno z Doporučené'],
  },
  eshopIncludes: {
    zaklad: ['E-shop s katalogem produktů a košíkem', 'Platba kartou i převodem, nastavená doprava', 'Funguje na telefonu i na počítači'],
    doporucena: [
      'Všechno ze Základu',
      'Kategorie a filtry, aby zákazník rychle našel, co hledá',
      'Stránky o vás a vašich službách psané tak, aby přinášely objednávky',
      'Místní SEO',
    ],
    plus: ['Všechno z Doporučené', 'Napojení na systém, který už používáte (sklad, účetnictví, dopravce)'],
  },
  always: [
    'Texty napíšu já, včetně optimalizace pro vyhledávače',
    'Úpravy, dokud nebudete spokojení: do spuštění a 14 dní po něm',
    'Fotky od vás nebo z fotobanky',
  ],
  managementIncludes: [
    'Web běží na mém hostingu, starám se o aktualizace, bezpečnost a zálohy',
    'Drobné úpravy průběžně a 2 články měsíčně po dohodě s vámi',
    'Bez správy je web od začátku váš, se správou se o něj starám já a kdykoli vám ho předám',
  ],
}

/* ------------------------------------------------------------------ */
/* Kontrola pravidel (uložená v DB i z editoru)                        */
/* ------------------------------------------------------------------ */

const money = z.number().int().min(0).max(1_000_000)
const rangeSchema = z
  .object({ min: money, max: money })
  .refine((v) => v.min <= v.max, 'Spodní cena musí být menší nebo stejná jako horní.')
const rangesSchema = z.object({ zaklad: rangeSchema, doporucena: rangeSchema, plus: rangeSchema })
const items = z.array(z.string().trim().min(1).max(160)).max(10)
const includesSchema = z.object({ zaklad: items, doporucena: items, plus: items })

export const pricingRulesSchema = z
  .object({
    version: z.number().int().min(1).max(1_000_000),
    bands: z
      .array(z.object({ upTo: money.nullable(), jobUpTo: money.nullable(), ranges: rangesSchema }))
      .min(1)
      .max(8),
    eshop: rangesSchema,
    floor: money,
    confirmAbove: money,
    rushPercent: z.number().int().min(0).max(200),
    languagePercent: z.number().int().min(0).max(200),
    managementMonthly: z.number().int().min(0).max(100_000),
    depositPercent: z.number().int().min(0).max(100),
    validityDays: z.number().int().min(1).max(90),
    includes: includesSchema,
    eshopIncludes: includesSchema,
    always: items,
    managementIncludes: items,
  })
  .superRefine((rules, ctx) => {
    const last = rules.bands.length - 1
    for (const key of ['upTo', 'jobUpTo'] as const) {
      rules.bands.forEach((band, i) => {
        if (i === last ? band[key] !== null : band[key] === null) {
          ctx.addIssue({ code: 'custom', message: 'Jen poslední pásmo je bez horní meze.', path: ['bands', i, key] })
        }
        const prev = i > 0 ? rules.bands[i - 1][key] : 0
        const current = band[key]
        if (current !== null && prev !== null && current <= prev) {
          ctx.addIssue({ code: 'custom', message: 'Hranice pásem musí stoupat.', path: ['bands', i, key] })
        }
      })
    }
  })

/** Uložená pravidla, nebo výchozí, když chybí nebo nesedí (starý tvar, ruční zásah). Nikdy nevyhazuje. */
export function readPricingRules(stored: unknown): PricingRules {
  const parsed = pricingRulesSchema.safeParse(stored)
  return parsed.success ? parsed.data : DEFAULT_PRICING_RULES
}

/* ------------------------------------------------------------------ */
/* Výpočet                                                             */
/* ------------------------------------------------------------------ */

export const roundThousands = (n: number): number => Math.round(n / 1000) * 1000

/** Jedno číslo z rozmezí typické zakázky: střed, nebo to, co je zadané. */
export function typicalJobPoint(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) return Math.round((min + max) / 2)
  return min ?? max ?? null
}

/** Zakázky z webu za měsíc: poptávky (střed odhadu) × podíl, který se změní v zakázku. Jedno desetinné místo. */
export function jobsPerMonthFrom(inquiries: Range | null, winRate: number | null): number | null {
  if (inquiries === null || winRate === null || winRate <= 0) return null
  // Malý přídavek proti chybě plovoucí čárky (4,5 × 0,3 = 1,3499…).
  return Math.round(((inquiries.min + inquiries.max) / 2) * winRate * 10 + 1e-9) / 10
}

/** Měsíční přínos webu v Kč = zakázky z webu za měsíc × cena jedné zakázky. `null`, když jedno chybí. */
export function monthlyValue(jobCzk: number | null, jobsPerMonth: number | null | undefined): number | null {
  if (jobCzk === null || jobsPerMonth === null || jobsPerMonth === undefined || jobsPerMonth < 0) return null
  return Math.round(jobCzk * jobsPerMonth)
}

export type BandPick = { band: number; basis: BandBasis; assumed: boolean; monthlyValue: number | null }

/**
 * Které pásmo. Přednost má měsíční přínos (zakázky za měsíc × cena zakázky);
 * bez počtu zakázek rozhodne cena jedné zakázky podle záložních hranic; bez
 * obojího druhé pásmo (nejběžnější) s příznakem.
 */
export function bandIndexFor(rules: PricingRules, jobCzk: number | null, jobsPerMonth?: number | null): BandPick {
  const last = rules.bands.length - 1
  const pick = (amount: number, key: 'upTo' | 'jobUpTo') => {
    const i = rules.bands.findIndex((b) => b[key] === null || amount < (b[key] as number))
    return i === -1 ? last : i
  }
  const value = monthlyValue(jobCzk, jobsPerMonth)
  if (value !== null) return { band: pick(value, 'upTo'), basis: 'value', assumed: false, monthlyValue: value }
  if (jobCzk !== null) return { band: pick(jobCzk, 'jobUpTo'), basis: 'job', assumed: false, monthlyValue: null }
  return { band: Math.min(1, last), basis: 'assumed', assumed: true, monthlyValue: null }
}

const fmtCzk = (n: number) => n.toLocaleString('cs-CZ')

function rangeText(rules: PricingRules, band: number, key: 'upTo' | 'jobUpTo'): string {
  const upTo = rules.bands[band]?.[key] ?? null
  const from = band > 0 ? (rules.bands[band - 1]?.[key] ?? 0) : 0
  if (band === 0 && upTo !== null) return `pod ${fmtCzk(upTo)} Kč`
  if (upTo === null) return `nad ${fmtCzk(from)} Kč`
  return `${fmtCzk(from)}–${fmtCzk(upTo)} Kč`
}

/** Pásmo jako text podle měsíčního přínosu: „přínos pod 20 000 Kč měsíčně", „přínos 20 000–100 000 Kč měsíčně"… */
export function bandLabel(rules: PricingRules, band: number): string {
  return `přínos ${rangeText(rules, band, 'upTo')} měsíčně`
}

/** Totéž pásmo podle záložní hranice ceny jedné zakázky: „zakázka pod 10 000 Kč"… */
export function jobBandLabel(rules: PricingRules, band: number): string {
  return `zakázka ${rangeText(rules, band, 'jobUpTo')}`
}

/** Pásmo pro editor nabídky: podle čeho se vybralo, a s částkou, ze které se počítalo. */
export function bandPickLabel(rules: PricingRules, pick: BandPick): string {
  if (pick.basis === 'value' && pick.monthlyValue !== null) {
    return `${bandLabel(rules, pick.band)} (odhad ${fmtCzk(pick.monthlyValue)} Kč)`
  }
  if (pick.basis === 'job') return `${jobBandLabel(rules, pick.band)} (počet zakázek chybí)`
  return `${bandLabel(rules, pick.band)} (cena zakázky chybí)`
}

/** Střed třetiny pásma: dolní 1/6, střed 1/2, horní 5/6. */
const POSITION_FACTOR: Record<Position, number> = { low: 1 / 6, mid: 1 / 2, high: 5 / 6 }

export type PriceInputs = {
  kind: OfferKind
  /** Jedna typická zakázka klienta v Kč (střed odhadu, nebo zadaná Kryštofem). */
  typicalJobCzk: number | null
  /** Kolik zakázek měsíčně web klientovi přinese (odhad rozboru, nebo zadané Kryštofem). Chybí = pásmo podle ceny zakázky. */
  jobsPerMonth?: number | null
  position: Position
  rush: boolean
  /** Kolik jazyků navíc k češtině. */
  languages: number
}

export type PricedVariants = {
  band: number | null
  assumedBand: boolean
  /** Z čeho se pásmo vzalo; u e-shopu `null` (pásma neplatí). */
  basis: BandBasis | null
  monthlyValue: number | null
  prices: Record<VariantKey, number>
  needsConfirmation: Record<VariantKey, boolean>
}

/**
 * Ceny tří variant podle pravidel. Celé tisíce, Základ < Doporučená < Plus,
 * web nikdy pod spodní hranicí. Příplatky (spěch, jazyk) se přičtou ke všem
 * třem a cena se znovu zaokrouhlí. Nad stropem příznak „potvrdit".
 */
export function priceVariants(rules: PricingRules, input: PriceInputs): PricedVariants {
  const pick = input.kind === 'eshop' ? null : bandIndexFor(rules, input.typicalJobCzk, input.jobsPerMonth)
  const band = pick?.band ?? null
  const ranges = band === null ? rules.eshop : rules.bands[band].ranges
  const f = POSITION_FACTOR[input.position]
  const languages = Math.max(0, Math.min(5, Math.floor(input.languages)))
  const multiplier = 1 + (input.rush ? rules.rushPercent / 100 : 0) + (languages * rules.languagePercent) / 100

  const prices = {} as Record<VariantKey, number>
  let previous = 0
  for (const key of VARIANT_KEYS) {
    const { min, max } = ranges[key]
    let base = roundThousands(min + (max - min) * f)
    if (input.kind === 'web') base = Math.max(base, rules.floor)
    if (base <= previous) base = previous + 1000
    previous = base
    prices[key] = roundThousands(base * multiplier)
  }
  // Příplatek se zaokrouhluje zvlášť, pořadí proto hlídá ještě jednou.
  if (prices.doporucena <= prices.zaklad) prices.doporucena = prices.zaklad + 1000
  if (prices.plus <= prices.doporucena) prices.plus = prices.doporucena + 1000

  const needsConfirmation = {} as Record<VariantKey, boolean>
  for (const key of VARIANT_KEYS) needsConfirmation[key] = prices[key] > rules.confirmAbove
  return {
    band,
    assumedBand: pick?.assumed ?? false,
    basis: pick?.basis ?? null,
    monthlyValue: pick?.monthlyValue ?? null,
    prices,
    needsConfirmation,
  }
}

/** Kolik zakázek klienta zaplatí web. `null`, když cenu zakázky neznáme. */
export function paybackJobs(price: number, jobMinCzk: number | null): number | null {
  if (jobMinCzk === null || jobMinCzk <= 0 || price <= 0) return null
  return Math.ceil(price / jobMinCzk)
}

const PAYBACK_WORD: Record<number, string> = { 1: 'z jedné zakázky', 2: 'ze dvou zakázek', 3: 'ze tří zakázek' }

/** Věta o návratnosti pro klienta (pravidla: jedna věta jako argument). Víc než tři zakázky nejsou argument. */
export function paybackSentence(jobs: number | null): string | null {
  if (jobs === null || !(jobs in PAYBACK_WORD)) return null
  return `Web se vám zaplatí ${PAYBACK_WORD[jobs]}.`
}

/** Roční hodnota, kterou může web přinést: poptávky × 12 × podíl zakázek × cena zakázky. */
export function yearlyValue(
  inquiries: Range | null,
  winRate: number | null,
  job: { min: number | null; max: number | null },
): Range | null {
  if (inquiries === null || winRate === null || job.min === null || job.max === null) return null
  return {
    min: roundThousands(inquiries.min * 12 * winRate * job.min),
    max: roundThousands(inquiries.max * 12 * winRate * job.max),
  }
}

/* ------------------------------------------------------------------ */
/* Úprava pravidel z návrhu (N3)                                        */
/* ------------------------------------------------------------------ */

export type RuleChange =
  | { type: 'raise_band'; band: number | 'eshop'; percent: number }
  | { type: 'shift_variant'; band: number | 'eshop'; variant: VariantKey; delta: number }

/** Pravidla po přijetí návrhu. Verze +1. Neznámé pásmo = beze změny (vrací null). */
export function applyRuleChange(rules: PricingRules, change: RuleChange): PricingRules | null {
  const next: PricingRules = structuredClone(rules)
  const target = change.band === 'eshop' ? next.eshop : next.bands[change.band]?.ranges
  if (!target) return null
  if (change.type === 'raise_band') {
    for (const key of VARIANT_KEYS) {
      target[key] = {
        min: roundThousands(target[key].min * (1 + change.percent / 100)),
        max: roundThousands(target[key].max * (1 + change.percent / 100)),
      }
    }
  } else {
    const range = target[change.variant]
    target[change.variant] = {
      min: Math.max(0, roundThousands(range.min + change.delta)),
      max: Math.max(0, roundThousands(range.max + change.delta)),
    }
  }
  next.version = rules.version + 1
  return pricingRulesSchema.safeParse(next).success ? next : null
}
