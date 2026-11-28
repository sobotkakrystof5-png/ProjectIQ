import {
  VARIANT_KEYS,
  VARIANT_NAMES,
  jobsPerMonthFrom,
  paybackJobs,
  paybackSentence,
  priceVariants,
  roundThousands,
  typicalJobPoint,
  yearlyValue,
  type BandBasis,
  type OfferKind,
  type Position,
  type PricingRules,
  type Range,
  type VariantKey,
} from './pricing'
import type { OfferResearchResult } from './result'

/**
 * Návrh nabídky (navrhovač nabídek, N2, R-147, R-155). Čisté funkce bez
 * databáze: složení tří variant z rozboru firmy, úprava Kryštofem a to, co
 * z nabídky smí vidět klient. Čte je server i editor v prohlížeči.
 *
 * Mantinely z plánu (oddíl 2 a 5):
 * - cena se odvozuje z hodnoty pro klienta, hodiny se nepočítají ani neukazují,
 * - klient vidí jen co dostane, cenu a větu o návratnosti; obrázek o firmě je
 *   jen pro Kryštofa (`internal`, `value`),
 * - odhad hodnoty je vždy odhad s předpoklady a jistotou.
 */

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'negotiating' | 'no_reply'

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Koncept',
  sent: 'Odeslaná',
  accepted: 'Přijal',
  declined: 'Odmítl',
  negotiating: 'Smlouvá',
  no_reply: 'Bez odpovědi',
}

export type Confidence = 'low' | 'medium' | 'high'
export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: 'nízká jistota', medium: 'střední jistota', high: 'vysoká jistota' }

export type ProposalVariant = {
  key: VariantKey
  name: string
  /** Co varianta obsahuje, pro klienta. */
  includes: string[]
  /** Cena teď (Kryštof ji smí přepsat). */
  price: number
  /** Cena podle pravidel pro tytéž vstupy. Z rozdílu se učí N3. */
  proposed: number
  needsConfirmation: boolean
}

export type ProposalInputs = {
  kind: OfferKind
  /** Jedna typická zakázka klienta (Kč). Spolu s počtem zakázek určuje pásmo. */
  typicalJobCzk: number | null
  /** Odkud je: z rozboru, nebo ji zadal Kryštof (třeba z hovoru). */
  jobSource: 'research' | 'manual' | 'none'
  /** Kolik zakázek měsíčně web klientovi přinese (R-157). Pásmo = tohle × cena zakázky. */
  jobsPerMonth: number | null
  jobsSource: 'research' | 'manual' | 'none'
  /** Z čeho se pásmo vzalo (měsíční přínos, jen cena zakázky, naslepo); u e-shopu `null`. */
  bandBasis: BandBasis | null
  position: Position
  rush: boolean
  languages: number
  band: number | null
  assumedBand: boolean
  /** Ukázat klientovi větu „web se vám zaplatí z jedné zakázky". */
  showPayback: boolean
  /** Co platilo v pravidlech, když nabídka vznikla. Stránka nabídky ukazuje tohle, ne dnešní pravidla. */
  terms: { always: string[]; management: string[]; confirmAbove: number; validityDays: number }
}

export type ProposalValue = {
  typicalJob: Range | null
  jobConfidence: Confidence
  inquiries: Range | null
  winRate: number | null
  yearly: Range | null
  currentLoss: string
  assumptions: string[]
  confidence: Confidence
  askClient: string[]
}

export type ProposalInternal = {
  positionReason: string
  plusSystem: 'rezervace' | 'eshop' | 'jine'
}

export type ProposalDraft = {
  company: string
  kind: OfferKind
  band: number | null
  rulesVersion: number
  inputs: ProposalInputs
  value: ProposalValue
  variants: ProposalVariant[]
  recommended: VariantKey
  intro: string
  internal: ProposalInternal
  industry: string | null
  managementMonthly: number
  depositPercent: number
}

const PLUS_SYSTEM_LINE: Record<ProposalInternal['plusSystem'], string> = {
  rezervace: 'Online rezervace termínů, které vám chodí rovnou do kalendáře',
  eshop: 'E-shop, ve kterém zákazníci rovnou nakoupí',
  jine: 'Systém navíc podle toho, co potřebujete (rezervace termínů, kalkulačka ceny nebo e-shop)',
}

export const DEFAULT_INTRO =
  'Posílám vám nabídku nového webu ve třech variantách. Všechny obsahují texty a optimalizaci pro vyhledávače, ' +
  'liší se tím, kolik práce za vás web udělá. Doporučuji prostřední variantu: stránky služeb jsou v ní psané tak, aby vám nosily poptávky.'

