import type { DaySlots } from './intake/slots'
import type { SlotAdvice } from './slot-advice'
import { formatMinutes, formatRelativeDay, formatTimeRange } from './time'

// Návrhy volných časů pro kalendář (RD05). Čisté funkce bez DB: volné časy po
// dnech spočítá computeSlots (jedna logika s objednávkou), tady se z nich jen
// vybírají ty nejbližší a ze zadání se skládá odkaz.

export type SuggestedSlot = { day: string; minutes: number }

/**
 * Z volných časů po dnech vybere `count` nejbližších k `target` (před i po),
 * seřazených chronologicky. `exclude` je čas, který se nenabízí (chtěný
 * termín, když je sám volný — ten už má hlavní tlačítko).
 */
export function pickNearestSlots(
  days: readonly DaySlots[],
  target: Date,
  count: number,
  toUtc: (day: string, minutes: number) => Date,
  exclude: Date | null = null,
): SuggestedSlot[] {
  const all: { slot: SuggestedSlot; at: number; distance: number }[] = []
  for (const d of days) {
    for (const minutes of d.times) {
      const at = toUtc(d.date, minutes).getTime()
      if (exclude && at === exclude.getTime()) continue
      all.push({ slot: { day: d.date, minutes }, at, distance: Math.abs(at - target.getTime()) })
    }
  }
  return all
    .sort((a, b) => a.distance - b.distance || a.at - b.at)
    .slice(0, Math.max(0, count))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.slot)
}

/** Rada k času v podobě, která projde přes hranici server → prohlížeč (bez Date). */
export type AdviceDto = {
  /** `none` = čas nebyl zadaný, `free` = volno, `conflict` = koliduje. */
  state: 'none' | 'free' | 'conflict'
  /** Kdo termín vezme (jen když je pracovníků víc a vybral se volný). */
  staffName: string | null
  /** S čím koliduje: „Tereza, 9:00–10:00“. */
  conflict: string | null
  outsideHours: boolean
  hoursSet: boolean
  suggestions: { day: string; minutes: number; label: string }[]
}

export function toAdviceDto(advice: SlotAdvice, today: string): AdviceDto {
  const { check } = advice
  return {
    state: !check ? 'none' : check.free ? 'free' : 'conflict',
    staffName: check?.free ? check.staffName : null,
    conflict: check && !check.free ? `${check.conflict.title}, ${formatTimeRange(check.conflict.start, check.conflict.end)}` : null,
    outsideHours: advice.outsideHours,
    hoursSet: advice.hoursSet,
    suggestions: advice.suggestions.map((s) => ({
      ...s,
      label: `${formatRelativeDay(s.day, today)} ${formatMinutes(s.minutes)}`,
    })),
  }
}
