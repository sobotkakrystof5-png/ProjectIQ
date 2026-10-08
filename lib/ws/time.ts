// Čas ve Workspace — vždy Europe/Prague (AGENTS.md → B3).
// Zatím jen formátování pro UI; kalendářní logika se sem zkopíruje z lib/prague-time.ts v S10.

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
