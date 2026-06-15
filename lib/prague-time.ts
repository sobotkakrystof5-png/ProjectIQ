const TZ = 'Europe/Prague'

export interface PragueDate {
  year: number
  month: number  // 1-based
  day: number
  hour: number
  minute: number
}

export function getPragueNow(): PragueDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0')
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

export function utcToPrague(utcDate: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', hour12: false,
  }).formatToParts(utcDate)
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0')
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

// Convert a Prague wall-clock slot (hour on a specific day) to a UTC ISO string.
// Works correctly across CET (UTC+1) and CEST (UTC+2) transitions.
export function pragueSlotToISO(year: number, month: number, day: number, hour: number): string {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))
  const praHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(utcGuess)
  )
  let offset = praHour - hour
  if (offset > 12) offset -= 24
  if (offset < -12) offset += 24
  return new Date(Date.UTC(year, month - 1, day, hour - offset, 0, 0)).toISOString()
}

// Return available hour slots for a given JS weekday (0=Sun, 6=Sat).
// Weekdays: 14:00–20:00 | Weekends: 08:00–22:00
export function getHourSlots(dowJsStyle: number): number[] {
  const isWeekend = dowJsStyle === 0 || dowJsStyle === 6
  return isWeekend
    ? Array.from({ length: 15 }, (_, i) => i + 8)   // 08–22
    : Array.from({ length: 7 }, (_, i) => i + 14)    // 14–20
}

// Mon=0, Tue=1, ..., Sun=6 (Czech style, for calendar grid rendering).
export function toMondayFirst(dowJs: number): number {
  return (dowJs + 6) % 7
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// 0=Mon offset for first day of given month.
export function getMonthStartOffset(year: number, month: number): number {
  return toMondayFirst(new Date(year, month - 1, 1).getDay())
}

// Is slot in the past relative to Prague now?
export function isSlotPast(year: number, month: number, day: number, hour: number, now: PragueDate): boolean {
  if (year !== now.year) return year < now.year
  if (month !== now.month) return month < now.month
  if (day !== now.day) return day < now.day
  return hour <= now.hour  // also block the current hour
}

export function isDayPast(year: number, month: number, day: number, now: PragueDate): boolean {
  if (year !== now.year) return year < now.year
  if (month !== now.month) return month < now.month
  return day < now.day
}

// Check if a UTC ISO slot corresponds to a given Prague date+hour.
export function isSlotBooked(bookedUtcIsos: string[], year: number, month: number, day: number, hour: number): boolean {
  return bookedUtcIsos.some(iso => {
    const p = utcToPrague(new Date(iso))
    return p.year === year && p.month === month && p.day === day && p.hour === hour
  })
}

export function formatPragueDateTime(utcIso: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: TZ,
    weekday: 'long',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utcIso))
}
