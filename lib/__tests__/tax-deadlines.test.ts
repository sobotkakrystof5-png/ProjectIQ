import { describe, it, expect } from 'vitest'
import {
  getTaxDeadlines, getUpcomingTaxDeadlines, nextBusinessDay, czechHolidays, daysUntil,
} from '@/lib/tax-deadlines'

describe('czechHolidays', () => {
  it('zná pevné státní svátky', () => {
    const h = czechHolidays(2027)

    expect(h.has('2027-01-01')).toBe(true)
    expect(h.has('2027-05-01')).toBe(true)
    expect(h.has('2027-07-05')).toBe(true)
    expect(h.has('2027-12-24')).toBe(true)
    expect(h.has('2027-06-15')).toBe(false)
  })

  it('dopočítá pohyblivé Velikonoce', () => {
    // Velikonoční neděle 2027 = 28. 3. → Velký pátek 26. 3., pondělí 29. 3.
    const h = czechHolidays(2027)
    expect(h.has('2027-03-26')).toBe(true)
    expect(h.has('2027-03-29')).toBe(true)

    // 2024 = 31. 3. → pátek 29. 3., pondělí 1. 4.
    const h2024 = czechHolidays(2024)
    expect(h2024.has('2024-03-29')).toBe(true)
    expect(h2024.has('2024-04-01')).toBe(true)
  })
})

describe('nextBusinessDay', () => {
  it('pracovní den nechá být', () => {
    expect(nextBusinessDay('2027-04-01')).toBe('2027-04-01') // čtvrtek
  })

  it('sobotu a neděli posune na pondělí', () => {
    expect(nextBusinessDay('2026-05-02')).toBe('2026-05-04') // so → po
    expect(nextBusinessDay('2026-05-03')).toBe('2026-05-04') // ne → po
  })

  it('přeskočí svátek, i když padne na všední den', () => {
    // 1. 5. 2026 je pátek a zároveň Svátek práce → až pondělí 4. 5.
    expect(nextBusinessDay('2026-05-01')).toBe('2026-05-04')
  })

  it('přeskočí víkend navazující na svátek', () => {
    // 1. 5. 2027 je sobota (svátek), 2. 5. neděle → pondělí 3. 5.
    expect(nextBusinessDay('2027-05-01')).toBe('2027-05-03')
  })

  it('zvládne posun přes konec roku, kde se mění sada svátků', () => {
    // 2027-12-31 je pátek → sám o sobě pracovní
    expect(nextBusinessDay('2027-12-31')).toBe('2027-12-31')
    // 2028-12-24/25/26 svátky, 2028-12-23 sobota → 27. 12.
    expect(nextBusinessDay('2028-12-23')).toBe('2028-12-27')
  })
})