const unique = (list: string[]): string[] => {
  const seen = new Set<string>()
  return list.filter((item) => {
    const key = item.trim().toLowerCase()
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function includesFor(
  rules: PricingRules,
  kind: OfferKind,
  key: VariantKey,
  extras: string[],
  plusSystem: ProposalInternal['plusSystem'],
): string[] {
  const base = (kind === 'eshop' ? rules.eshopIncludes : rules.includes)[key]
  const system = key === 'plus' && kind === 'web' ? [PLUS_SYSTEM_LINE[plusSystem]] : []
  // „Všechno z…" zůstává nahoře a položky šité na firmu hned pod ním (to je to, čím se varianta liší).
  // Základ „Všechno z…" nemá: nejdřív co je v něm vždy, pak položky šité na firmu.
  const [head, ...rest] = base
  if (head && /^Všechno z/i.test(head)) return unique([head, ...system, ...extras, ...rest]).slice(0, 10)
  return unique([...base, ...system, ...extras]).slice(0, 10)
}

/** Ceny pro vstupy podle pravidel → varianty. Zachová obsah a ruční ceny, když jsou předané. */
function priced(
  rules: PricingRules,
  inputs: ProposalInputs,
  contents: Record<VariantKey, string[]>,
  manual?: Partial<Record<VariantKey, number>>,
): { variants: ProposalVariant[]; band: number | null; assumedBand: boolean; basis: BandBasis | null } {
  const out = priceVariants(rules, {
    kind: inputs.kind,
    typicalJobCzk: inputs.typicalJobCzk,
    jobsPerMonth: inputs.jobsPerMonth,
    position: inputs.position,
    rush: inputs.rush,
    languages: inputs.languages,
  })
  const variants = VARIANT_KEYS.map((key) => {
    const price = manual?.[key] ?? out.prices[key]
    return {
      key,
      name: VARIANT_NAMES[key],
      includes: contents[key],
      price,
      proposed: out.prices[key],
      needsConfirmation: price > rules.confirmAbove,
    }
  })
  return { variants, band: out.band, assumedBand: out.assumedBand, basis: out.basis }
}

/**
 * Návrh z rozboru (verze 2 s odhadem a podkladem pro varianty; verze 1 nebo
 * žádný rozbor dá návrh jen z ceny typické zakázky a výchozích textů).
 */
export function buildProposal(
  rules: PricingRules,
  research: OfferResearchResult | null,
  company: string,
): ProposalDraft {
  const job = research?.typical_job ?? null
  const jobPoint = job ? typicalJobPoint(job.min_czk, job.max_czk) : null
  const offer = research?.offer ?? null
  const kind: OfferKind = offer?.kind ?? 'web'
  const plusSystem = offer?.plus_system ?? 'jine'
  const extras = offer?.extras ?? { zaklad: [], doporucena: [], plus: [] }
  const contents = {
    zaklad: includesFor(rules, kind, 'zaklad', extras.zaklad, plusSystem),
    doporucena: includesFor(rules, kind, 'doporucena', extras.doporucena, plusSystem),
    plus: includesFor(rules, kind, 'plus', extras.plus, plusSystem),
  }

  const typicalJob =
    job && (job.min_czk !== null || job.max_czk !== null)
      ? { min: job.min_czk ?? (job.max_czk as number), max: job.max_czk ?? (job.min_czk as number) }
      : null
  const jobConfidence: Confidence = job?.confidence ?? 'low'
  const value = research?.value ?? null
  const inquiries = value?.inquiries ?? null
  const winRate = value?.win_rate ?? null
  const jobsPerMonth = jobsPerMonthFrom(inquiries, winRate)

  const inputs: ProposalInputs = {
    kind,
    typicalJobCzk: jobPoint,
    jobSource: jobPoint === null ? 'none' : 'research',
    jobsPerMonth,
    jobsSource: jobsPerMonth === null ? 'none' : 'research',
    bandBasis: null,
    position: offer?.position ?? 'mid',
    rush: false,
    languages: 0,
    band: null,
    assumedBand: false,
    showPayback: jobConfidence !== 'low' && typicalJob !== null,
    terms: {
      always: rules.always,
      management: rules.managementIncludes,
      confirmAbove: rules.confirmAbove,
      validityDays: rules.validityDays,
    },
  }
  const { variants, band, assumedBand, basis } = priced(rules, inputs, contents)
  inputs.band = band
  inputs.assumedBand = assumedBand
  inputs.bandBasis = basis

  return {
    company,
    kind,
    band,
    rulesVersion: rules.version,
    inputs,
    value: {
      typicalJob,
      jobConfidence,
      inquiries,
      winRate,
      yearly: typicalJob ? yearlyValue(inquiries, winRate, typicalJob) : null,
      currentLoss: value?.current_loss ?? '',
      assumptions: value?.assumptions ?? [],
      confidence: value?.confidence ?? 'low',
      askClient: research?.ask_client ?? [],
    },
    variants,
    recommended: 'doporucena',
    intro: offer?.client_intro && offer.client_intro.length >= 40 ? offer.client_intro : DEFAULT_INTRO,
    internal: { positionReason: offer?.position_reason ?? '', plusSystem },
    industry: research?.company.industry ?? null,
    managementMonthly: rules.managementMonthly,
    depositPercent: rules.depositPercent,
  }
}

/* ------------------------------------------------------------------ */
/* Úprava Kryštofem                                                    */
/* ------------------------------------------------------------------ */

export type ProposalEdit = {
  inputs: Pick<ProposalInputs, 'kind' | 'typicalJobCzk' | 'jobsPerMonth' | 'position' | 'rush' | 'languages' | 'showPayback'>
  variants: { key: VariantKey; price: number; includes: string[] }[]
  recommended: VariantKey
  intro: string
}

/**
 * Nový stav návrhu po úpravě. „Podle pravidel" (`proposed`) se přepočítá pro
 * nové vstupy, cena zůstane ta, kterou Kryštof napsal. Zadaná cena zakázky
 * i počet zakázek přepíše odhad z rozboru (je z hovoru, ne z webu).
 */
export function applyProposalEdit(
  rules: PricingRules,
  current: Pick<ProposalDraft, 'inputs' | 'value'>,
  edit: ProposalEdit,
): Pick<ProposalDraft, 'inputs' | 'value' | 'variants' | 'recommended' | 'intro' | 'kind' | 'band'> {
  const before = normalizeInputs(current.inputs, current.value)
  const jobChanged = edit.inputs.typicalJobCzk !== before.typicalJobCzk
  const jobsChanged = edit.inputs.jobsPerMonth !== before.jobsPerMonth
  const inputs: ProposalInputs = {
    ...before,
    ...edit.inputs,
    languages: Math.max(0, Math.min(5, Math.floor(edit.inputs.languages))),
    jobSource: edit.inputs.typicalJobCzk === null ? 'none' : jobChanged ? 'manual' : before.jobSource,
    jobsSource: edit.inputs.jobsPerMonth === null ? 'none' : jobsChanged ? 'manual' : before.jobsSource,
  }
  const contents = Object.fromEntries(VARIANT_KEYS.map((key) => [key, [] as string[]])) as Record<VariantKey, string[]>
  const manual: Partial<Record<VariantKey, number>> = {}
  for (const v of edit.variants) {
    contents[v.key] = unique(v.includes.map((s) => s.trim())).slice(0, 10)
    manual[v.key] = v.price
  }
  const confirmAbove = current.inputs.terms.confirmAbove
  const { variants, band, assumedBand, basis } = priced({ ...rules, confirmAbove }, inputs, contents, manual)
  inputs.band = band
  inputs.assumedBand = assumedBand
  inputs.bandBasis = basis

  let value = current.value
  if (jobChanged || jobsChanged) {
    const typicalJob = jobChanged
      ? inputs.typicalJobCzk === null
        ? null
        : { min: inputs.typicalJobCzk, max: inputs.typicalJobCzk }
      : value.typicalJob
    value = {
      ...value,
      typicalJob,
      jobConfidence: jobChanged ? (typicalJob === null ? 'low' : 'high') : value.jobConfidence,
      yearly: yearlyFor(inputs, value, typicalJob),
    }
  }
  return {
    inputs,
    value,
    variants,
    recommended: edit.recommended,
    intro: edit.intro.trim(),
    kind: inputs.kind,
    band,
  }
}

/**
 * Roční přínos pro náhled. Ručně zadaný počet zakázek platí přímo (× 12 × cena
 * zakázky), jinak odhad z poptávek a podílu z rozboru.
 */
function yearlyFor(
  inputs: Pick<ProposalInputs, 'jobsPerMonth' | 'jobsSource'>,
  value: Pick<ProposalValue, 'inquiries' | 'winRate'>,
  typicalJob: Range | null,
): Range | null {
  if (typicalJob === null) return null
  if (inputs.jobsSource === 'manual' && inputs.jobsPerMonth !== null) {
    return {
      min: roundThousands(inputs.jobsPerMonth * 12 * typicalJob.min),
      max: roundThousands(inputs.jobsPerMonth * 12 * typicalJob.max),
    }
  }
  return yearlyValue(value.inquiries, value.winRate, typicalJob)
}

/**
 * Vstupy uložené před R-157 počet zakázek nemají: doplní se z odhadu poptávek
 * v `value`, takže starý koncept po úpravě dostane pásmo podle přínosu, jen
 * když ho rozbor uměl odhadnout.
 */
export function normalizeInputs(
  inputs: ProposalInputs,
  value?: Pick<ProposalValue, 'inquiries' | 'winRate'> | null,
): ProposalInputs {
  if (inputs.jobsSource !== undefined && inputs.jobsPerMonth !== undefined) return inputs
  const jobsPerMonth = value ? jobsPerMonthFrom(value.inquiries, value.winRate) : null
  return {
    ...inputs,
    jobsPerMonth,
    jobsSource: jobsPerMonth === null ? 'none' : 'research',
    bandBasis: inputs.bandBasis ?? (inputs.kind === 'eshop' ? null : inputs.assumedBand ? 'assumed' : 'job'),
  }
}

/** Ceny přesně podle pravidel pro dané vstupy (tlačítko „Přepočítat ceny" v editoru). */
export function rulePrices(
  rules: PricingRules,
  inputs: Pick<ProposalInputs, 'kind' | 'typicalJobCzk' | 'jobsPerMonth' | 'position' | 'rush' | 'languages'>,
): Record<VariantKey, number> {
  return priceVariants(rules, inputs).prices
}

/** Odchylka poslané ceny od ceny podle pravidel (0.1 = o 10 % výš). */
export function deviation(variant: Pick<ProposalVariant, 'price' | 'proposed'>): number | null {
  if (variant.proposed <= 0) return null
  return (variant.price - variant.proposed) / variant.proposed
}

export function variantOf(variants: ProposalVariant[], key: VariantKey): ProposalVariant | undefined {
  return variants.find((v) => v.key === key)
}

/** Věta o návratnosti z doporučené varianty a spodního odhadu ceny zakázky. */
export function paybackFor(
  value: Pick<ProposalValue, 'typicalJob'>,
  variants: ProposalVariant[],
  recommended: VariantKey,
): string | null {
  const v = variantOf(variants, recommended)
  if (!v || value.typicalJob === null) return null
  return paybackSentence(paybackJobs(v.price, value.typicalJob.min))
}

/* ------------------------------------------------------------------ */
/* Co vidí klient                                                      */
/* ------------------------------------------------------------------ */

export type ClientOffer = {
  company: string
  intro: string
  variants: { key: VariantKey; name: string; includes: string[]; price: number }[]
  recommended: VariantKey
  payback: string | null
  managementMonthly: number
  management: string[]
  always: string[]
  depositPercent: number
  sentAt: string | null
  validUntil: string | null
  expired: boolean
  chosen: { variant: VariantKey; management: boolean; at: string } | null
  /** Zakázka už vznikla: výběr se nemění. */
  locked: boolean
}

export type ClientOfferSource = {
  company: string
  intro: string
  variants: ProposalVariant[]
  recommended: VariantKey
  inputs: ProposalInputs
  value: ProposalValue
  management_monthly: number
  deposit_percent: number
  sent_at: string | null
  valid_until: string | null
  chosen_variant: VariantKey | null
  chosen_management: boolean | null
  chosen_at: string | null
  project_id: string | null
}

/** Z řádku nabídky jen to, co smí na stránku nabídky. Odhad hodnoty, obor ani zdůvodnění pozice ne. */
export function clientOffer(row: ClientOfferSource, now: Date = new Date()): ClientOffer {
  return {
    company: row.company,
    intro: row.intro,
    variants: row.variants.map((v) => ({ key: v.key, name: v.name, includes: v.includes, price: v.price })),
    recommended: row.recommended,
    payback: row.inputs.showPayback ? paybackFor(row.value, row.variants, row.recommended) : null,
    managementMonthly: row.management_monthly,
    management: row.inputs.terms.management,
    always: row.inputs.terms.always,
    depositPercent: row.deposit_percent,
    sentAt: row.sent_at,
    validUntil: row.valid_until,
    expired: row.valid_until !== null && Date.parse(row.valid_until) <= now.getTime(),
    chosen:
      row.chosen_variant !== null && row.chosen_at !== null
        ? { variant: row.chosen_variant, management: row.chosen_management === true, at: row.chosen_at }
        : null,
    locked: row.project_id !== null,
  }
}

/** Odstavec do e-mailu Nabídka s odkazem na stránku nabídky. Odkaz na konci řádku bez tečky. */
export function offerEmailLines(price: string, url: string): string[] {
  return [
    'děkuji za váš čas. Připravil jsem pro vás nabídku nového webu ve třech variantách.',
    price ? `Doporučuji variantu za ${price}.` : null,
    `Co která varianta obsahuje a kolik stojí, najdete tady: ${url}`,
    'Variantu si vyberete jedním kliknutím přímo v nabídce. Když budete mít otázku, stačí odpovědět na tenhle e-mail.',
  ].filter((line): line is string => line !== null)
}
