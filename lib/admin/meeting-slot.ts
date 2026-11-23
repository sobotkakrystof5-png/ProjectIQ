/**
 * Výchozí termín v oknech schůzky (R-112). Sdílí „Domluvit schůzku"
 * i „Schůzka domluvena"; běží v prohlížeči, okamžik přesně počítá server.
 */

const PRAGUE = 'Europe/Prague'

export function pragueParts(at: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: PRAGUE }).format(at)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: PRAGUE, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  return { date, time }
}

/** Čas, který si klient řekl (je-li v budoucnu), jinak zítra v 10:00. */
export function initialSlot(callbackAt: string | null, nowIso: string): { date: string; time: string } {
  if (callbackAt && Date.parse(callbackAt) > Date.parse(nowIso)) return pragueParts(new Date(callbackAt))
  return { date: pragueParts(new Date(Date.parse(nowIso) + 86_400_000)).date, time: '10:00' }
}

/** Přibližný okamžik z pražského data a času (na náhled a kontrolu tvaru). */
export function approxIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const guess = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  const shown = pragueParts(guess)
  const diffMin = (Date.parse(`${shown.date}T${shown.time}:00Z`) - guess.getTime()) / 60_000
  return new Date(guess.getTime() - diffMin * 60_000).toISOString()
}

export const MEETING_LENGTHS = [15, 30, 45, 60, 90, 120] as const
