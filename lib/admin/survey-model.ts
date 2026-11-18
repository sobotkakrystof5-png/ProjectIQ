/**
 * Dotazník spokojenosti — čistý model bez databáze a bez Reactu (R-119).
 *
 * Od migrace 118 je dotazník postavený kolem jedné otázky „Doporučili byste
 * mě?" (0–10, NPS) a čtyř nepovinných oblastí. Staré odpovědi (šest
 * povinných hvězdiček) v databázi zůstávají a čtou se dál — proto tu žijí
 * obě sady a průměr se počítá jen z toho, co klient opravdu vyplnil.
 *
 * Volá se ze serveru i z prohlížeče (Hodnocení, Profil, formulář `/h`).
 */

export type NpsGroup = 'promoter' | 'passive' | 'detractor'

/** Nové oblasti (od migrace 118). Pořadí = pořadí ve formuláři. */
export const SURVEY_AREAS = [
  { key: 'rating_result', label: 'Výsledek', hint: 'Splnilo to, co jste chtěli?' },
  { key: 'rating_communication', label: 'Komunikace', hint: 'Věděli jste, co se zrovna děje?' },
  { key: 'rating_schedule', label: 'Termín', hint: 'Bylo hotovo, kdy jsme se domluvili?' },
  { key: 'rating_value', label: 'Cena', hint: 'Odpovídala cena výsledku?' },
] as const

export type SurveyAreaKey = (typeof SURVEY_AREAS)[number]['key']

/** Šest otázek dotazníku do migrace 118. Jen pro čtení historie. */
export const LEGACY_SURVEY_CATEGORIES = [
  { key: 'rating_cooperation', label: 'Spolupráce' },
  { key: 'rating_speed', label: 'Rychlost' },
  { key: 'rating_design', label: 'Design' },
  { key: 'rating_functionality', label: 'Funkčnost stránky' },
  { key: 'rating_reliability', label: 'Spolehlivost' },
  { key: 'rating_flexibility', label: 'Flexibilita' },
] as const

export type LegacyRatingKey = (typeof LEGACY_SURVEY_CATEGORIES)[number]['key']

export const PUBLISH_MODES = ['named', 'anonymous', 'private'] as const
export type PublishMode = (typeof PUBLISH_MODES)[number]

export type SurveyAnswer = {
  id: string
  project_id: string | null
  completed_project_id: string | null
  created_at: string
  nps: number | null
  rating_result: number | null
  rating_communication: number | null
  rating_schedule: number | null
  rating_value: number | null
  rating_cooperation: number | null
  rating_speed: number | null
  rating_design: number | null
  rating_functionality: number | null
  rating_reliability: number | null
  rating_flexibility: number | null
  improve_text: string | null
  reference_text: string | null
  publish_mode: PublishMode | null
  reviewer_role: string | null
  consent: boolean
  /** Odeslaný celý formulář. Bez něj je to zatím jen známka z e-mailu. */
  completed_at: string | null
  detractor_alerted_at: string | null
  followed_up_at: string | null
  google_review_clicked_at: string | null
}

/** Odpověď i s tím, ke které zakázce patří — pro přehled v Hodnocení. */
export type SurveyWithProject = SurveyAnswer & {
  project_title: string
  client_name: string | null
  client_email: string | null
  client_phone: string | null
}

export function npsGroup(score: number): NpsGroup {
  if (score >= 9) return 'promoter'
  if (score >= 7) return 'passive'
  return 'detractor'
}

export function isValidNps(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10
}

/**
 * NPS = podíl doporučujících (9–10) minus podíl kritiků (0–6), v procentních
 * bodech, rozsah −100 až 100. Bez jediné známky `null`, ne nula.
 */
export function npsScore(scores: readonly number[]): number | null {
  const valid = scores.filter(isValidNps)
  if (valid.length === 0) return null
  const promoters = valid.filter((s) => s >= 9).length
  const detractors = valid.filter((s) => s <= 6).length
  return Math.round(((promoters - detractors) / valid.length) * 100)
}

export function npsBreakdown(scores: readonly number[]): Record<NpsGroup, number> {
  const out: Record<NpsGroup, number> = { promoter: 0, passive: 0, detractor: 0 }
  for (const s of scores) if (isValidNps(s)) out[npsGroup(s)] += 1
  return out
}

function ratingValues(answer: SurveyAnswer, keys: readonly string[]): number[] {
  const record = answer as unknown as Record<string, unknown>
  return keys
    .map((k) => record[k])
    .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5)
}

/** Je to odpověď ve starém tvaru (šest hvězdiček bez NPS)? */
export function isLegacyAnswer(answer: SurveyAnswer): boolean {
  return answer.nps === null && answer.rating_cooperation !== null
}

