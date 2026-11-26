import { addIsoDays, isoWeekday, pragueWallClockToISO } from '@/lib/prague-time'

/**
 * ZakazIQ Voice (R-148): statistiky diktování — čisté výpočty bez databáze
 * (plán, oddíl 8). Admin `/dashboard/voice`, karta na Dnes i `GET /stats` pro
 * okno na Macu počítají tytéž čísla odtud, takže se nikde neliší.
 *
 * Den je vždy pražský kalendářní den 'YYYY-MM-DD'. Aritmetika nad dny je čistě
 * kalendářní (`addIsoDays`), takže série ani heatmapa nezávisí na změně času.
 */

/** Stavy, jejichž slova se počítají: učesaný text, vrácený přepis, zkratka. */
export const COUNTED_STATUSES = ['ok', 'raw', 'snippet'] as const

/** Rychlost se počítá jen z diktátů s aspoň tolika řečí (kratší by číslo rozhodily). */
export const WPM_MIN_SPEECH_MS = 2000

export interface DayRow {
  /** Pražský den 'YYYY-MM-DD'. */
  day: string
  /** Slova u stavů ok, raw, snippet. */
  words: number
  /** Čas řeči v ms (bez ticha; chybí-li, délka nahrávky). */
  ms: number
  /** Slova a čas jen z diktátů s řečí ≥ 2 s — z nich je rychlost. */
  wpmWords: number
  wpmMs: number
  /** Diktáty se slovy > 0. */
  dictations: number
  /** Opravy systémem: náhrady ze slovníku + slova změněná čištěním. */
  fixes: number
  /** Útrata v USD za všechny diktáty dne (i chybové a zahozené). */
  costUsd: number
}

export const emptyDay = (day: string): DayRow => ({
  day,
  words: 0,
  ms: 0,
  wpmWords: 0,
  wpmMs: 0,
  dictations: 0,
  fixes: 0,
  costUsd: 0,
})

/** Okamžik pražské půlnoci daného dne jako ISO — pro podmínky `started_at >= …` (R-093). */
export function pragueDayStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return pragueWallClockToISO(y, m, d, 0, 0)
}

/** Pondělí týdne, do kterého den patří. */
export const mondayOf = (day: string): string => addIsoDays(day, -((isoWeekday(day) + 6) % 7))

/** Řada dnů od `from` do `to` včetně, chybějící dny s nulou. */
export function fillDays(rows: DayRow[], from: string, to: string): DayRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const out: DayRow[] = []
  for (let d = from; d <= to; d = addIsoDays(d, 1)) out.push(byDay.get(d) ?? emptyDay(d))
  return out
}

export function sumDays(rows: DayRow[]): DayRow {
  return rows.reduce<DayRow>(
    (acc, r) => ({
      day: acc.day,
      words: acc.words + r.words,
      ms: acc.ms + r.ms,
      wpmWords: acc.wpmWords + r.wpmWords,
      wpmMs: acc.wpmMs + r.wpmMs,
      dictations: acc.dictations + r.dictations,
      fixes: acc.fixes + r.fixes,
      costUsd: acc.costUsd + r.costUsd,
    }),
    emptyDay(rows[0]?.day ?? ''),
  )
}

/**
 * Série: po sobě jdoucí dny s aspoň jedním slovem. Aktuální končí dneškem,
 * nebo včerejškem, když se dnes ještě nediktovalo (den neskončil). Nejdelší
 * přes celou historii.
 */
export function streaks(activeDays: string[], today: string): { current: number; longest: number } {
  const days = [...new Set(activeDays)].filter((d) => d <= today).sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const d of days) {
    run = prev !== null && addIsoDays(prev, 1) === d ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  const set = new Set(days)
  let current = 0
  let cursor = set.has(today) ? today : addIsoDays(today, -1)
  while (set.has(cursor)) {
    current++
    cursor = addIsoDays(cursor, -1)
  }
  return { current, longest }
}

/** Slova za minutu řeči. Bez řeči `null` — raději nic než nesmysl. */
export function wpm(words: number, ms: number): number | null {
  if (!(ms > 0) || !(words > 0)) return null
  return Math.round(words / (ms / 60_000))
}

