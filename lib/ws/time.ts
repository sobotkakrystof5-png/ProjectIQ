// Čas ve Workspace — vždy Europe/Prague (AGENTS.md → B3).
// Kalendářní výpočty jsou zkopírované a zobecněné z lib/prague-time.ts (admin
// se nemění). Den se všude předává jako 'YYYY-MM-DD' (pražský kalendářní den),
// okamžik jako Date (UTC). Neon vrací timestamptz jako Date, nikdy na něm
// nevolej .split().

export const WS_TIME_ZONE = 'Europe/Prague'

const clockFormat = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: WS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
})

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** „9:00", „14:30" — pražský čas, bez nuly na začátku. */
export function formatClock(value: Date | string): string {
  return clockFormat.format(toDate(value))
}

/** „9:00–10:30" (pomlčka bez mezer). */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatClock(start)}–${formatClock(end)}`
}

// --- Kalendářní dny -------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Platné datum 'YYYY-MM-DD' (i kontrola, že 31. 2. neexistuje). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: WS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Pražský den a minuta dne (0–1439) pro okamžik. */
export function pragueParts(value: Date | string): { date: string; minutes: number } {
  const parts = partsFormat.formatToParts(toDate(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** Dnešek v Praze jako 'YYYY-MM-DD' (ne UTC — kolem půlnoci by byl o den vedle). */
export function pragueToday(now: Date = new Date()): string {
  return pragueParts(now).date
}

/** Přičte celé dny ke dni (čistá kalendářní aritmetika, bez časové zóny). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Den v týdnu, pondělí = 1 … neděle = 7 (stejně jako ws.opening_hours.weekday). */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return js === 0 ? 7 : js
}

/** Pondělí týdne, do kterého den patří. */
export function weekStartOf(iso: string): string {
  return addDays(iso, 1 - weekdayOf(iso))
}

/** Rozdíl ve dnech b − a. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/**
 * Pražský čas na nástěnných hodinách → okamžik (UTC). Správně i přes přechod
 * na letní/zimní čas: posun se změří v odhadnutém okamžiku a ověří znovu.
 */
export function pragueToUtc(iso: string, minutes: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minutes)
  const offsetAt = (t: number) => {
    const p = pragueParts(new Date(t))
    const [py, pm, pd] = p.date.split('-').map(Number)
    return Date.UTC(py, pm - 1, pd, 0, p.minutes) - t
  }
  let utc = wall - offsetAt(wall)
  const corrected = wall - offsetAt(utc)
  if (corrected !== utc) utc = corrected
  return new Date(utc)
}

// --- Formát dnů pro lidi ----------------------------------------------------

const noon = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

const weekdayShort = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short' })
const weekdayLong = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'long' })
const dayMonthLong = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', day: 'numeric', month: 'long' })

/** „pá 9. 10." */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${weekdayShort.format(noon(iso))} ${d}. ${m}.`
}

/** „pátek 9. října" */
export function formatDayLong(iso: string): string {
  return `${weekdayLong.format(noon(iso))} ${dayMonthLong.format(noon(iso))}`
}

/** „9:00" z minut dne. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Den vzhledem k dnešku: „dnes", „zítra", jinak „pá 9. 10.". */
export function formatRelativeDay(iso: string, today: string): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'dnes'
  if (diff === 1) return 'zítra'
  if (diff === -1) return 'včera'
  return formatDayShort(iso)
}