/** Hvězdičky, které klient opravdu vyplnil — nové, nebo u staré odpovědi staré. */
export function answeredRatings(answer: SurveyAnswer): { key: string; label: string; value: number }[] {
  const list = isLegacyAnswer(answer) ? LEGACY_SURVEY_CATEGORIES : SURVEY_AREAS
  const record = answer as unknown as Record<string, unknown>
  return list
    .map((c) => ({ key: c.key as string, label: c.label as string, value: record[c.key] }))
    .filter((r): r is { key: string; label: string; value: number } => typeof r.value === 'number')
}

/** Průměr vyplněných hvězdiček, nebo `null`, když klient dal jen známku 0–10. */
export function ratingAverage(answer: SurveyAnswer): number | null {
  const values = ratingValues(
    answer,
    isLegacyAnswer(answer) ? LEGACY_SURVEY_CATEGORIES.map((c) => c.key) : SURVEY_AREAS.map((c) => c.key),
  )
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Průměr jedné oblasti napříč odpověďmi (jen ty, kde ji klient vyplnil). */
export function areaAverages(answers: readonly SurveyAnswer[]): { key: SurveyAreaKey; label: string; avg: number | null; count: number }[] {
  return SURVEY_AREAS.map((area) => {
    const values = answers
      .map((a) => a[area.key])
      .filter((v): v is number => typeof v === 'number')
    return {
      key: area.key,
      label: area.label,
      count: values.length,
      avg: values.length ? values.reduce((x, y) => x + y, 0) / values.length : null,
    }
  })
}

/** Klient smí být uveden jako reference (se jménem, nebo bez). */
export function consentFromMode(mode: PublishMode | null): boolean {
  return mode === 'named' || mode === 'anonymous'
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * Řádek `project_surveys` (celý, jako `to_jsonb`) → odpověď. Čte se přes
 * `to_jsonb`, aby admin fungoval i na databázi bez migrace 118 — chybějící
 * sloupec je prostě `null`.
 */
export function normalizeSurvey(row: Record<string, unknown>): SurveyAnswer {
  const mode = row.publish_mode
  const publish_mode = PUBLISH_MODES.includes(mode as PublishMode) ? (mode as PublishMode) : null
  const consent = row.consent === true || row.consent === 'true'
  const nps = num(row.nps)
  return {
    id: String(row.id),
    project_id: str(row.project_id),
    completed_project_id: str(row.completed_project_id),
    created_at: iso(row.created_at) ?? new Date(0).toISOString(),
    nps,
    rating_result: num(row.rating_result),
    rating_communication: num(row.rating_communication),
    rating_schedule: num(row.rating_schedule),
    rating_value: num(row.rating_value),
    rating_cooperation: num(row.rating_cooperation),
    rating_speed: num(row.rating_speed),
    rating_design: num(row.rating_design),
    rating_functionality: num(row.rating_functionality),
    rating_reliability: num(row.rating_reliability),
    rating_flexibility: num(row.rating_flexibility),
    improve_text: str(row.improve_text),
    reference_text: str(row.reference_text),
    // Stará odpověď se souhlasem byla vždy „se jménem".
    publish_mode: publish_mode ?? (consent ? 'named' : null),
    reviewer_role: str(row.reviewer_role),
    consent,
    // Bez migrace 118 sloupec chybí — stará odpověď byla vždy celá.
    completed_at: iso(row.completed_at) ?? (nps === null ? iso(row.created_at) : null),
    detractor_alerted_at: iso(row.detractor_alerted_at),
    followed_up_at: iso(row.followed_up_at),
    google_review_clicked_at: iso(row.google_review_clicked_at),
  }
}

export type SurveyPeriod = 'rok' | '12m' | 'vse'

export const SURVEY_PERIODS: { key: SurveyPeriod; label: string }[] = [
  { key: 'rok', label: 'Letos' },
  { key: '12m', label: '12 měsíců' },
  { key: 'vse', label: 'Vše' },
]

/** Odpovědi z období podle data vzniku (první známky). */
export function inPeriod(answers: readonly SurveyAnswer[], period: SurveyPeriod, now: Date = new Date()): SurveyAnswer[] {
  if (period === 'vse') return [...answers]
  const from =
    period === 'rok'
      ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
      : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  return answers.filter((a) => new Date(a.created_at) >= from)
}

/** Nespokojení (0–6), kterým se ještě nikdo neozval. Nejnovější nahoře. */
export function unhandledDetractors(answers: readonly SurveyAnswer[]): SurveyAnswer[] {
  return answers
    .filter((a) => a.nps !== null && a.nps <= 6 && a.followed_up_at === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