/**
 * Ušetřený čas v minutách: kolik by trvalo slova napsat (rychlostí psaní)
 * minus kolik trvalo je říct. Nikdy záporný.
 */
export function savedMinutes(words: number, ms: number, typingWpm: number): number {
  if (!(words > 0) || !(typingWpm > 0)) return 0
  return Math.max(0, Math.round(words / typingWpm - Math.max(0, ms) / 60_000))
}

/** Pásmo heatmapy jako ve Wispr Flow: 0 · 1–249 · 250–499 · 500–749 · 750+. */
export function band(words: number): 0 | 1 | 2 | 3 | 4 {
  if (!(words > 0)) return 0
  if (words < 250) return 1
  if (words < 500) return 2
  if (words < 750) return 3
  return 4
}

export const HEATMAP_WEEKS = 26

export interface HeatWeek {
  /** Pondělí týdne. */
  weekStart: string
  /** Pondělí … neděle; `null` = den v budoucnosti. */
  cells: ({ day: string; words: number; band: 0 | 1 | 2 | 3 | 4 } | null)[]
}

/** První den heatmapy: pondělí 25 týdnů před tímhle týdnem. */
export const heatmapFrom = (today: string): string => addIsoDays(mondayOf(today), -(HEATMAP_WEEKS - 1) * 7)

/** Mřížka heatmapy: sloupec = týden od pondělí, řádek = den v týdnu. */
export function heatmapWeeks(rows: DayRow[], today: string): HeatWeek[] {
  const byDay = new Map(rows.map((r) => [r.day, r.words]))
  const weeks: HeatWeek[] = []
  for (let w = 0, start = heatmapFrom(today); w < HEATMAP_WEEKS; w++, start = addIsoDays(start, 7)) {
    weeks.push({
      weekStart: start,
      cells: Array.from({ length: 7 }, (_, i) => {
        const day = addIsoDays(start, i)
        if (day > today) return null
        const words = byDay.get(day) ?? 0
        return { day, words, band: band(words) }
      }),
    })
  }
  return weeks
}

/**
 * Percentil jako `percentile_cont` v Postgresu (lineární interpolace mezi
 * sousedy). Prázdná řada `null`.
 */
export function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const pos = Math.min(1, Math.max(0, p)) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo))
}

/** Podíl v procentech na celé číslo, nebo `null`, když není z čeho počítat. */
export function sharePercent(part: number, whole: number): number | null {
  if (!(whole > 0)) return null
  return Math.round((Math.max(0, part) / whole) * 100)
}

// --- Čeština ------------------------------------------------------------------

const nf = (n: number) => n.toLocaleString('cs-CZ')

/** 1 slovo · 2 slova · 5 slov (s mezerou po tisících). */
export function formatWords(n: number): string {
  if (n === 1) return '1 slovo'
  if (n >= 2 && n <= 4) return `${n} slova`
  return `${nf(n)} slov`
}

/** Jen tvar slova „slovo" k číslu (pro velké číslo nahoře a popisek pod ním). */
export const wordsNoun = (n: number): string => (n === 1 ? 'slovo' : n >= 2 && n <= 4 ? 'slova' : 'slov')

export const formatDays = (n: number): string => (n === 1 ? '1 den' : n >= 2 && n <= 4 ? `${n} dny` : `${nf(n)} dní`)

export const formatDictations = (n: number): string =>
  n === 1 ? '1 diktát' : n >= 2 && n <= 4 ? `${n} diktáty` : `${nf(n)} diktátů`

/** 45 min · 2 h · 3 h 10 min. */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${nf(h)} h ${rest} min` : `${nf(h)} h`
}

/** 0,42 USD · 1,20 USD — poskytovatelé účtují v dolarech, na koruny se nepřevádí. */
export function formatUsd(usd: number): string {
  const digits = usd > 0 && usd < 0.01 ? 4 : 2
  return `${usd.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: digits })} USD`
}

/** 850 ms · 1,4 s */
export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} s`
}
