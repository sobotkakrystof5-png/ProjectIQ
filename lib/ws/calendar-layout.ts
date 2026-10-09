import { addDays, pragueParts } from './time'

// Rozložení týdenního kalendáře na obrazovce Dnes (a později v Kalendáři, S10).
// Čistá funkce: dostane položky s časy a vrátí, do kterého dne a kam svisle
// (v procentech) patří. Souběžné položky (víc pracovníků) se dají vedle sebe
// do „drah". Bez JS v prohlížeči — počítá se na serveru.

export type CalendarInput = { id: string; start: Date; end: Date }

export type PlacedItem<T extends CalendarInput> = {
  item: T
  /** 0 = pondělí. */
  dayIndex: number
  top: number
  height: number
  lane: number
  lanes: number
}

export const DEFAULT_HOURS = { from: 8, to: 18 }

/**
 * Rozsah hodin, které kalendář ukáže: otevírací doba (nebo 8–18), rozšířená
 * tak, aby se vešly všechny položky týdne.
 */
export function hourRange(
  items: readonly CalendarInput[],
  opening?: { from: number; to: number } | null,
): { from: number; to: number } {
  let from = opening?.from ?? DEFAULT_HOURS.from
  let to = opening?.to ?? DEFAULT_HOURS.to
  for (const it of items) {
    const s = pragueParts(it.start)
    const e = pragueParts(it.end)
    if (s.date === e.date) {
      from = Math.min(from, Math.floor(s.minutes / 60))
      to = Math.max(to, Math.ceil(e.minutes / 60))
    } else {
      // přes půlnoc: celý zbytek dne
      from = Math.min(from, Math.floor(s.minutes / 60))
      to = 24
    }
  }
  from = Math.max(0, Math.min(from, 23))
  to = Math.min(24, Math.max(to, from + 1))
  return { from, to }
}

/** Rozmístí položky do 7 dnů týdne od `weekStart` ('YYYY-MM-DD', pondělí). */
export function layoutWeek<T extends CalendarInput>(
  items: readonly T[],
  weekStart: string,
  hours: { from: number; to: number },
): PlacedItem<T>[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const span = (hours.to - hours.from) * 60
  const segments: Omit<PlacedItem<T>, 'lane' | 'lanes'>[] = []

  for (const item of items) {
    const s = pragueParts(item.start)
    const e = pragueParts(item.end)
    days.forEach((day, dayIndex) => {
      if (day < s.date || day > e.date) return
      const startMin = day === s.date ? s.minutes : 0
      const endMin = day === e.date ? e.minutes : 24 * 60
      const from = Math.max(startMin, hours.from * 60)
      const to = Math.min(endMin, hours.to * 60)
      if (to <= from) return
      segments.push({
        item,
        dayIndex,
        top: ((from - hours.from * 60) / span) * 100,
        height: ((to - from) / span) * 100,
      })
    })
  }

  // Dráhy: v každém dni seřadit podle začátku, skupiny překrývajících se
  // položek dostanou společný počet drah.
  const placed: PlacedItem<T>[] = []
  for (let d = 0; d < 7; d++) {
    const daySegs = segments
      .filter((x) => x.dayIndex === d)
      .sort((a, b) => a.top - b.top || b.height - a.height)
    let group: PlacedItem<T>[] = []
    let laneEnds: number[] = []
    let groupEnd = -1
    const flush = () => {
      const lanes = Math.max(1, laneEnds.length)
      for (const p of group) p.lanes = lanes
      placed.push(...group)
      group = []
      laneEnds = []
    }
    for (const seg of daySegs) {
      if (group.length > 0 && seg.top >= groupEnd) flush()
      let lane = laneEnds.findIndex((end) => end <= seg.top)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = seg.top + seg.height
      groupEnd = Math.max(group.length ? groupEnd : 0, seg.top + seg.height)
      group.push({ ...seg, lane, lanes: 1 })
    }
    flush()
  }
  return placed
}
