import { describe, expect, it } from 'vitest'
import {
  band,
  emptyDay,
  fillDays,
  formatDays,
  formatMinutes,
  formatWords,
  heatmapFrom,
  heatmapWeeks,
  mondayOf,
  percentile,
  pragueDayStart,
  savedMinutes,
  sharePercent,
  streaks,
  wpm,
} from '@/lib/admin/voice/stats'
import { pragueDayOf } from '@/lib/prague-time'

// ZakazIQ Voice (R-148, VO10): definice čísel z plánu, oddíl 8.

describe('série', () => {
  it('končí dneškem, nebo včerejškem, když se dnes ještě nediktovalo', () => {
    expect(streaks(['2026-11-24', '2026-11-25', '2026-11-26'], '2026-11-26')).toEqual({ current: 3, longest: 3 })
    expect(streaks(['2026-11-24', '2026-11-25'], '2026-11-26')).toEqual({ current: 2, longest: 2 })
    expect(streaks(['2026-11-23', '2026-11-24'], '2026-11-26')).toEqual({ current: 0, longest: 2 })
  })

  it('nejdelší série se počítá přes celou historii a duplicity nevadí', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-25', '2026-11-26', '2026-11-26']
    expect(streaks(days, '2026-11-26')).toEqual({ current: 2, longest: 4 })
  })

  it('jde přes změnu času (25. 10.) i přes konec měsíce bez díry', () => {
    expect(streaks(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26').current).toBe(3)
    expect(streaks(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30').current).toBe(3)
    expect(streaks(['2026-10-31', '2026-11-01'], '2026-11-01').current).toBe(2)
  })

  it('diktát ve 23:59 a v 0:01 pražského času jsou dva dny série', () => {
    const late = pragueDayOf('2026-11-25T22:59:00Z') // 23:59 v Praze
    const early = pragueDayOf('2026-11-25T23:01:00Z') // 0:01 v Praze
    expect([late, early]).toEqual(['2026-11-25', '2026-11-26'])
    expect(streaks([late, early], '2026-11-26').current).toBe(2)
  })

  it('den v budoucnosti sérii nenafoukne', () => {
    expect(streaks(['2026-11-26', '2026-11-27'], '2026-11-26')).toEqual({ current: 1, longest: 1 })
  })
})

describe('pražská půlnoc', () => {
  it('je okamžik 23:00 UTC v zimě a 22:00 UTC v létě, i v den změny času', () => {
    expect(pragueDayStart('2026-11-26')).toBe('2026-11-25T23:00:00.000Z')
    expect(pragueDayStart('2026-07-01')).toBe('2026-06-30T22:00:00.000Z')
    expect(pragueDayStart('2026-03-29')).toBe('2026-03-28T23:00:00.000Z')
    expect(pragueDayStart('2026-10-25')).toBe('2026-10-24T22:00:00.000Z')
  })
})

describe('rychlost a ušetřený čas', () => {
  it('rychlost bez času řeči je null, ne nekonečno', () => {
    expect(wpm(120, 0)).toBeNull()
    expect(wpm(0, 60_000)).toBeNull()
    expect(wpm(150, 60_000)).toBe(150)
  })

  it('ušetřený čas nikdy není záporný', () => {
    expect(savedMinutes(10, 10 * 60_000, 40)).toBe(0)
    expect(savedMinutes(0, 0, 40)).toBe(0)
    expect(savedMinutes(400, 2 * 60_000, 40)).toBe(8) // 10 min psaní − 2 min řeči
    expect(savedMinutes(400, 60_000, 0)).toBe(0)
  })
})

describe('heatmapa', () => {
  it('pásma jako ve Wispr Flow', () => {
    expect([0, 1, 249, 250, 499, 500, 749, 750, 5000].map(band)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('26 týdnů od pondělí, dny po dnešku prázdné', () => {
    const today = '2026-11-26' // čtvrtek
    expect(mondayOf(today)).toBe('2026-11-23')
    const weeks = heatmapWeeks([{ ...emptyDay('2026-11-26'), words: 300 }], today)
    expect(weeks).toHaveLength(26)
    expect(weeks[0].weekStart).toBe(heatmapFrom(today))
    const last = weeks[25]
    expect(last.weekStart).toBe('2026-11-23')
    expect(last.cells[3]).toEqual({ day: '2026-11-26', words: 300, band: 2 })
    expect(last.cells.slice(4)).toEqual([null, null, null])
  })

  it('doplní chybějící dny nulou', () => {
    const days = fillDays([{ ...emptyDay('2026-11-25'), words: 5 }], '2026-11-24', '2026-11-26')
    expect(days.map((d) => [d.day, d.words])).toEqual([
      ['2026-11-24', 0],
      ['2026-11-25', 5],
      ['2026-11-26', 0],
    ])
  })
})

describe('percentil a podíl', () => {
  it('p50 a p95 jako percentile_cont v Postgresu', () => {
    expect(percentile([], 0.5)).toBeNull()
    expect(percentile([1000], 0.95)).toBe(1000)
    expect(percentile([400, 100, 300, 200], 0.5)).toBe(250)
    const ms = Array.from({ length: 100 }, (_, i) => (i + 1) * 10)
    expect(percentile(ms, 0.95)).toBe(951)
  })

  it('podíl bez celku je null', () => {
    expect(sharePercent(1, 0)).toBeNull()
    expect(sharePercent(1, 3)).toBe(33)
  })
})

describe('čeština', () => {
  it('skloňuje slova, dny a minuty', () => {
    expect([1, 3, 5, 1240].map(formatWords)).toEqual(['1 slovo', '3 slova', '5 slov', '1 240 slov'])
    expect([1, 2, 5].map(formatDays)).toEqual(['1 den', '2 dny', '5 dní'])
    expect([45, 60, 190].map(formatMinutes)).toEqual(['45 min', '1 h', '3 h 10 min'])
  })
})
