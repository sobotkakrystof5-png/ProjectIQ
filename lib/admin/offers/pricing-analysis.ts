import {
  VARIANT_KEYS,
  POSITION_LABEL,
  bandLabel,
  jobBandLabel,
  monthlyValue,
  paybackJobs,
  type OfferKind,
  type Position,
  type PricingRules,
  type Range,
  type VariantKey,
} from './pricing'
import type { ProposalInputs, ProposalInternal, ProposalValue, ProposalVariant } from './proposal-model'

/**
 * Rozbor ceny jen pro Kryštofa (R-160): odkud ceny tří variant jsou, kolik
 * klient zaplatí předem a za první rok se správou, jak varianty poskládat
 * a kde ustoupit, když klient smlouvá.
 *
 * Čistá funkce bez databáze a bez modelu: všechna čísla jdou z nabídky
 * a cenových pravidel, takže sedí s editorem nabídky. Pravidla vyjednávání
 * jsou z plánu (docs/admin/NABIDKY-PLAN.md, oddíl 5): za stejný rozsah stejná
 * cena, jde-li cena dolů, jde dolů i rozsah. Na stránku nabídky nic z toho nesmí.
 */

export type VariantBreakdown = {
  key: VariantKey
  name: string
  price: number
  /** Cena podle pravidel pro tytéž vstupy. */
  proposed: number
  /** Rozmezí varianty v pásmu podle pravidel (bez příplatků). */
  range: Range | null
  /** Odchylka od pravidel (0.1 = o 10 % výš), `null` bez ceny podle pravidel. */
  deviation: number | null
  deposit: number
  rest: number
  /** Cena webu a 12 měsíců správy. */
  firstYear: number
  /** Kolik zakázek klienta (spodní odhad) web zaplatí. */
  paybackJobs: number | null
  /** Rozdíl proti předchozí variantě. */
  stepUp: number | null
  /** Co varianta přidává proti předchozí (bez řádku „Všechno z…"). */
  adds: string[]
  needsConfirmation: boolean
}

export type PricingAnalysis = {
  /** Z čeho ceny vznikly, větami. */
  origin: string[]
  variants: VariantBreakdown[]
  /** Jak nabídku poskládat a podat. */
  combine: string[]
  /** Když klient smlouvá. */
  negotiate: string[]
  /** Co si ověřit, než nabídka odejde. */
  check: string[]
}

