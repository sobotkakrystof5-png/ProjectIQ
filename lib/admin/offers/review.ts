import { VARIANT_KEYS, VARIANT_NAMES, bandLabel, roundThousands, type PricingRules, type Range, type RuleChange, type VariantKey } from './pricing'
import { deviation, variantOf, type ProposalStatus, type ProposalVariant } from './proposal-model'

/**
 * Vyhodnocení nabídek (navrhovač nabídek, N3 a N4, R-147, R-155). Čisté
 * funkce bez databáze: z odeslaných nabídek spočítá úspěšnost, jak často
 * Kryštof poslal cenu podle pravidel (cíl z plánu: ±10 % u dvou třetin)
 * a jak web klientovi skutečně nosí poptávky proti odhadu.
 *
 * Návrhy úprav pravidel jen **navrhuje**, platí až po kliknutí (plán, oddíl 6).
 * Cenu nikdy nenavrhuje snížit: když nabídky neprocházejí, ukáže, kde to vázne
 * (pravidla: smlouvání ubírá rozsah, ne cenu).
 */

export const REVIEW_WINDOW_DAYS = 90
const DAY = 86_400_000
const MONTH = 30.44 * DAY

export type ReviewRow = {
  id: string
  company: string
  contact_id: string
  status: ProposalStatus
  sent_at: string | null
  kind: 'web' | 'eshop'
  band: number | null
  industry: string | null
  reference_price: boolean
  recommended: VariantKey
  sent_variants: ProposalVariant[] | null
  opened_at: string | null
  project_id: string | null
  final_price_czk: number | null
  inquiries: { min: number; max: number } | null
  /** Odhad, kolik web klientovi za rok přinese (z rozboru), pro podíl ceny z hodnoty. */
  yearly: Range | null
  /** Počítání poptávek z webu zakázky (KP17): od kdy a kolik za prvních 6 a 12 měsíců. */
  web: { start: string; n6: number; n12: number } | null
}

export type Diff = { pct: number; czk: number }

export type BandStats = {
  band: number | 'eshop'
  label: string
  sent: number
  resolved: number
  accepted: number
  rate: number | null
  diffs: Record<VariantKey, Diff[]>
}

/**
 * Podíl ceny z hodnoty (plán, oddíl 6): cena doporučené varianty proti
 * středu odhadu, kolik web klientovi za rok přinese. Hranice jsou výklad
 * agenta, Kryštof je může změnit.
 */
export type ShareBucket = 'under10' | 'to25' | 'to50' | 'over50'
export const SHARE_BUCKETS: ShareBucket[] = ['under10', 'to25', 'to50', 'over50']
export const SHARE_BUCKET_LABEL: Record<ShareBucket, string> = {
  under10: 'pod 10 % ročního přínosu',
  to25: '10–25 % ročního přínosu',
  to50: '25–50 % ročního přínosu',
  over50: '50 % ročního přínosu a víc',
}

export type ShareStats = {
  bucket: ShareBucket
  label: string
  sent: number
  resolved: number
  accepted: number
  rate: number | null
}

/** Podíl ceny doporučené varianty z odhadovaného ročního přínosu, nebo `null`, když odhad chybí. */
export function shareOf(row: Pick<ReviewRow, 'yearly' | 'sent_variants' | 'recommended'>): number | null {
  if (row.yearly === null || row.sent_variants === null) return null
  const mid = (row.yearly.min + row.yearly.max) / 2
  const price = variantOf(row.sent_variants, row.recommended)?.price
  if (!(mid > 0) || price === undefined || !(price > 0)) return null
  return price / mid
}

export function shareBucket(share: number): ShareBucket {
  if (share < 0.1) return 'under10'
  if (share < 0.25) return 'to25'
  if (share < 0.5) return 'to50'
  return 'over50'
}

