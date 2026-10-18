import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { checkSlot, createBooking, resizeAppointment } from '../bookings'
import { closedSegments, freeGaps, openRangesFor, type OpeningRow } from '../calendar-layout'
import { findCustomersForBooking, getCalendarData } from '../calendar'
import { pickNearestSlots } from '../slot-suggest'
import { getSlotAdvice } from '../slot-advice'
import { staffAccent, staffTint } from '../staff-colors'
import { toAdviceDto } from '../slot-suggest'
import { detailValue, hrefWith, parseDetail } from '../detail-param'
import { pragueToUtc } from '../time'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Kalendář (RD05): návrhy volných časů, upozornění na kolizi a otevírací dobu,
// změna délky termínu, mezery a stínování mimo otevírací dobu, barvy pracovníků.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business, name: 'Byznys a' }
const bizB = { id: B.business, name: 'Byznys b' }

// pátek 2026-10-09 10:00 UTC; nejbližší pondělí je 2026-10-12 (otevřeno 9–17, seed)
const NOW = new Date('2026-10-09T10:00:00Z')
const MON = '2026-10-12'
const mon = (h: number, m = 0) => pragueToUtc(MON, h * 60 + m)

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

async function book(start: Date, durationMin: number, staffId: string | null = A.staff) {
  const res = await createBooking(ctxA, bizA, { customerId: A.customer, serviceId: null, staffId, start, durationMin, note: null })
  if (!res.ok) throw new Error(`rezervace selhala: ${res.reason}`)
  return res.data.appointmentId
}

describe('nejbližší volné časy', () => {
  const toUtc = pragueToUtc
  const days = [
    { date: '2026-10-12', times: [9 * 60, 9 * 60 + 30, 10 * 60, 12 * 60] },
    { date: '2026-10-13', times: [9 * 60] },
  ]

  it('vybere tři nejbližší k cíli před i po a seřadí je podle času', () => {
    const picked = pickNearestSlots(days, mon(10, 20), 3, toUtc)
    // 10:00 (20 min), 9:30 (50 min), 9:00 (80 min); 12:00 je až 100 min daleko
    expect(picked).toEqual([
      { day: '2026-10-12', minutes: 9 * 60 },
      { day: '2026-10-12', minutes: 9 * 60 + 30 },
      { day: '2026-10-12', minutes: 10 * 60 },
    ])
  })

  it('při stejné vzdálenosti vyhraje dřívější čas a vynechaný čas se nenabízí', () => {
    const picked = pickNearestSlots(days, mon(9, 45), 2, toUtc, mon(10, 0))
    expect(picked).toEqual([
      { day: '2026-10-12', minutes: 9 * 60 },
      { day: '2026-10-12', minutes: 9 * 60 + 30 },
    ])
    expect(pickNearestSlots([], mon(9), 3, toUtc)).toEqual([])
    expect(pickNearestSlots(days, mon(9), 0, toUtc)).toEqual([])
  })
})

