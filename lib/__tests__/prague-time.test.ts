import { describe, it, expect } from 'vitest'
import {
  pragueSlotToISO,
  getHourSlots,
  toMondayFirst,
  getDaysInMonth,
  isSlotPast,
  isSlotBooked,
} from '../prague-time'

describe('pragueSlotToISO', () => {
  it('converts a winter (CET, UTC+1) slot correctly', () => {
    // 15. ledna 2026, 14:00 Prague time -> 13:00 UTC
    expect(pragueSlotToISO(2026, 1, 15, 14)).toBe('2026-01-15T13:00:00.000Z')
  })

  it('converts a summer (CEST, UTC+2) slot correctly', () => {
    // 15. července 2026, 14:00 Prague time -> 12:00 UTC
    expect(pragueSlotToISO(2026, 7, 15, 14)).toBe('2026-07-15T12:00:00.000Z')
  })
})

describe('getHourSlots', () => {
  it('returns 14-20 on weekdays', () => {
    expect(getHourSlots(1)).toEqual([14, 15, 16, 17, 18, 19, 20])
  })

  it('returns 08-22 on weekends', () => {
    expect(getHourSlots(0)).toHaveLength(15)
    expect(getHourSlots(6)[0]).toBe(8)
  })
})

describe('toMondayFirst', () => {
  it('maps JS Sunday=0 to Czech Sunday=6', () => {
    expect(toMondayFirst(0)).toBe(6)
  })

  it('maps JS Monday=1 to Czech Monday=0', () => {
    expect(toMondayFirst(1)).toBe(0)
  })
})

describe('getDaysInMonth', () => {
  it('handles a leap February', () => {
    expect(getDaysInMonth(2028, 2)).toBe(29)
  })

  it('handles a non-leap February', () => {
    expect(getDaysInMonth(2026, 2)).toBe(28)
  })
})

describe('isSlotPast', () => {
  const now = { year: 2026, month: 6, day: 16, hour: 10, minute: 0 }

  it('treats the current hour as past (blocks same-hour booking)', () => {
    expect(isSlotPast(2026, 6, 16, 10, now)).toBe(true)
  })

  it('treats a future hour as not past', () => {
    expect(isSlotPast(2026, 6, 16, 11, now)).toBe(false)
  })

  it('treats a future day as not past', () => {
    expect(isSlotPast(2026, 6, 17, 8, now)).toBe(false)
  })
})

describe('isSlotBooked', () => {
  it('matches a booked UTC ISO against its Prague wall-clock slot', () => {
    const bookedUtcIsos = [pragueSlotToISO(2026, 6, 16, 15)]
    expect(isSlotBooked(bookedUtcIsos, 2026, 6, 16, 15)).toBe(true)
    expect(isSlotBooked(bookedUtcIsos, 2026, 6, 16, 16)).toBe(false)
  })
})