describe('getTaxDeadlines', () => {
  it('vrací tři termíny: přiznání, ČSSZ, zdravotní', () => {
    const d = getTaxDeadlines(2026, 'electronic')

    expect(d.map(x => x.id)).toEqual(['income_tax_return', 'social_overview', 'health_overview'])
    expect(d.map(x => x.authority)).toEqual(['financni_sprava', 'cssz', 'zdravotni_pojistovna'])
  })

  it('podává se v roce následujícím po zdaňovacím období', () => {
    expect(getTaxDeadlines(2026).every(d => d.date.startsWith('2027'))).toBe(true)
  })

  it('způsob podání posune lhůtu přiznání', () => {
    const at = (route: Parameters<typeof getTaxDeadlines>[1]) =>
      getTaxDeadlines(2026, route).find(d => d.id === 'income_tax_return')!.statutoryDate

    expect(at('paper')).toBe('2027-04-01')
    expect(at('electronic')).toBe('2027-05-01')
    expect(at('advisor')).toBe('2027-07-01')
  })

  it('přehledy jdou vždy měsíc po lhůtě přiznání, ne na pevné datum', () => {
    for (const route of ['paper', 'electronic', 'advisor'] as const) {
      const d = getTaxDeadlines(2026, route)
      const ret = d.find(x => x.id === 'income_tax_return')!
      const overview = d.find(x => x.id === 'social_overview')!

      const retMonth = Number(ret.statutoryDate.slice(5, 7))
      expect(Number(overview.statutoryDate.slice(5, 7))).toBe(retMonth + 1)
    }
  })

  it('oba přehledy mají shodnou lhůtu', () => {
    const d = getTaxDeadlines(2026, 'electronic')
    const social = d.find(x => x.id === 'social_overview')!
    const health = d.find(x => x.id === 'health_overview')!

    expect(social.date).toBe(health.date)
  })

  it('označí posunutý termín a zachová původní zákonné datum', () => {
    // Elektronicky za 2026 → zákonné 1. 5. 2027 (sobota + svátek) → 3. 5. 2027
    const ret = getTaxDeadlines(2026, 'electronic').find(d => d.id === 'income_tax_return')!

    expect(ret.statutoryDate).toBe('2027-05-01')
    expect(ret.date).toBe('2027-05-03')
    expect(ret.shifted).toBe(true)
  })

  it('neposunutý termín má shifted = false a obě data stejná', () => {
    const ret = getTaxDeadlines(2026, 'paper').find(d => d.id === 'income_tax_return')!

    expect(ret.statutoryDate).toBe('2027-04-01')
    expect(ret.date).toBe('2027-04-01')
    expect(ret.shifted).toBe(false)
  })

  it('každý termín nese odkaz na zdroj — je to informace, ne poradenství', () => {
    expect(getTaxDeadlines(2026).every(d => d.sourceUrl.startsWith('https://'))).toBe(true)
  })

  it('termíny jsou vždy seřazené a nikdy nepadnou na víkend', () => {
    for (let year = 2024; year <= 2035; year++) {
      const d = getTaxDeadlines(year, 'electronic')

      expect(d[0].date <= d[1].date).toBe(true)
      for (const item of d) {
        const [y, m, day] = item.date.split('-').map(Number)
        const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay()
        expect(dow).not.toBe(0)
        expect(dow).not.toBe(6)
        expect(czechHolidays(y).has(item.date)).toBe(false)
      }
    }
  })
})

describe('daysUntil', () => {
  it('počítá v celých dnech oběma směry', () => {
    expect(daysUntil('2027-05-03', '2027-05-03')).toBe(0)
    expect(daysUntil('2027-05-03', '2027-05-01')).toBe(2)
    expect(daysUntil('2027-05-01', '2027-05-03')).toBe(-2)
  })

  it('nerozbije se na přechodu letního času', () => {
    // Přechod na letní čas 2027: 28. 3. — den má 23 hodin, ale pořád je to 1 den.
    expect(daysUntil('2027-03-29', '2027-03-27')).toBe(2)
  })
})

describe('getUpcomingTaxDeadlines', () => {
  it('vrací nejvýš tři budoucí termíny vzestupně', () => {
    const up = getUpcomingTaxDeadlines('2026-09-11')

    expect(up.length).toBeGreaterThan(0)
    expect(up.length).toBeLessThanOrEqual(3)
    expect([...up].sort((a, b) => a.date.localeCompare(b.date))).toEqual(up)
  })

  it('nikdy nevrátí termín po lhůtě', () => {
    for (const today of ['2026-01-05', '2026-04-20', '2026-06-30', '2026-12-31']) {
      for (const d of getUpcomingTaxDeadlines(today)) {
        expect(d.date >= today).toBe(true)
      }
    }
  })

  it('v lednu ukazuje termíny za loňský rok, ne za letošní', () => {
    // 5. 1. 2027 → nejbližší je přiznání za 2026 (podává se v 2027), ne za 2027.
    const [first] = getUpcomingTaxDeadlines('2027-01-05')

    expect(first.id).toBe('income_tax_return')
    expect(first.title).toContain('2026')
    expect(first.date.startsWith('2027')).toBe(true)
  })

  it('po odbavení letošních termínů plynule přejde na příští období', () => {
    // Po 1. 7. 2027 jsou všechny lhůty za 2026 pryč → následuje období 2027.
    const up = getUpcomingTaxDeadlines('2027-07-15')

    expect(up[0].title).toContain('2027')
    expect(up[0].date.startsWith('2028')).toBe(true)
  })
})
