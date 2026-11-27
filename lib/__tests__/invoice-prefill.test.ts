import { describe, expect, it } from 'vitest'
import { EMPTY_PARTY, followField, followParty, prefillNote } from '@/lib/admin/invoice-prefill'

describe('předvyplnění odběratele po výběru zakázky (R-153)', () => {
  const fromA = { name: 'Firma A', address: 'Ulice 1', ico: '27074358', dic: '', phone: '+420777000001' }
  const fromB = { name: 'Firma B', address: 'Ulice 2', ico: '45274649', dic: 'CZ45274649', phone: '' }

  it('pole, které drží hodnotu ze zakázky nebo je prázdné, dostane novou', () => {
    expect(followParty(fromA, fromA, fromB)).toEqual(fromB)
    expect(followParty(EMPTY_PARTY, EMPTY_PARTY, fromB)).toEqual(fromB)
  })

  it('ručně přepsané pole zůstane', () => {
    const edited = { ...fromA, name: 'Firma A, pobočka Brno' }
    expect(followParty(edited, fromA, fromB)).toEqual({ ...fromB, name: 'Firma A, pobočka Brno' })
    expect(followField('fakturace@a.cz', 'info@a.cz', 'info@b.cz')).toBe('fakturace@a.cz')
  })

  it('mezery na okraji nedělají z vyplněné hodnoty ruční změnu', () => {
    expect(followField('Firma A ', 'Firma A', 'Firma B')).toBe('Firma B')
  })

  it('výběr „Bez zakázky“ smaže jen to, co se vyplnilo samo', () => {
    const edited = { ...fromA, address: 'Jiná 3' }
    expect(followParty(edited, fromA, EMPTY_PARTY)).toEqual({ ...EMPTY_PARTY, address: 'Jiná 3' })
  })

  it('poznámka řekne, odkud údaje jsou', () => {
    expect(prefillNote({ lastInvoice: true, registry: false })).toBe('Odběratele jsem vyplnil z minulé faktury tomuto klientovi.')
    expect(prefillNote({ lastInvoice: false, registry: true })).toContain('z rejstříku firem')
  })
})
