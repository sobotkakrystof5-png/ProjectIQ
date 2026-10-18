import { addDays, pragueParts, pragueToUtc, weekdayOf } from '../time'

// Volné časy pro objednávací stránku, widget a GET /api/public/v1/schema (S11).
// Čistá funkce bez DB — data připraví availability.ts.
//
// Termín je volný, když: začíná nejdřív `leadMin` od teď, celý se vejde do
// otevírací doby (byznysu, nebo směny pracovníka), aspoň jeden pracovník,
// který službu dělá, v tu dobu nic nemá a nepřekrývá ho blokace celého
// byznysu. Nepotvrzené poptávky čas neblokují — potvrzuje majitel.

export type Range = { opens: number; closes: number }
export type Interval = { start: Date; end: Date }

export type StaffAvailability = {
  id: string
  name?: string
  /** Vlastní směny podle dne v týdnu (1–7); null = otevírací doba byznysu. */
  shifts: Map<number, Range[]> | null
  /** Obsazené časy (termíny a blokace pracovníka). */
  busy: Interval[]
}

export type SlotInput = {
  now: Date
  fromDay: string
  days: number
  durationMin: number
  stepMin: number
  leadMin: number
  hours: Map<number, Range[]>
  /** Pracovníci, kteří službu dělají. Prázdné = byznys bez pracovníků (první termín ho založí). */
  staff: StaffAvailability[]
  /** Blokace celého byznysu (bez pracovníka). */
  businessBlocks: Interval[]
}

export type DaySlots = { date: string; times: number[] }

const MINUTE = 60_000

const overlaps = (a: Interval, start: Date, end: Date) => a.start < end && a.end > start

function rangesFor(day: string, staff: StaffAvailability | null, hours: Map<number, Range[]>): Range[] {
  const wd = weekdayOf(day)
  return (staff?.shifts ?? hours).get(wd) ?? []
}

function fits(ranges: Range[], fromMin: number, toMin: number): boolean {
  return ranges.some((r) => fromMin >= r.opens && toMin <= r.closes)
}

/**
 * Vejde se termín do otevírací doby (byznysu, nebo směny aspoň jednoho
 * pracovníka)? Bez ohledu na obsazenost a předstih — pro upozornění
 * „mimo otevírací dobu“ v kalendáři majitele.
 */
export function isWithinHours(input: Pick<SlotInput, 'durationMin' | 'hours' | 'staff'>, start: Date): boolean {
  const p = pragueParts(start)
  const endMin = p.minutes + input.durationMin
  if (endMin > 24 * 60) return false
  const candidates: (StaffAvailability | null)[] = input.staff.length ? input.staff : [null]
  return candidates.some((s) => fits(rangesFor(p.date, s, input.hours), p.minutes, endMin))
}

/** Je čas `start` volný? (Stejná pravidla jako výpis, pro kontrolu při odeslání.) */
export function isSlotFree(input: Omit<SlotInput, 'fromDay' | 'days' | 'stepMin'>, start: Date): boolean {
  const end = new Date(start.getTime() + input.durationMin * MINUTE)
  if (start.getTime() < input.now.getTime() + input.leadMin * MINUTE) return false
  const p = pragueParts(start)
  const endMin = p.minutes + input.durationMin
  if (endMin > 24 * 60) return false
  if (input.businessBlocks.some((b) => overlaps(b, start, end))) return false
  const candidates: (StaffAvailability | null)[] = input.staff.length ? input.staff : [null]
  return candidates.some(
    (s) => fits(rangesFor(p.date, s, input.hours), p.minutes, endMin) && !(s?.busy ?? []).some((b) => overlaps(b, start, end)),
  )
}

/** Je čas volný pro konkrétního pracovníka? Neznámý nebo nezpůsobilý pracovník = ne. */
export function isSlotFreeForStaff(
  input: Omit<SlotInput, 'fromDay' | 'days' | 'stepMin'>,
  start: Date,
  staffId: string,
): boolean {
  const staff = input.staff.find((s) => s.id === staffId)
  return staff ? isSlotFree({ ...input, staff: [staff] }, start) : false
}

/**
 * Kdo má v čase `start` volno (pro přesun termínu z portálu, S16). Přednost má
 * `prefer` (dosavadní pracovník). `null` = nikdo; byznys bez pracovníků vrací
 * prázdný řetězec (pracovníka založí ensureStaff).
 */
export function freeStaffAt(input: Omit<SlotInput, 'fromDay' | 'days' | 'stepMin'>, start: Date, prefer: string | null = null): string | null {
  if (!isSlotFree(input, start)) return null
  if (!input.staff.length) return ''
  const end = new Date(start.getTime() + input.durationMin * MINUTE)
  const p = pragueParts(start)
  const endMin = p.minutes + input.durationMin
  const free = input.staff.filter(
    (s) => fits(rangesFor(p.date, s, input.hours), p.minutes, endMin) && !s.busy.some((b) => overlaps(b, start, end)),
  )
  return (free.find((s) => s.id === prefer) ?? free[0])?.id ?? null
}

/** Volné časy po dnech (jen dny, kde něco je). Časy jako minuty dne v Praze. */
export function computeSlots(input: SlotInput): DaySlots[] {
  const out: DaySlots[] = []
  const candidates: (StaffAvailability | null)[] = input.staff.length ? input.staff : [null]
  for (let i = 0; i < input.days; i++) {
    const day = addDays(input.fromDay, i)
    const union = new Set<number>()
    for (const s of candidates) for (const r of rangesFor(day, s, input.hours)) {
      for (let m = r.opens; m + input.durationMin <= r.closes; m += input.stepMin) union.add(m)
    }
    const times = Array.from(union)
      .sort((a, b) => a - b)
      .filter((m) => {
        const start = pragueToUtc(day, m)
        // Přechod času: 2:30 v den změny neexistuje / je dvakrát — bereme jen sedící.
        if (pragueParts(start).minutes !== m) return false
        return isSlotFree(input, start)
      })
    if (times.length) out.push({ date: day, times })
  }
  return out
}

/** Hodiny z řádků ws.opening_hours ('09:00:00' → 540). */
export function toRange(opens: string, closes: string): Range {
  const min = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  return { opens: min(opens), closes: min(closes) }
}
