import { describe, expect, it } from 'vitest'
import { buildCallScript, completedPhrase, formatClock, totalSeconds, type CallStats } from '@/lib/call-script'

const noData: CallStats = { completedProjects: 0, surveyCount: 0, avgRating: null, reference: null }

describe('opora pro hovor', () => {
  it('drží pořadí statistiky → představení → nabídka → poptávka', () => {
    expect(buildCallScript(noData).map(s => s.key)).toEqual(['statistiky', 'predstaveni', 'nabidka', 'poptavka'])
  })

  it('bez dat nevymýšlí žádná čísla', () => {
    const [stats] = buildCallScript(noData)
    expect(stats.say.join(' ')).not.toMatch(/\d/)
  })

  it('doplní skutečný počet zakázek a hodnocení česky', () => {
    const [stats] = buildCallScript({ ...noData, completedProjects: 12, surveyCount: 5, avgRating: 4.8 })
    expect(stats.say[1]).toBe('Mám za sebou 12 hotových zakázek a klienti hodnotí spolupráci průměrně 4,8 z 5.')
  })

  it('hodnocení bez zakázek začíná velkým písmenem', () => {
    const [stats] = buildCallScript({ ...noData, surveyCount: 1, avgRating: 5 })
    expect(stats.say[1]).toBe('Klienti hodnotí spolupráci průměrně 5,0 z 5.')
  })

  it('nabídka bere ceny z ceníku', () => {
    const offer = buildCallScript(noData)[2]
    expect(offer.say[0].replace(/\s/g, ' ')).toContain('Online Vizitka stojí 7 499 Kč')
  })

  it('skloňuje počet zakázek', () => {
    expect(completedPhrase(1)).toBe('1 hotovou zakázku')
    expect(completedPhrase(3)).toBe('3 hotové zakázky')
    expect(completedPhrase(5)).toBe('5 hotových zakázek')
  })

  it('celý pitch má cíl 1:30', () => {
    expect(formatClock(totalSeconds(buildCallScript(noData)))).toBe('1:30')
  })
})