describe('otevírací doba, stínování a mezery v mřížce', () => {
  const rows: OpeningRow[] = [
    { staff_id: null, weekday: 1, from: 9 * 60, to: 12 * 60 },
    { staff_id: null, weekday: 1, from: 13 * 60, to: 17 * 60 },
    { staff_id: 'tereza', weekday: 1, from: 10 * 60, to: 14 * 60 },
  ]

  it('pracovník s vlastními směnami se řídí jimi, ostatní dobou byznysu', () => {
    expect(openRangesFor(rows, 1, null)).toEqual([
      { from: 540, to: 720 },
      { from: 780, to: 1020 },
    ])
    expect(openRangesFor(rows, 1, 'tereza')).toEqual([{ from: 600, to: 840 }])
    expect(openRangesFor(rows, 1, 'jiny')).toEqual(openRangesFor(rows, 1, null))
    // den bez úseku = zavřeno; bez jakékoli doby se nestíní nic
    expect(openRangesFor(rows, 2, null)).toEqual([])
    expect(openRangesFor([], 1, null)).toBeNull()
  })

  it('zavřeno v procentech výšky: před otevřením, polední pauza, po zavření', () => {
    const closed = closedSegments(openRangesFor(rows, 1, null), { from: 8, to: 18 })
    expect(closed).toHaveLength(3)
    expect(closed[0]).toEqual({ top: 0, height: 10 }) // 8–9
    expect(closed[1].top).toBeCloseTo(40) // 12–13
    expect(closed[1].height).toBeCloseTo(10)
    expect(closed[2].top).toBeCloseTo(90) // 17–18
    expect(closedSegments(null, { from: 8, to: 18 })).toEqual([])
    // celý den zavřeno
    expect(closedSegments([], { from: 8, to: 10 })).toEqual([{ top: 0, height: 100 }])
  })

  it('mezery: jen dost velké, jen v otevírací době a ne v minulosti', () => {
    const open = [{ from: 9 * 60, to: 17 * 60 }]
    const busy = [
      { from: 10 * 60, to: 11 * 60 },
      { from: 10 * 60 + 30, to: 12 * 60 }, // překrývající se
      { from: 16 * 60 + 40, to: 17 * 60 },
    ]
    expect(freeGaps(open, busy, 60)).toEqual([
      { from: 9 * 60, to: 10 * 60 },
      { from: 12 * 60, to: 16 * 60 + 40 },
    ])
    expect(freeGaps(open, busy, 30)).toHaveLength(2)
    // dnes po obědě: co uplynulo, není volné
    expect(freeGaps(open, busy, 60, 13 * 60)).toEqual([{ from: 13 * 60, to: 16 * 60 + 40 }])
    expect(freeGaps([], busy, 15)).toEqual([])
  })
})

describe('barvy pracovníků', () => {
  it('uložená barva má přednost, jinak se střídají tokeny', () => {
    expect(staffAccent('#a1b2c3', 0)).toBe('#a1b2c3')
    expect(staffAccent(null, 0)).toBe('rgb(var(--staff-1))')
    expect(staffAccent('nesmysl', 6)).toBe('rgb(var(--staff-2))')
    expect(staffAccent(null, 5)).toBe('rgb(var(--staff-1))')
    expect(staffTint('#a1b2c3')).toContain('var(--staff-tint)')
  })
})

describe('změna délky termínu', () => {
  it('změní konec, začátek zůstane a vrátí předchozí délku pro „Zpět“', async () => {
    const id = await book(mon(9), 60)
    const longer = await resizeAppointment(ctxA, bizA, { appointmentId: id, durationMin: 90 })
    expect(longer.ok).toBe(true)
    if (!longer.ok) return
    expect(longer.data.prevDurationMin).toBe(60)
    expect(longer.data.start.getTime()).toBe(mon(9).getTime())
    expect(longer.data.end.getTime()).toBe(mon(10, 30).getTime())
    const back = await resizeAppointment(ctxA, bizA, { appointmentId: id, durationMin: longer.data.prevDurationMin })
    expect(back.ok && back.data.end.getTime()).toBe(mon(10).getTime())
  })

  it('další termín pracovníka prodloužení nepustí, jiný pracovník ano', async () => {
    const first = await book(pragueToUtc('2026-10-13', 9 * 60), 60)
    await book(pragueToUtc('2026-10-13', 10 * 60 + 30), 60)
    expect(await resizeAppointment(ctxA, bizA, { appointmentId: first, durationMin: 120 })).toEqual({ ok: false, reason: 'overlap' })
    const ok = await resizeAppointment(ctxA, bizA, { appointmentId: first, durationMin: 90 })
    expect(ok.ok).toBe(true) // konec přesně na začátku dalšího termínu
  })

  it('krátká a dlouhá délka, neexistující a cizí termín', async () => {
    const id = await book(pragueToUtc('2026-10-14', 9 * 60), 60)
    expect(await resizeAppointment(ctxA, bizA, { appointmentId: id, durationMin: 5 })).toEqual({ ok: false, reason: 'bad_length' })
    expect(await resizeAppointment(ctxA, bizA, { appointmentId: id, durationMin: 13 * 60 })).toEqual({ ok: false, reason: 'bad_length' })
    expect(await resizeAppointment(ctxA, bizA, { appointmentId: A.service, durationMin: 60 })).toEqual({ ok: false, reason: 'not_found' })
    // účet B cizí termín nezmění
    expect(await resizeAppointment(ctxB, bizB, { appointmentId: id, durationMin: 30 })).toEqual({ ok: false, reason: 'not_found' })
    const len = await db.query<{ min: number }>(`SELECT (extract(epoch FROM ends_at - starts_at) / 60)::int AS min FROM ws.appointments WHERE id = $1`, [id])
    expect(len.rows[0].min).toBe(60)
  })
})