export type ActualComparison = {
  id: string
  company: string
  contactId: string
  industry: string | null
  estimate: { min: number; max: number }
  months: number
  count: number
  perMonth: number
  verdict: 'under' | 'within' | 'over'
}

export type OfferReview = {
  windowDays: number
  sent: number
  accepted: number
  declined: number
  negotiating: number
  noReply: number
  pending: number
  opened: number
  references: number
  resolved: number
  successRate: number | null
  /** Doporučená varianta poslaná v toleranci ±10 % od pravidel. */
  withinTen: { hit: number; total: number }
  medianDeviation: number | null
  bands: BandStats[]
  /** Úspěšnost podle podílu ceny z hodnoty; jen skupiny, kam něco spadlo. */
  shares: ShareStats[]
  actual: ActualComparison[]
}

export function median(list: number[]): number | null {
  if (list.length === 0) return null
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Skutečné poptávky z webu zakázky proti odhadu. Méně než měsíc provozu = zatím nic. */
export function compareActual(row: ReviewRow, now: Date): ActualComparison | null {
  if (row.web === null || row.inquiries === null) return null
  const elapsed = (now.getTime() - Date.parse(row.web.start)) / MONTH
  if (!(elapsed >= 1)) return null
  const months = elapsed >= 12 ? 12 : elapsed >= 6 ? 6 : Math.round(elapsed * 10) / 10
  const count = elapsed >= 12 ? row.web.n12 : row.web.n6
  const perMonth = Math.round((count / months) * 10) / 10
  const verdict = perMonth < row.inquiries.min ? 'under' : perMonth > row.inquiries.max ? 'over' : 'within'
  return {
    id: row.id,
    company: row.company,
    contactId: row.contact_id,
    industry: row.industry,
    estimate: row.inquiries,
    months,
    count,
    perMonth,
    verdict,
  }
}

export function evaluateOffers(rows: ReviewRow[], rules: PricingRules, now: Date = new Date()): OfferReview {
  const from = now.getTime() - REVIEW_WINDOW_DAYS * DAY
  const inWindow = rows.filter((r) => r.sent_at !== null && Date.parse(r.sent_at) >= from && Date.parse(r.sent_at) <= now.getTime())
  // Referenční ceny se počítají zvlášť, navrhovač se z nich neučí (pravidla, oddíl 5).
  const learn = inWindow.filter((r) => !r.reference_price)

  const count = (status: ProposalStatus) => learn.filter((r) => r.status === status).length
  const accepted = count('accepted')
  const declined = count('declined')
  const noReply = count('no_reply')
  const resolved = accepted + declined + noReply

  let hit = 0
  let total = 0
  const recDeviations: number[] = []
  const groups = new Map<string, BandStats>()
  const shareGroups = new Map<ShareBucket, ShareStats>()
  for (const row of learn) {
    const share = shareOf(row)
    if (share !== null) {
      const bucket = shareBucket(share)
      const g = shareGroups.get(bucket) ?? { bucket, label: SHARE_BUCKET_LABEL[bucket], sent: 0, resolved: 0, accepted: 0, rate: null }
      g.sent++
      if (row.status === 'accepted') g.accepted++
      if (row.status === 'accepted' || row.status === 'declined' || row.status === 'no_reply') g.resolved++
      shareGroups.set(bucket, g)
    }

    const key = row.kind === 'eshop' ? 'eshop' : String(row.band ?? 'x')
    if (row.kind !== 'eshop' && row.band === null) continue
    let group = groups.get(key)
    if (!group) {
      group = {
        band: row.kind === 'eshop' ? 'eshop' : (row.band as number),
        label: row.kind === 'eshop' ? 'E-shop' : bandLabel(rules, row.band as number),
        sent: 0,
        resolved: 0,
        accepted: 0,
        rate: null,
        diffs: { zaklad: [], doporucena: [], plus: [] },
      }
      groups.set(key, group)
    }
    group.sent++
    if (row.status === 'accepted') group.accepted++
    if (row.status === 'accepted' || row.status === 'declined' || row.status === 'no_reply') group.resolved++

    if (row.sent_variants) {
      for (const v of row.sent_variants) {
        const d = deviation(v)
        if (d !== null) group.diffs[v.key].push({ pct: d, czk: v.price - v.proposed })
      }
      const rec = variantOf(row.sent_variants, row.recommended)
      const d = rec ? deviation(rec) : null
      if (d !== null) {
        total++
        recDeviations.push(d)
        if (Math.abs(d) <= 0.1 + 1e-9) hit++
      }
    }
  }
  const bands = [...groups.values()]
    .map((g) => ({ ...g, rate: g.resolved > 0 ? g.accepted / g.resolved : null }))
    .sort((a, b) => (a.band === 'eshop' ? 99 : a.band) - (b.band === 'eshop' ? 99 : b.band))

  return {
    windowDays: REVIEW_WINDOW_DAYS,
    sent: learn.length,
    accepted,
    declined,
    negotiating: count('negotiating'),
    noReply,
    pending: count('sent'),
    opened: learn.filter((r) => r.opened_at !== null).length,
    references: inWindow.length - learn.length,
    resolved,
    successRate: resolved > 0 ? accepted / resolved : null,
    withinTen: { hit, total },
    medianDeviation: median(recDeviations),
    bands,
    shares: SHARE_BUCKETS.flatMap((b) => {
      const g = shareGroups.get(b)
      return g ? [{ ...g, rate: g.resolved > 0 ? g.accepted / g.resolved : null }] : []
    }),
    actual: rows.map((r) => compareActual(r, now)).filter((x): x is ActualComparison => x !== null),
  }
}

/* ------------------------------------------------------------------ */
/* Návrhy úprav pravidel                                               */
/* ------------------------------------------------------------------ */

export type SuggestionPayload = RuleChange | { type: 'insight' }

export type SuggestionDraft = {
  fingerprint: string
  kind: 'raise_band' | 'shift_variant' | 'insight'
  payload: SuggestionPayload
  reason: string
}

const czk = (n: number) => `${Math.abs(n).toLocaleString('cs-CZ')} Kč`
const pct = (x: number) => `${Math.round(x * 100)} %`

/** Obor do otisku návrhu: jen ASCII, ať sedí na kontrolu v databázi. */
export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const bandKey = (band: number | 'eshop') => (band === 'eshop' ? 'e' : `b${band}`)

/**
 * Návrhy z vyhodnocení. Otisk je vázaný na verzi pravidel (úpravy ceny) nebo
 * na měsíc (postřehy), takže stejný návrh podruhé nevznikne.
 */
export function suggestRuleChanges(review: OfferReview, rules: PricingRules, period: string): SuggestionDraft[] {
  const out: SuggestionDraft[] = []
  const v = rules.version

  // Úspěšnost nad 60 % v pásmu: ceny jdou nahoru (plán: zdravé je 30–50 %).
  for (const band of review.bands) {
    if (band.resolved >= 4 && band.rate !== null && band.rate > 0.6) {
      out.push({
        fingerprint: `raise:v${v}:${bandKey(band.band)}`,
        kind: 'raise_band',
        payload: { type: 'raise_band', band: band.band, percent: 10 },
        reason:
          `V pásmu ${band.label} přijalo nabídku ${band.accepted} z ${band.resolved} klientů (${pct(band.rate)}). ` +
          'Zdravá úspěšnost je 30–50 %, ceny v pásmu jdou zvednout o 10 %.',
      })
    }
  }

  // Opakovaná odchylka: Kryštof posílá stejnou variantu pořád výš nebo níž, než navrhla pravidla.
  for (const band of review.bands) {
    for (const key of VARIANT_KEYS) {
      const diffs = band.diffs[key]
      if (diffs.length < 3) continue
      const up = diffs.filter((d) => d.pct > 0.1).length
      const down = diffs.filter((d) => d.pct < -0.1).length
      const dir = up * 3 >= diffs.length * 2 ? 'up' : down * 3 >= diffs.length * 2 ? 'down' : null
      const delta = roundThousands(median(diffs.map((d) => d.czk)) ?? 0)
      if (dir === null || delta === 0 || (dir === 'up') !== delta > 0) continue
      out.push({
        fingerprint: `shift:v${v}:${bandKey(band.band)}:${key}:${dir}`,
        kind: 'shift_variant',
        payload: { type: 'shift_variant', band: band.band, variant: key, delta },
        reason:
          `U ${diffs.length} nabídek v pásmu ${band.label} jste variantu ${VARIANT_NAMES[key]} poslal ` +
          `obvykle o ${czk(delta)} ${delta > 0 ? 'výš' : 'níž'}, než navrhla pravidla. Posunout její rozmezí o ${czk(delta)}?`,
      })
    }
  }

  // Úspěšnost pod 20 %: kde to vázne. Cena se nesnižuje, ubírá se rozsah.
  if (review.resolved >= 5 && review.successRate !== null && review.successRate < 0.2) {
    const openedShare = review.sent > 0 ? review.opened / review.sent : 0
    out.push({
      fingerprint: `insight:low:${period}`,
      kind: 'insight',
      payload: { type: 'insight' },
      reason:
        openedShare < 0.5
          ? `Nabídku přijalo jen ${review.accepted} z ${review.resolved} klientů a otevřelo ji ${review.opened} z ${review.sent}. ` +
            'Klienti se k nabídce často vůbec nedostanou: zkuste ji poslat hned po hovoru a den nato zavolat.'
          : `Nabídku přijalo jen ${review.accepted} z ${review.resolved} klientů, i když ji otevřelo ${review.opened} z ${review.sent}. ` +
            'Zkuste v nabídce víc ukázat, co web klientovi přinese, nebo nabídnout menší rozsah za nižší cenu.',
    })
  }

  // N4: odhad poptávek v oboru opakovaně vedle.
  const byIndustry = new Map<string, ActualComparison[]>()
  for (const a of review.actual) {
    const name = a.industry?.trim()
    if (!name) continue
    const list = byIndustry.get(name.toLowerCase()) ?? []
    list.push(a)
    byIndustry.set(name.toLowerCase(), list)
  }
  for (const [name, list] of byIndustry) {
    if (list.length < 3) continue
    const under = list.filter((a) => a.verdict === 'under').length
    const over = list.filter((a) => a.verdict === 'over').length
    const dir = under * 3 >= list.length * 2 ? 'under' : over * 3 >= list.length * 2 ? 'over' : null
    const key = slug(name)
    if (dir === null || key === '') continue
    out.push({
      fingerprint: `insight:n4:${key}:${dir}:${period}`,
      kind: 'insight',
      payload: { type: 'insight' },
      reason:
        dir === 'under'
          ? `U oboru ${list[0].industry} přinesl web méně poptávek, než odhadl rozbor (${under} z ${list.length} zakázek). Odhad hodnoty tam bývá přestřelený, posuňte firmy spíš do dolní třetiny pásma.`
          : `U oboru ${list[0].industry} přinesl web víc poptávek, než odhadl rozbor (${over} z ${list.length} zakázek). Odhad tam bývá opatrný, firmy snesou horní třetinu pásma.`,
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Období                                                              */
/* ------------------------------------------------------------------ */

const PRAGUE_YM = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' })

/** Pražský měsíc `YYYY-MM`. */
export function pragueYearMonth(at: Date): string {
  const parts = PRAGUE_YM.formatToParts(at)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}

/** Měsíc před tím, ve kterém je `at` (v Praze). */
export function previousPeriod(at: Date): string {
  const [y, m] = pragueYearMonth(at).split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1] ?? period} ${y}`
}
