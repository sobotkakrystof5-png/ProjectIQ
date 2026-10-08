import { describe, expect, it } from 'vitest'
import { formatMoney } from '@/lib/ws/money'
import { formatClock, formatTimeRange } from '@/lib/ws/time'
import { isPulsingTile } from '@/components/ws/brand/tile-field'

// Intl v cs-CZ odděluje tisíce i měnu nezlomitelnou mezerou — pro čitelnost testů je sjednotíme.
const plain = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatMoney', () => {
  it('celé koruny bez desetinných míst', () => {
    expect(plain(formatMoney(1249))).toBe('1 249 Kč')
    expect(plain(formatMoney(0))).toBe('0 Kč')
  })

  it('desetinná místa jen když nejsou nulová', () => {
    expect(plain(formatMoney(249.5))).toBe('249,50 Kč')
    expect(plain(formatMoney(0.1 + 0.2))).toBe('0,30 Kč')
  })

  it('haléře z DB převede na koruny', () => {
    expect(plain(formatMoney(24900, { minor: true }))).toBe('249 Kč')
    expect(plain(formatMoney(24950, { minor: true }))).toBe('249,50 Kč')
  })

  it('eura zůstanou v eurech', () => {
    expect(plain(formatMoney(120, { currency: 'EUR' }))).toBe('120 €')
  })
})

describe('čas v Europe/Prague', () => {
  it('letní čas: UTC 7:00 = 9:00', () => {
    expect(formatClock('2026-10-09T07:00:00Z')).toBe('9:00')
  })

  it('zimní čas: UTC 8:00 = 9:00', () => {
    expect(formatClock(new Date('2026-12-01T08:00:00Z'))).toBe('9:00')
  })

  it('rozsah s pomlčkou bez mezer', () => {
    expect(formatTimeRange('2026-10-09T07:00:00Z', '2026-10-09T08:30:00Z')).toBe('9:00–10:30')
  })
})

describe('pole dílků', () => {
  it('pulzuje přesně 9 dílků ze sta a vzor se opakuje po stovce', () => {
    const pulsing = Array.from({ length: 100 }, (_, i) => i).filter(isPulsingTile)
    expect(pulsing).toHaveLength(9)
    expect(pulsing.map((i) => isPulsingTile(i + 100))).toEqual(pulsing.map(() => true))
  })
})
