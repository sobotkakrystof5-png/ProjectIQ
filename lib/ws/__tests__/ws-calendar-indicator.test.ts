import { describe, expect, it } from 'vitest'
import { nowLinePosition, pointerDragStarted } from '../calendar-indicator'

describe('kalendář: čára „teď“ a tažení', () => {
  it('ukáže čáru jen v dnešním sloupci a v jeho časech', () => {
    const hours = { from: 8, to: 18 }
    expect(nowLinePosition({ date: '2026-10-18', minutes: 8 * 60 }, '2026-10-18', hours)).toBe(0)
    expect(nowLinePosition({ date: '2026-10-18', minutes: 13 * 60 }, '2026-10-18', hours)).toBe(50)
    expect(nowLinePosition({ date: '2026-10-17', minutes: 13 * 60 }, '2026-10-18', hours)).toBeNull()
    expect(nowLinePosition({ date: '2026-10-18', minutes: 18 * 60 }, '2026-10-18', hours)).toBeNull()
  })

  it('myš, pero i dotyk používají stejný práh pohybu', () => {
    expect(pointerDragStarted(0, 0, 5, 5)).toBe(false)
    expect(pointerDragStarted(0, 0, 8, 0)).toBe(true)
    expect(pointerDragStarted(12, 14, 12, 22)).toBe(true)
  })
})
