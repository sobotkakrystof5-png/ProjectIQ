import { describe, expect, it } from 'vitest'
import { pgDate } from '@/lib/pg-date'
import { splitLinks } from '@/lib/security/html'
import { withPeriod } from '@/lib/ws/sentence'

// Drobnosti z testu klientského prostoru 2026-11-27 (R-156).

describe('pgDate', () => {
  it('sloupec date z ovladače (místní půlnoc) dá týž den v jakékoli zóně', () => {
    // pg-types skládá `date` jako new Date(rok, měsíc, den) v místní zóně.
    expect(pgDate(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(pgDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('text bere jen jako datum na začátku, jinak nic', () => {
    expect(pgDate('2026-11-28')).toBe('2026-11-28')
    expect(pgDate('2026-11-28T10:00:00Z')).toBe('2026-11-28')
    expect(pgDate('Thu Dec 31')).toBeNull()
    expect(pgDate(null)).toBeNull()
    expect(pgDate('')).toBeNull()
    expect(pgDate(new Date('nesmysl'))).toBeNull()
  })
})

describe('splitLinks', () => {
  it('z adresy v textu udělá odkaz, interpunkce na konci k ní nepatří', () => {
    expect(splitLinks('Návrh je na https://navrhy.vizeon.cz/abc. Díky')).toEqual([
      { text: 'Návrh je na ' },
      { text: 'https://navrhy.vizeon.cz/abc', href: 'https://navrhy.vizeon.cz/abc' },
      { text: '. Díky' },
    ])
  })

  it('text bez adresy nechá celý, nebezpečné schéma odkazem neudělá', () => {
    expect(splitLinks('Bez odkazu')).toEqual([{ text: 'Bez odkazu' }])
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
    expect(splitLinks('')).toEqual([])
  })

  it('víc odkazů za sebou', () => {
    const parts = splitLinks('http://a.cz a https://b.cz')
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual(['http://a.cz/', 'https://b.cz/'])
  })
})

describe('withPeriod', () => {
  it('za jménem končícím tečkou druhou nepřidá', () => {
    expect(withPeriod('Novák s.r.o.')).toBe('Novák s.r.o.')
    expect(withPeriod('Novák a.s. ')).toBe('Novák a.s.')
    expect(withPeriod('Kavárna Novák')).toBe('Kavárna Novák.')
    expect(withPeriod('Proč?')).toBe('Proč?')
  })
})
