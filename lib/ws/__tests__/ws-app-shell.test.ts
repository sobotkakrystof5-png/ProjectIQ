import { describe, expect, it } from 'vitest'
import { hourRange, layoutWeek } from '../calendar-layout'
import { parseCommand } from '../command-parser'
import { detailValue, hrefWith, parseDetail } from '../detail-param'
import { newActions, WS_FEATURES } from '../features'
import { bottomBarSlots, navItemForSegment, navItems } from '../nav'
import { plural } from '../plural'
import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatRelativeDay,
  isIsoDate,
  pragueParts,
  pragueToUtc,
  pragueToday,
  weekStartOf,
  weekdayOf,
} from '../time'

// Kostra aplikace (S09): čas, parser příkazů ⌘K, rozložení kalendáře, navigace, ?detail=.

describe('pražský čas', () => {
  it('den a minuta v Praze, i kolem půlnoci UTC', () => {
    expect(pragueParts(new Date('2026-10-09T22:30:00Z'))).toEqual({ date: '2026-10-10', minutes: 30 })
    expect(pragueToday(new Date('2026-01-31T23:10:00Z'))).toBe('2026-02-01')
  })

  it('nástěnné hodiny → UTC přes letní i zimní čas', () => {
    expect(pragueToUtc('2026-10-09', 9 * 60).toISOString()).toBe('2026-10-09T07:00:00.000Z')
    expect(pragueToUtc('2026-12-01', 9 * 60).toISOString()).toBe('2026-12-01T08:00:00.000Z')
    // den přechodu na zimní čas (25. 10. 2026)
    expect(pragueToUtc('2026-10-25', 12 * 60).toISOString()).toBe('2026-10-25T11:00:00.000Z')
    expect(pragueToUtc('2026-10-26', 0).toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('týden začíná pondělím', () => {
    expect(weekdayOf('2026-10-09')).toBe(5)
    expect(weekdayOf('2026-10-11')).toBe(7)
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05')
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('kontrola data a české formáty', () => {
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(formatDayShort('2026-10-09')).toBe('pá 9. 10.')
    expect(formatDayLong('2026-10-09')).toBe('pátek 9. října')
    expect(formatRelativeDay('2026-10-10', '2026-10-09')).toBe('zítra')
    expect(formatRelativeDay('2026-10-13', '2026-10-09')).toBe('út 13. 10.')
  })

  it('skloňování podle počtu', () => {
    const f = ['poptávka', 'poptávky', 'poptávek'] as const
    expect(plural(0, f)).toBe('0 poptávek')
    expect(plural(1, f)).toBe('1 poptávka')
    expect(plural(3, f)).toBe('3 poptávky')
    expect(plural(12, f)).toBe('12 poptávek')
  })
})

describe('parser příkazů ⌘K', () => {
  const today = '2026-10-09' // pátek
  const services = ['Dámský střih', 'Pánský střih', 'Barvení']

  it('příklad z plánu: „rezervace Tereza pátek 9:00"', () => {
    expect(parseCommand('rezervace Tereza pátek 9:00', { today })).toEqual({
      kind: 'booking',
      customer: 'Tereza',
      date: '2026-10-09',
      minutes: 540,
      service: null,
    })
  })

  it('bez slova rezervace to není příkaz (obyčejné hledání)', () => {
    expect(parseCommand('Tereza pátek 9:00', { today })).toBeNull()
    expect(parseCommand('', { today })).toBeNull()
  })

  it('dny: zítra, název dne s předložkou, příští týden, bez diakritiky', () => {
    expect(parseCommand('rezervace Jana zítra 14:30', { today })?.date).toBe('2026-10-10')
    expect(parseCommand('termín Jana ve středu v 10', { today })).toMatchObject({ date: '2026-10-14', minutes: 600, customer: 'Jana' })
    expect(parseCommand('rezervace Jana pristi patek 8h', { today })).toMatchObject({ date: '2026-10-16', minutes: 480 })
    expect(parseCommand('rezervace Jana příští středa', { today })?.date).toBe('2026-10-14')
    expect(parseCommand('objednat Petr po 9.45', { today })).toMatchObject({ date: '2026-10-12', minutes: 585 })
  })

  it('datum „12. 10.", „12.10.", „3. 1." v minulosti = příští rok', () => {
    expect(parseCommand('rezervace Petr 12. 10. 9:00', { today })?.date).toBe('2026-10-12')
    expect(parseCommand('rezervace Petr 12.10. 9:00', { today })?.date).toBe('2026-10-12')
    expect(parseCommand('rezervace Petr 3. 1.', { today })?.date).toBe('2027-01-03')
    expect(parseCommand('rezervace Petr 31. 2.', { today })).toMatchObject({ date: null })
  })

  it('služba podle názvu služby byznysu, zbytek je jméno s původními písmeny', () => {
    expect(parseCommand('rezervace Tereza Nováková dámský střih pá 9:00', { today, services })).toEqual({
      kind: 'booking',
      customer: 'Tereza Nováková',
      date: '2026-10-09',
      minutes: 540,
      service: 'Dámský střih',
    })
  })

  it('neplatný čas se nebere, chybějící části jsou null', () => {
    expect(parseCommand('rezervace Tereza 25:00', { today })).toMatchObject({ minutes: null, customer: 'Tereza 25:00' })
    expect(parseCommand('rezervace', { today })).toEqual({ kind: 'booking', customer: null, date: null, minutes: null, service: null })
  })
})

describe('rozložení týdenního kalendáře', () => {
  const week = '2026-10-05'
  const at = (iso: string, h: number, m = 0) => pragueToUtc(iso, h * 60 + m)

  it('rozsah hodin: výchozí 8–18, rozšíří se podle termínů', () => {
    expect(hourRange([])).toEqual({ from: 8, to: 18 })
    expect(hourRange([], { from: 9, to: 17 })).toEqual({ from: 9, to: 17 })
    expect(hourRange([{ id: 'a', start: at('2026-10-06', 7, 30), end: at('2026-10-06', 19, 15) }])).toEqual({ from: 7, to: 20 })
  })

  it('den, pozice a dráhy souběžných termínů', () => {
    const items = [
      { id: 'a', start: at('2026-10-06', 9), end: at('2026-10-06', 10) },
      { id: 'b', start: at('2026-10-06', 9, 30), end: at('2026-10-06', 11) },
      { id: 'c', start: at('2026-10-06', 11), end: at('2026-10-06', 12) },
      { id: 'd', start: at('2026-10-11', 8), end: at('2026-10-11', 9) },
      { id: 'mimo', start: at('2026-10-12', 8), end: at('2026-10-12', 9) },
    ]
    const placed = layoutWeek(items, week, { from: 8, to: 18 })
    const by = (id: string) => placed.find((p) => p.item.id === id)!
    expect(placed.map((p) => p.item.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(by('a')).toMatchObject({ dayIndex: 1, top: 10, height: 10, lane: 0, lanes: 2 })
    expect(by('b')).toMatchObject({ dayIndex: 1, lane: 1, lanes: 2 })
    expect(by('c')).toMatchObject({ lane: 0, lanes: 1 })
    expect(by('d')).toMatchObject({ dayIndex: 6, top: 0 })
  })

  it('termín přes půlnoc se rozdělí do dvou dnů', () => {
    const placed = layoutWeek([{ id: 'n', start: at('2026-10-07', 22), end: at('2026-10-08', 2) }], week, { from: 0, to: 24 })
    expect(placed.map((p) => p.dayIndex)).toEqual([2, 3])
  })
})

describe('navigace podle zapnutých funkcí', () => {
  it('vypnutá funkce v menu není, Poptávky/Zákazníci/Nastavení vždy', () => {
    const keys = navItems(new Set(['calendar'])).map((i) => i.key)
    expect(keys).toEqual(['dnes', 'poptavky', 'kalendar', 'zakaznici', 'nastaveni'])
    expect(navItemForSegment('faktury', new Set(['calendar']))).toBeNull()
    expect(navItemForSegment('faktury', new Set(['invoices']))?.label).toBe('Faktury')
    expect(navItemForSegment('', new Set())).toBeNull()
  })

  it('spodní lišta: Dnes, Kalendář, +, Zákazníci, Peníze', () => {
    const slots = bottomBarSlots(new Set(['calendar', 'invoices', 'finance']))
    expect(slots.map((s) => (s.kind === 'new' ? '+' : s.label))).toEqual(['Dnes', 'Kalendář', '+', 'Zákazníci', 'Peníze'])
    expect(slots[4]).toMatchObject({ segment: 'prijmy' })
    const bare = bottomBarSlots(new Set())
    expect(bare.map((s) => (s.kind === 'new' ? '+' : s.label))).toEqual(['Dnes', 'Poptávky', '+', 'Zákazníci'])
  })
})

describe('nehotové akce (R-043)', () => {
  const all = { orderLink: true, newBooking: true, newInvoice: true }
  const none = { orderLink: false, newBooking: false, newInvoice: false }

  it('vypnutá akce se nenabízí, zapnutá jen se zapnutou funkcí byznysu', () => {
    expect(newActions(new Set(['calendar', 'invoices']), none)).toEqual([])
    expect(newActions(new Set(['calendar', 'invoices']), all)).toEqual(['booking', 'invoice', 'link'])
    expect(newActions(new Set(), all)).toEqual(['link'])
  })

  it('S10–S14 zapnuly rezervaci, objednání a fakturu', () => {
    expect(WS_FEATURES).toEqual(all)
  })
})

describe('?detail= v URL', () => {
  const id = '0b8f7c2e-1d2a-4c3b-9e8f-123456789abc'

  it('přečte jen známé tvary, jinak null', () => {
    expect(parseDetail(`zakaznik:${id}`)).toEqual({ kind: 'zakaznik', id })
    expect(parseDetail(`poptavka:${id.toUpperCase()}`)).toEqual({ kind: 'poptavka', id })
    expect(parseDetail('nova-rezervace')).toEqual({ kind: 'nova-rezervace' })
    expect(parseDetail('nova-blokace')).toEqual({ kind: 'nova-blokace' })
    expect(parseDetail(`termin:${id}`)).toEqual({ kind: 'termin', id })
    expect(parseDetail('zakaznik:1 OR 1=1')).toBeNull()
    expect(parseDetail('faktura:' + id)).toBeNull()
    expect(parseDetail(undefined)).toBeNull()
    expect(detailValue({ kind: 'zakaznik', id })).toBe(`zakaznik:${id}`)
  })

  it('odkaz zachová ostatní parametry a smaže ten s null', () => {
    expect(hrefWith('/w/lenka', { tyden: '2026-10-05', detail: 'nova-rezervace' }, { detail: null })).toBe('/w/lenka?tyden=2026-10-05')
    expect(hrefWith('/w/lenka', {}, { detail: 'nova-faktura' })).toBe('/w/lenka?detail=nova-faktura')
  })
})
