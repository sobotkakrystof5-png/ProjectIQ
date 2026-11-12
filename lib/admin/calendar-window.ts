import { addIsoDays, addIsoMonths, getDaysInMonth, isoWeekday } from '@/lib/prague-time'

/**
 * Časové okno kalendáře (AD08). Kalendář dřív posílal do prohlížeče **celou
 * historii** `calendar_events` i `consultation_slots` — s každým rokem provozu
 * víc. Teď se čte jen okno kolem zobrazeného období a zbytek se dotáhne,
 * až když se na něj někdo proklikne.
 *
 * Tenhle soubor je čistá matematika nad `'YYYY-MM-DD'`, bez databáze a bez
 * `server-only` — importuje ho server (dotazy) i prohlížeč (co je načtené).
 */

/** Pražské kalendářní dny, `to` je včetně. */
export type DayRange = { from: string; to: string }

export type CalendarView = 'month' | 'week' | 'day'

/** O kolik dní okno přesahuje za hranice zobrazeného období. */
export const WINDOW_MARGIN_DAYS = 7

/** Pondělí toho týdne, do kterého `iso` patří. */
export function startOfWeekIso(iso: string): string {
  return addIsoDays(iso, -((isoWeekday(iso) + 6) % 7))
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function endOfMonthIso(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${iso.slice(0, 7)}-${String(getDaysInMonth(y, m)).padStart(2, '0')}`
}

/** Dny, které zobrazení opravdu kreslí — bez rezervy. */
export function viewRange(view: CalendarView, anchor: string): DayRange {
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') {
    const start = startOfWeekIso(anchor)
    return { from: start, to: addIsoDays(start, 6) }
  }
  return { from: startOfMonthIso(anchor), to: endOfMonthIso(anchor) }
}

/**
 * Okno ke stažení: celý měsíc kotvy ± rezerva. Měsíc i při zobrazení týdne
 * nebo dne — jedno stažení pak pokryje i proklik na měsíc a okolní týdny,
 * takže se nechodí na server po každém kliknutí.
 */
export function windowFor(anchor: string): DayRange {
  return {
    from: addIsoDays(startOfMonthIso(anchor), -WINDOW_MARGIN_DAYS),
    to: addIsoDays(endOfMonthIso(anchor), WINDOW_MARGIN_DAYS),
  }
}

/** Okno pro měsíc před / po kotvě — pro předvídatelný krok vpřed a vzad. */
export function neighbourAnchor(anchor: string, delta: number): string {
  return startOfMonthIso(addIsoMonths(startOfMonthIso(anchor), delta))
}

/** Sloučí rozsahy, které se potkávají nebo přesahují, do co nejmenšího seznamu. */
export function mergeRanges(ranges: DayRange[]): DayRange[] {
  const sorted = [...ranges].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  const out: DayRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    // `addIsoDays(last.to, 1) >= r.from` drží i dva rozsahy, které na sebe
    // navazují den po dni — jinak by mezi nimi zůstala falešná mezera.
    if (last && addIsoDays(last.to, 1) >= r.from) {
      if (r.to > last.to) last.to = r.to
    } else {
      out.push({ ...r })
    }
  }
  return out
}

/** Je celý `need` uvnitř jednoho z načtených rozsahů? */
export function covers(loaded: DayRange[], need: DayRange): boolean {
  return loaded.some((r) => r.from <= need.from && r.to >= need.to)
}