export type AnalysisSource = {
  kind: OfferKind
  band: number | null
  rulesVersion: number
  inputs: Pick<ProposalInputs, 'typicalJobCzk' | 'jobSource' | 'position' | 'rush' | 'languages' | 'assumedBand' | 'terms'> &
    // Počet zakázek a základ pásma (R-157); starší uložené nabídky je nemusí mít.
    Partial<Pick<ProposalInputs, 'jobsPerMonth' | 'jobsSource' | 'bandBasis'>>
  value: Pick<ProposalValue, 'typicalJob' | 'jobConfidence' | 'yearly' | 'confidence' | 'askClient' | 'inquiries' | 'winRate'>
  variants: Pick<ProposalVariant, 'key' | 'name' | 'price' | 'proposed' | 'includes'>[]
  recommended: VariantKey
  managementMonthly: number
  depositPercent: number
  internal: Pick<ProposalInternal, 'positionReason'> | null
}

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const percent = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`

const JOBS_PHRASE: Record<number, string> = { 1: 'z jedné zakázky', 2: 'ze dvou zakázek', 3: 'ze tří zakázek', 4: 'ze čtyř zakázek' }
const jobsPhrase = (n: number) => JOBS_PHRASE[n] ?? `z ${n.toLocaleString('cs-CZ')} zakázek`

const CONFIDENCE_WORD = { low: 'nízká jistota', medium: 'střední jistota', high: 'vysoká jistota' } as const

/** Počet zakázek ve 4. pádě: „přinese 1 zakázku / 1,5 zakázky / 4 zakázky / 10 zakázek". */
function jobsAccusative(n: number): string {
  const text = n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })
  if (!Number.isInteger(n)) return `${text} zakázky`
  if (n === 1) return '1 zakázku'
  return n >= 2 && n <= 4 ? `${text} zakázky` : `${text} zakázek`
}

/** Počet zakázek v 6. pádě: „při 1 zakázce / při 4 zakázkách". */
function jobsLocative(n: number): string {
  return n === 1 ? '1 zakázce' : `${n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} zakázkách`
}

function monthsWord(n: number): string {
  if (n === 1) return '1 měsíc'
  return n >= 2 && n <= 4 ? `${n} měsíce` : `${n} měsíců`
}

/** Řádky obsahu, které varianta přidává proti předchozí. „Všechno z…" se přeskakuje. */
function addedItems(current: string[], previous: string[] | null): string[] {
  const seen = new Set((previous ?? []).map((s) => s.trim().toLowerCase()))
  return current.filter((s) => !/^Všechno z/i.test(s.trim()) && !seen.has(s.trim().toLowerCase()))
}

/** Výčet do věty: první písmeno malé (zkratky jako SEO zůstanou), položky oddělené středníkem, protože samy mají čárky. */
function list(items: string[], max = 3): string {
  const shown = items.slice(0, max).map((s) => {
    const t = s.replace(/[.\s]+$/, '')
    return /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
  })
  const more = items.length - shown.length
  return shown.join('; ') + (more > 0 ? ` a ${more} další` : '')
}

function rangesFor(rules: PricingRules, kind: OfferKind, band: number | null) {
  if (kind === 'eshop') return rules.eshop
  if (band === null) return null
  return rules.bands[band]?.ranges ?? null
}

export function pricingAnalysis(source: AnalysisSource, rules: PricingRules): PricingAnalysis {
  const ranges = rangesFor(rules, source.kind, source.band)
  const jobMin = source.value.typicalJob?.min ?? null
  const confirmAbove = source.inputs.terms.confirmAbove
  const byKey = new Map(source.variants.map((v) => [v.key, v]))

  const variants: VariantBreakdown[] = []
  let previous: (typeof source.variants)[number] | null = null
  for (const key of VARIANT_KEYS) {
    const v = byKey.get(key)
    if (!v) continue
    const deposit = Math.round((v.price * source.depositPercent) / 100)
    variants.push({
      key,
      name: v.name,
      price: v.price,
      proposed: v.proposed,
      range: ranges ? ranges[key] : null,
      deviation: v.proposed > 0 ? (v.price - v.proposed) / v.proposed : null,
      deposit,
      rest: v.price - deposit,
      firstYear: v.price + 12 * source.managementMonthly,
      paybackJobs: paybackJobs(v.price, jobMin),
      stepUp: previous ? v.price - previous.price : null,
      adds: addedItems(v.includes, previous?.includes ?? null),
      needsConfirmation: v.price > confirmAbove,
    })
    previous = v
  }

  const rec = variants.find((v) => v.key === source.recommended) ?? variants[Math.min(1, variants.length - 1)]
  const base = variants.find((v) => v.key === 'zaklad') ?? null
  const plus = variants.find((v) => v.key === 'plus') ?? null

  /* ---------------- Odkud ceny jsou ---------------- */
  const origin: string[] = []
  const job = source.value.typicalJob
  if (source.kind === 'eshop') {
    origin.push('E-shop: ceny jsou z rozmezí pro e-shopy, cena zakázky klienta pásmo neurčuje.')
  } else if (job && source.inputs.jobSource !== 'none') {
    const from = source.inputs.jobSource === 'manual' ? 'zadali jste ji vy' : `z rozboru, ${CONFIDENCE_WORD[source.value.jobConfidence]}`
    const span = job.min === job.max ? czk(job.min) : `${czk(job.min)} až ${czk(job.max)}`
    origin.push(`Jedna zakázka klienta stojí ${span} (${from}).`)
  } else {
    origin.push('Cenu jedné zakázky klienta neznáme, proto se počítá s nejběžnějším pásmem.')
  }
  const jobs = source.inputs.jobsPerMonth ?? null
  const perMonth = source.kind === 'web' ? monthlyValue(source.inputs.typicalJobCzk, jobs) : null
  if (source.kind === 'web' && jobs !== null && perMonth !== null) {
    const from =
      source.inputs.jobsSource === 'manual'
        ? 'zadali jste ho vy'
        : source.value.inquiries && source.value.winRate !== null
          ? `z rozboru: poptávky ${source.value.inquiries.min}–${source.value.inquiries.max} měsíčně, zakázkou se stane ${Math.round(source.value.winRate * 100)} %`
          : 'z rozboru'
    origin.push(`Web klientovi přinese odhadem ${jobsAccusative(jobs)} měsíčně (${from}), tedy ${czk(perMonth)} měsíčně.`)
  }
  if (source.kind === 'web' && source.band !== null) {
    const basis = source.inputs.bandBasis ?? (source.inputs.assumedBand ? 'assumed' : perMonth !== null ? 'value' : 'job')
    const label =
      basis === 'value'
        ? `podle přínosu za měsíc: ${bandLabel(rules, source.band)}`
        : basis === 'job'
          ? `podle ceny jedné zakázky (počet zakázek chybí): ${jobBandLabel(rules, source.band)}`
          : `${bandLabel(rules, source.band)} (předpokládané)`
    origin.push(`Pásmo ${label}, pozice ${POSITION_LABEL[source.inputs.position as Position]}.`)
  } else if (source.kind === 'eshop') {
    origin.push(`Pozice ${POSITION_LABEL[source.inputs.position as Position]}.`)
  }
  const reason = source.internal?.positionReason?.trim()
  if (reason) origin.push(`Proč tahle pozice: ${reason}`)
  const surcharges: string[] = []
  if (source.inputs.rush) surcharges.push(`spěch +${rules.rushPercent} %`)
  if (source.inputs.languages > 0) surcharges.push(`${source.inputs.languages}× další jazyk po +${rules.languagePercent} %`)
  if (surcharges.length > 0) origin.push(`Příplatky ve všech variantách: ${surcharges.join(', ')}.`)
  if (source.rulesVersion !== rules.version) {
    origin.push(`Ceny vznikly podle pravidel verze ${source.rulesVersion}, teď platí verze ${rules.version}.`)
  }

  /* ---------------- Jak poskládat ---------------- */
  const combine: string[] = []
  if (base && rec && plus && rec.key === 'doporucena') {
    combine.push(
      `Pošlete všechny tři. Plus za ${czk(plus.price)} dělá z Doporučené za ${czk(rec.price)} rozumnou volbu, Základ za ${czk(base.price)} je vstup pro opatrného klienta.`,
    )
  } else if (rec) {
    combine.push(`Doporučujete variantu ${rec.name} za ${czk(rec.price)}. Ostatní dvě ukazují, co je níž a co výš.`)
  }
  if (rec && rec.stepUp !== null && rec.adds.length > 0) {
    combine.push(`${rec.name} stojí o ${czk(rec.stepUp)} víc než předchozí varianta a přidává: ${list(rec.adds)}. To je hlavní argument.`)
  }
  if (rec) {
    combine.push(
      `Se správou za ${czk(source.managementMonthly)} měsíčně zaplatí klient za první rok ${czk(rec.firstYear)} (${czk(rec.price)} web a ${czk(12 * source.managementMonthly)} správa). Správa je u Doporučené předvybraná, bez ní je web od začátku jeho.`,
    )
    combine.push(
      `Záloha ${source.depositPercent} %: ${czk(rec.deposit)} předem, ${czk(rec.rest)} po předání.`,
    )
  }
  const yearly = source.value.yearly
  if (rec && yearly && yearly.min > 0) {
    const share = rec.price / yearly.min
    combine.push(
      `Odhad: dobrý web může firmě přinést ${czk(yearly.min)} až ${czk(yearly.max)} ročně (${CONFIDENCE_WORD[source.value.confidence]}). ${rec.name} stojí ${Math.round(share * 100)} % toho, co by web podle spodního odhadu přinesl za rok.`,
    )
  }
  if (rec && perMonth !== null && perMonth > 0 && jobs !== null) {
    const months = Math.ceil(rec.price / perMonth)
    if (months <= 24) {
      combine.push(
        `Při ${jobsLocative(jobs)} měsíčně pokryjí tržby z webu cenu ${rec.name === 'Doporučená' ? 'Doporučené' : `varianty ${rec.name}`} za ${monthsWord(months)}. Jsou to tržby, ne zisk.`,
      )
    }
  }
  if (rec && rec.paybackJobs !== null) {
    combine.push(`${rec.name} se klientovi zaplatí ${jobsPhrase(rec.paybackJobs)}${rec.paybackJobs > 3 ? ', jako argument to nepoužívejte' : ''}.`)
  }
  for (const v of variants) {
    if (v.deviation !== null && Math.abs(v.deviation) >= 0.05) {
      combine.push(`${v.name} máte ${percent(v.deviation)} proti pravidlům (podle pravidel ${czk(v.proposed)}).`)
    }
  }

  /* ---------------- Když smlouvá ---------------- */
  const negotiate: string[] = ['Za stejný rozsah stejná cena. Když bude chtít níž, ubírejte rozsah, ne cenu.']
  const recIndex = rec ? variants.indexOf(rec) : -1
  const lower = recIndex > 0 ? variants[recIndex - 1] : null
  const higher = recIndex >= 0 && recIndex < variants.length - 1 ? variants[recIndex + 1] : null
  if (rec && lower) {
    negotiate.push(
      `O stupeň níž je ${lower.name} za ${czk(lower.price)} (o ${czk(rec.price - lower.price)} míň)${rec.adds.length > 0 ? `, odpadne: ${list(rec.adds)}` : ''}.`,
    )
  }
  if (higher) {
    negotiate.push(`Když chce víc, ${higher.name} přidá ${higher.adds.length > 0 ? list(higher.adds) : 'víc práce'} za ${czk(higher.price - (rec?.price ?? 0))} navíc.`)
  }
  negotiate.push('Správu může vynechat, cena webu se tím nemění.')
  negotiate.push('Nižší cenu kvůli referenci dejte jen vědomě a zaškrtněte „Cena kvůli referenci", ať se z ní navrhovač neučí.')

  /* ---------------- Co ověřit ---------------- */
  const check: string[] = []
  if (source.inputs.jobSource === 'none' || source.inputs.assumedBand) {
    check.push('Zeptejte se, kolik stojí jedna jejich zakázka, a zapište to do pole Jedna zakázka klienta. Ceny se přepočítají.')
  } else if (source.value.jobConfidence === 'low' && source.inputs.jobSource === 'research') {
    check.push('Cena zakázky klienta je jen odhad z oboru. Ověřte ji v hovoru, ať sedí pásmo.')
  }
  if (source.kind === 'web' && source.inputs.typicalJobCzk !== null) {
    if (jobs === null) {
      check.push('Zeptejte se, kolik zakázek měsíčně by jim web měl přinést, a zapište to do pole Zakázek z webu za měsíc. Pásmo se pak vybere podle přínosu.')
    } else if (source.inputs.jobsSource === 'research') {
      check.push('Počet zakázek za měsíc je odhad z rozboru a přímo hýbe cenou. Ověřte v hovoru, kolik jich zvládnou a kolik dnes chodí.')
    }
  }
  for (const v of variants) {
    if (v.needsConfirmation) check.push(`${v.name} je nad ${czk(confirmAbove)}, před odesláním ji potvrďte.`)
  }
  for (const q of source.value.askClient.slice(0, 3)) check.push(q)

  return { origin, variants, combine, negotiate, check }
}