describe('kontrola času pro konkrétního pracovníka', () => {
  it('termín jiného pracovníka nekoliduje, blokace celého byznysu ano', async () => {
    const second = '00000000-0000-4000-8000-0000000000aa'
    await db.query(`INSERT INTO ws.staff (id, account_id, business_id, name) VALUES ($1, $2, $3, 'Druhá')`, [second, A.account, A.business])
    await book(pragueToUtc('2026-10-20', 9 * 60), 60, A.staff)
    const span = { start: pragueToUtc('2026-10-20', 9 * 60 + 15), end: pragueToUtc('2026-10-20', 9 * 60 + 45), serviceId: null }
    // „kdokoli“: druhá pracovnice je volná
    expect((await checkSlot(ctxA, bizA, span)).free).toBe(true)
    // konkrétně první: obsazená; konkrétně druhá: volná
    expect((await checkSlot(ctxA, bizA, { ...span, staffId: A.staff })).free).toBe(false)
    expect((await checkSlot(ctxA, bizA, { ...span, staffId: second })).free).toBe(true)
    await db.query(
      `INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, starts_at, ends_at, title) VALUES ($1, $2, 'block', NULL, $3, $4, 'Zavřeno')`,
      [A.account, A.business, pragueToUtc('2026-10-20', 9 * 60), pragueToUtc('2026-10-20', 10 * 60)],
    )
    expect((await checkSlot(ctxA, bizA, { ...span, staffId: second })).free).toBe(false)
    await db.query(`DELETE FROM ws.appointments WHERE kind = 'block' AND title = 'Zavřeno' AND account_id = $1`, [A.account])
    await db.query(`DELETE FROM ws.appointments WHERE account_id = $1 AND starts_at >= $2 AND starts_at < $3`, [A.account, pragueToUtc('2026-10-20', 0), pragueToUtc('2026-10-21', 0)])
    await db.query(`DELETE FROM ws.staff WHERE id = $1`, [second])
  })
})

