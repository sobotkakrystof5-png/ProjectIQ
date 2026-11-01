import { describe, expect, it } from 'vitest'
import { EMPTY_TODAY, daysBetween, isTodayEmpty, pickFocus, type TodayData } from '@/lib/admin-today'

const NOW = new Date('2026-11-10T10:00:00Z')

const base: TodayData = {
  requests: [{ id: 'r1', clientName: 'Novák', summary: 'Změnit telefon v patičce.', createdAt: '2026-11-09T10:00:00Z', href: '/dashboard/pozadavky' }],
  drafts: [{ projectId: 'p1', clientName: 'Dvořák', count: 2, sensitive: 0, href: '/dashboard/p1?zalozka=aktivita' }],
  overdueInvoices: [{ id: 'i1', number: '2026-001', clientName: 'Svoboda', dueOn: '2026-11-05T00:00:00Z', amount: 1000, currency: 'CZK' }],
  upcoming: [{ id: 'u1', at: '2026-11-10T14:00:00Z', label: 'Konzultace: Černý', detail: null, href: '/dashboard/p2' }],
  stale: [{ id: 's1', clientName: 'Procházka', updatedAt: '2026-10-20T10:00:00Z', href: '/dashboard/s1' }],
}

describe('pickFocus', () => {
  it('požadavek klienta má nejvyšší prioritu', () => {
    expect(pickFocus(base, NOW)?.kind).toBe('request')
  })

  it('bez požadavku jsou na řadě hlášení ke schválení', () => {
    const focus = pickFocus({ ...base, requests: [] }, NOW)
    expect(focus?.kind).toBe('draft')
    expect(focus?.title).toContain('2 hlášení čekají')
  })

  it('pak faktura po splatnosti s počtem dní', () => {
    const focus = pickFocus({ ...base, requests: [], drafts: [] }, NOW)
    expect(focus?.kind).toBe('invoice')
    expect(focus?.title).toContain('5 dní po splatnosti')
    expect(focus?.href).toBe('/dashboard/faktury')
  })

  it('pak schůzka do 24 hodin, ale ne vzdálenější', () => {
    const rest = { ...base, requests: [], drafts: [], overdueInvoices: [] }
    expect(pickFocus(rest, NOW)?.kind).toBe('event')
    const far = { ...rest, upcoming: [{ ...base.upcoming[0], at: '2026-11-15T14:00:00Z' }] }
    expect(pickFocus(far, NOW)?.kind).toBe('stale')
  })

  it('zakázka bez pohybu je poslední', () => {
    const focus = pickFocus({ ...EMPTY_TODAY, stale: base.stale }, NOW)
    expect(focus?.kind).toBe('stale')
    expect(focus?.title).toContain('21 dní')
  })

  it('prázdná data nemají hlavní věc a Dnes je prázdné', () => {
    expect(pickFocus(EMPTY_TODAY, NOW)).toBeNull()
    expect(isTodayEmpty(EMPTY_TODAY)).toBe(true)
    expect(isTodayEmpty(base)).toBe(false)
  })

  it('událost v minulosti se za hlavní věc nebere', () => {
    const past = { ...EMPTY_TODAY, upcoming: [{ ...base.upcoming[0], at: '2026-11-10T08:00:00Z' }] }
    expect(pickFocus(past, NOW)).toBeNull()
  })

  it('počítá dny a skloňuje', () => {
    expect(daysBetween('2026-11-09T10:00:00Z', NOW)).toBe(1)
    const one = pickFocus({ ...EMPTY_TODAY, stale: [{ ...base.stale[0], updatedAt: '2026-11-09T09:00:00Z' }] }, NOW)
    expect(one?.title).toContain('1 den')
  })
})
