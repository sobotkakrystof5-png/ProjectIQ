import { addIsoDays, pragueDayOf, pragueMinutesOf } from '@/lib/prague-time'

/**
 * Pravidla konzultací z volna (KP14, D-K13, R-126). Rozhodl Kryštof
 * 2026-11-20. **Stejná čísla drží migrace 123** — databáze je poslední
 * pojistka, tady jsou jen kvůli textům a tomu, co se v prohlížeči nabídne.
 */
export const CONSULTATION_DEFAULT_MINUTES = 30
/** Nejdřív za kolik hodin si klient smí konzultaci zarezervovat. */
export const CONSULTATION_LEAD_HOURS = 2
/** Do kolika hodin před začátkem ji klient smí sám přesunout nebo zrušit. */
export const CONSULTATION_CHANGE_HOURS = 24
/** Kolik dní dopředu se volné časy nabízejí. */
export const CONSULTATION_LIST_DAYS = 60
/** Délky, které jde u volna vybrat. */
export const CONSULTATION_SLOT_MINUTES = [15, 30, 45, 60, 90, 120] as const

export type FreeSlot = { startsAt: string; endsAt: string }

export type SlotDay = { day: string; slots: FreeSlot[] }

/** Smí klient konzultaci ještě sám přesunout nebo zrušit? */
export function canClientChange(startsAt: string, now: number = Date.now()): boolean {
  return new Date(startsAt).getTime() - now > CONSULTATION_CHANGE_HOURS * 3_600_000
}

export function slotMinutes(slot: FreeSlot): number {
  return Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000)
}

/** Volné časy po pražských dnech, ve stejném pořadí, v jakém přišly. */
export function groupSlotsByDay(slots: FreeSlot[]): SlotDay[] {
  const days: SlotDay[] = []
  for (const slot of slots) {
    const day = pragueDayOf(slot.startsAt)
    const last = days[days.length - 1]
    if (last?.day === day) last.slots.push(slot)
    else days.push({ day, slots: [slot] })
  }
  return days
}

/** „14:30" v pražském čase. */
export function slotTime(iso: string): string {
  const minutes = pragueMinutesOf(iso)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
const WEEKDAYS_SHORT = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']

function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** „čtvrtek 26. 11." z 'YYYY-MM-DD'; dnes a zítra slovem. */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'dnes'
  if (day === addIsoDays(today, 1)) return 'zítra'
  const [, m, d] = day.split('-').map(Number)
  return `${WEEKDAYS[weekdayOf(day)]} ${d}. ${m}.`
}

/** Krátký popisek pro výběr dne: „čt" a „26. 11.". */
export function dayChip(day: string): { weekday: string; date: string } {
  const [, m, d] = day.split('-').map(Number)
  return { weekday: WEEKDAYS_SHORT[weekdayOf(day)], date: `${d}. ${m}.` }
}

/** „čtvrtek 26. 11. v 14:30" */
export function consultationWhen(startsAt: string, today: string): string {
  return `${dayLabel(pragueDayOf(startsAt), today)} v ${slotTime(startsAt)}`
}