describe('rady k času: kolize, otevírací doba, tři nejbližší volné časy', () => {
  // pondělí 12. 10.: seed má otevřeno 9–17; v testu výše je v 9–10 termín (po „Zpět“ znovu 60 min), úterý 13. 10. nemá otevřeno
  it('obsazený čas = kolize a tři nejbližší volné časy, jen z otevírací doby', async () => {
    const advice = await getSlotAdvice(ctxA, bizA, {
      start: mon(9, 30), durationMin: 60, serviceId: null, staffId: null, now: NOW,
    })
    expect(advice.hoursSet).toBe(true)
    expect(advice.check?.free).toBe(false)
    expect(advice.outsideHours).toBe(false)
    // 9:00–10:00 je obsazené → nejbližší začátky od 10:00
    expect(advice.suggestions).toEqual([
      { day: MON, minutes: 10 * 60 },
      { day: MON, minutes: 10 * 60 + 30 },
      { day: MON, minutes: 11 * 60 },
    ])
  })

  it('volný chtěný čas se v návrzích nezopakuje a návrhy jsou jeho sousedé', async () => {
    const advice = await getSlotAdvice(ctxA, bizA, { start: mon(13), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(advice.check).toMatchObject({ free: true })
    expect(advice.suggestions.map((s) => s.minutes)).not.toContain(13 * 60)
    expect(advice.suggestions).toHaveLength(3)
    const dto = toAdviceDto(advice, '2026-10-09')
    expect(dto.state).toBe('free')
    expect(dto.suggestions[0].label).toMatch(/^po 12\. 10\. \d+:\d{2}$/)
  })

  it('mimo otevírací dobu: upozornění, ale zapsat jde (check je volný)', async () => {
    const early = await getSlotAdvice(ctxA, bizA, { start: mon(7), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(early.outsideHours).toBe(true)
    expect(early.check?.free).toBe(true)
    const late = await getSlotAdvice(ctxA, bizA, { start: mon(16, 30), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(late.outsideHours).toBe(true)
    // úterý nemá otevřeno
    const tue = await getSlotAdvice(ctxA, bizA, { start: pragueToUtc('2026-10-13', 10 * 60), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(tue.outsideHours).toBe(true)
  })

  it('bez zadaného času najde nejbližší volno od teď; minulost se nenabízí', async () => {
    const advice = await getSlotAdvice(ctxA, bizA, { start: null, durationMin: 60, serviceId: A.service, staffId: null, now: NOW })
    expect(advice.check).toBeNull()
    expect(advice.suggestions[0]).toEqual({ day: MON, minutes: 10 * 60 })
    const later = await getSlotAdvice(ctxA, bizA, {
      start: null, durationMin: 60, serviceId: null, staffId: null, now: new Date(mon(12).getTime() + 10 * 60_000),
    })
    // po poledni v pondělí už se nenabízí dopoledne
    expect(later.suggestions[0].minutes).toBeGreaterThanOrEqual(12 * 60 + 30)
  })

  it('byznys bez otevírací doby: kontrola ano, návrhy ne', async () => {
    const advice = await getSlotAdvice(ctxB, bizB, { start: mon(10), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(advice.hoursSet).toBe(true) // seed B má otevřeno stejně jako A
    await db.query(`DELETE FROM ws.opening_hours WHERE account_id = $1`, [B.account])
    const none = await getSlotAdvice(ctxB, bizB, { start: mon(10), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(none).toMatchObject({ hoursSet: false, outsideHours: false, suggestions: [] })
    expect(none.check?.free).toBe(true)
  })

  it('termíny druhého účtu nic neblokují', async () => {
    const advice = await getSlotAdvice(ctxB, bizB, { start: mon(9, 30), durationMin: 60, serviceId: null, staffId: null, now: NOW })
    expect(advice.check?.free).toBe(true)
  })
})

describe('data kalendáře', () => {
  it('otevírací doba po úsecích a barva pracovníka', async () => {
    await db.query(`UPDATE ws.staff SET color = '#112233' WHERE id = $1`, [A.staff])
    const data = await getCalendarData(ctxA, bizA, { from: pragueToUtc(MON, 0), to: pragueToUtc('2026-10-13', 0) })
    expect(data.openingRows).toContainEqual({ staff_id: null, weekday: 1, from: 540, to: 1020 })
    expect(data.opening).toEqual({ from: 9, to: 17 })
    expect(data.staff[0]).toMatchObject({ id: A.staff, color: '#112233' })
    expect(data.entries.some((e) => e.kind === 'visit')).toBe(true)
  })

  it('hledání zákazníka podle jména, telefonu i e-mailu; cizí účet ho nevidí', async () => {
    await db.query(`UPDATE ws.customers SET name = 'Tereza Nováková', phone = '+420777123456', email = 'tereza@example.cz' WHERE id = $1`, [A.customer])
    expect((await findCustomersForBooking(ctxA, 'terez')).map((c) => c.id)).toEqual([A.customer])
    expect((await findCustomersForBooking(ctxA, '777 123')).map((c) => c.id)).toEqual([A.customer])
    expect((await findCustomersForBooking(ctxA, 'tereza@')).map((c) => c.id)).toEqual([A.customer])
    expect(await findCustomersForBooking(ctxA, 't')).toEqual([])
    expect(await findCustomersForBooking(ctxB, 'terez')).toEqual([])
    // znak % nehledá všechno
    expect(await findCustomersForBooking(ctxA, '%%')).toEqual([])
  })
})

describe('adresa panelu Najít volný čas', () => {
  it('rozpozná se, zachová ostatní parametry a nic nevymýšlí', () => {
    expect(parseDetail('najit-cas')).toEqual({ kind: 'najit-cas' })
    expect(detailValue({ kind: 'najit-cas' })).toBe('najit-cas')
    expect(parseDetail('najit-cas:nesmysl')).toBeNull()
    expect(hrefWith('/w/x/kalendar', { pohled: 'den', kdo: 'abc' }, { detail: 'najit-cas' })).toBe('/w/x/kalendar?pohled=den&kdo=abc&detail=najit-cas')
  })
})
