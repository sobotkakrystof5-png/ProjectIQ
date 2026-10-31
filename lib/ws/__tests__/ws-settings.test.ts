import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsBusiness, WsContext } from '../context'
import { rowsToWeek, summarizeWeek, weekToRows, type Week } from '../hours'
import { reorder, restoreModules, saveService, saveStaff, saveWeekHours, setModule, setStaffActive } from '../settings'
import { WS_MODULES } from '../templates/types'
import { createBooking } from '../bookings'
import { loadIntakeConfig, loadSlots } from '../intake/intake'
import { hasWholeMinor } from '../money'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Nastavení S13: otevírací doba a směny, pracovníci, přiřazení služeb, pořadí.
// Cizí účet nic nezmění, poslední pracovník zůstane, volné časy čtou směny.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const bizA = { id: A.business, name: 'Byznys a', slug: 'byznys-a' } as WsBusiness

const closed = (): Week => Array.from({ length: 7 }, () => [])
const weekdays = (opens: string, closes: string): Week => closed().map((_, i) => (i < 5 ? [{ opens, closes }] : []))

async function all<T>(sql: string, params: unknown[]): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('týden v Nastavení', () => {
  it('převede týden na řádky a zpět, s přestávkou', () => {
    const week = weekdays('09:00', '17:00')
    week[0] = [{ opens: '13:00', closes: '17:00' }, { opens: '9:00', closes: '12:00' }]
    const res = weekToRows(week)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows.filter((r) => r.weekday === 1)).toEqual([
      { weekday: 1, opens: '09:00', closes: '12:00' },
      { weekday: 1, opens: '13:00', closes: '17:00' },
    ])
    expect(rowsToWeek(res.rows.map((r) => ({ ...r, opens: `${r.opens}:00`, closes: `${r.closes}:00` })))[0]).toEqual([
      { opens: '09:00', closes: '12:00' },
      { opens: '13:00', closes: '17:00' },
    ])
  })

  it('odmítne překryv, konec před začátkem a prázdný čas s názvem dne', () => {
    const overlap = closed(); overlap[2] = [{ opens: '09:00', closes: '13:00' }, { opens: '12:00', closes: '15:00' }]
    expect(weekToRows(overlap)).toEqual({ ok: false, error: expect.stringContaining('Středa') })
    const reversed = closed(); reversed[4] = [{ opens: '17:00', closes: '09:00' }]
    expect(weekToRows(reversed)).toEqual({ ok: false, error: expect.stringContaining('Pátek') })
    const empty = closed(); empty[6] = [{ opens: '', closes: '12:00' }]
    expect(weekToRows(empty).ok).toBe(false)
    expect(weekToRows(closed())).toEqual({ ok: true, rows: [] })
  })

  it('shrne stejné dny dohromady', () => {
    const week = weekdays('09:00', '17:00')
    week[5] = [{ opens: '09:00', closes: '12:00' }]
    expect(summarizeWeek(week)).toBe('Po–Pá 9:00–17:00 · So 9:00–12:00')
    expect(summarizeWeek(closed())).toBeNull()
  })
})

describe('otevírací doba a směny', () => {
  it('nahradí celý týden firmy a nesáhne na směny pracovníka', async () => {
    await saveWeekHours(ctxA, bizA, A.staff, [{ weekday: 6, opens: '08:00', closes: '12:00' }])
    const rows = (weekToRows(weekdays('09:00', '17:00')) as { ok: true; rows: never[] }).rows
    expect(await saveWeekHours(ctxA, bizA, null, rows)).toBe(true)
    expect(await saveWeekHours(ctxA, bizA, null, rows)).toBe(true)
    const firm = await all<{ n: number }>(`SELECT count(*)::int AS n FROM ws.opening_hours WHERE business_id = $1 AND staff_id IS NULL`, [A.business])
    expect(firm[0].n).toBe(5)
    const shift = await all<{ weekday: number }>(`SELECT weekday FROM ws.opening_hours WHERE staff_id = $1`, [A.staff])
    expect(shift).toEqual([{ weekday: 6 }])
  })

  it('směny cizího pracovníka neuloží', async () => {
    expect(await saveWeekHours(ctxA, bizA, B.staff, [{ weekday: 1, opens: '08:00', closes: '12:00' }])).toBe(false)
    const rows = await all(`SELECT 1 FROM ws.opening_hours WHERE staff_id = $1`, [B.staff])
    expect(rows).toHaveLength(0)
  })

  it('pracovník bez vlastních směn pracuje podle otevírací doby', async () => {
    await saveWeekHours(ctxA, bizA, A.staff, null)
    expect(await all(`SELECT 1 FROM ws.opening_hours WHERE staff_id = $1`, [A.staff])).toHaveLength(0)
  })

  it('volné časy se řídí směnou pracovníka', async () => {
    await db.query(`INSERT INTO ws.business_modules (account_id, business_id, module, enabled) VALUES ($1, $2, 'calendar', true) ON CONFLICT (business_id, module) DO UPDATE SET enabled = true`, [A.account, A.business])
    // Jediný pracovník dělá službu jen v sobotu dopoledne, firma má otevřeno Po–Pá.
    await saveWeekHours(ctxA, bizA, A.staff, [{ weekday: 6, opens: '08:00', closes: '12:00' }])
    const config = await loadIntakeConfig(A.account, A.business)
    expect(config?.booking).toBe('slots')
    const slots = await loadSlots(A.account, config!, A.service, new Date('2026-11-02T06:00:00Z'))
    expect(slots.length).toBeGreaterThan(0)
    for (const d of slots) expect(new Date(`${d.date}T12:00:00Z`).getUTCDay()).toBe(6)
    await saveWeekHours(ctxA, bizA, A.staff, null)
  })
})

describe('pracovníci', () => {
  it('přidá pracovníka na konec a přejmenuje ho', async () => {
    expect(await saveStaff(ctxA, bizA, { name: 'Jana' })).toBe(true)
    const [jana] = await all<{ id: string; position: number }>(`SELECT id, position FROM ws.staff WHERE business_id = $1 AND name = 'Jana'`, [A.business])
    expect(jana.position).toBeGreaterThan(0)
    expect(await saveStaff(ctxA, bizA, { id: jana.id, name: 'Jana N.' })).toBe(true)
    expect(await saveStaff(ctxA, bizA, { id: jana.id, name: 'Jana N.', color: '#23478b' })).toBe(true)
    expect((await all<{ color: string }>(`SELECT color FROM ws.staff WHERE id = $1`, [jana.id]))[0].color).toBe('#23478b')
    expect(await saveStaff(ctxA, bizA, { id: B.staff, name: 'Cizí' })).toBe(false)
    expect((await all<{ name: string }>(`SELECT name FROM ws.staff WHERE id = $1`, [B.staff]))[0].name).toBe('Pracovník')
  })

  it('posledního aktivního pracovníka skrýt nejde', async () => {
    const [jana] = await all<{ id: string }>(`SELECT id FROM ws.staff WHERE business_id = $1 AND name = 'Jana N.'`, [A.business])
    expect(await setStaffActive(ctxA, bizA, jana.id, false)).toBe('ok')
    expect(await setStaffActive(ctxA, bizA, A.staff, false)).toBe('last')
    expect(await setStaffActive(ctxA, bizA, jana.id, true)).toBe('ok')
    expect(await setStaffActive(ctxA, bizA, B.staff, false)).toBe('not_found')
  })

  it('vrátí přepínače modulů včetně zapnutých závislostí', async () => {
    const previous = WS_MODULES.map((module) => ({
      module,
      enabled: module === 'calendar' || module === 'requests' || module === 'customers',
    }))
    await setModule(ctxA, bizA, 'taxes', true)
    const beforeUndo = await all<{ module: string; enabled: boolean }>(`SELECT module, enabled FROM ws.business_modules WHERE business_id = $1 ORDER BY module`, [A.business])
    expect(beforeUndo.find((item) => item.module === 'finance')?.enabled).toBe(true)
    await restoreModules(ctxA, bizA, previous)
    const restored = await all<{ module: string; enabled: boolean }>(`SELECT module, enabled FROM ws.business_modules WHERE business_id = $1 ORDER BY module`, [A.business])
    expect(restored.find((item) => item.module === 'finance')?.enabled).toBe(false)
    expect(restored.find((item) => item.module === 'taxes')?.enabled).toBe(false)
    expect(restored.find((item) => item.module === 'calendar')?.enabled).toBe(true)
  })

  it('vypnutá Věrnost vypne i program, Zpět ho vrátí; cizí program nezmění', async () => {
    await db.query(`INSERT INTO ws.loyalty_programs (account_id, business_id, enabled, reward_text) VALUES ($1, $2, true, 'Káva') ON CONFLICT (business_id) DO UPDATE SET enabled = true`, [A.account, A.business])
    await db.query(`INSERT INTO ws.loyalty_programs (account_id, business_id, enabled) VALUES ($1, $2, true) ON CONFLICT (business_id) DO UPDATE SET enabled = true`, [B.account, B.business])
    const program = async (business: string) => (await all<{ enabled: boolean }>(`SELECT enabled FROM ws.loyalty_programs WHERE business_id = $1`, [business]))[0].enabled
    await setModule(ctxA, bizA, 'loyalty', false)
    expect(await program(A.business)).toBe(false)
    expect(await program(B.business)).toBe(true)
    await restoreModules(ctxA, bizA, WS_MODULES.map((module) => ({ module, enabled: module === 'loyalty' })))
    expect(await program(A.business)).toBe(true)
  })
})

describe('služby a pořadí', () => {
  it('uloží, kdo službu dělá, a cizího pracovníka vynechá', async () => {
    const [jana] = await all<{ id: string }>(`SELECT id FROM ws.staff WHERE business_id = $1 AND name = 'Jana N.'`, [A.business])
    const base = { id: A.service, name: 'Služba', duration: 45, price: 300, currency: 'CZK', showOnWeb: true, buffer: 10 }
    expect(await saveService(ctxA, bizA, { ...base, staffIds: [jana.id, B.staff] })).toBe(true)
    expect(await all(`SELECT staff_id FROM ws.service_staff WHERE service_id = $1`, [A.service])).toEqual([{ staff_id: jana.id }])
    expect(await saveService(ctxA, bizA, { ...base, staffIds: [] })).toBe(true)
    expect(await all(`SELECT 1 FROM ws.service_staff WHERE service_id = $1`, [A.service])).toHaveLength(0)
    // Bez staffIds se přiřazení nemění.
    await saveService(ctxA, bizA, { ...base, staffIds: [A.staff] })
    await saveService(ctxA, bizA, base)
    expect(await all(`SELECT staff_id FROM ws.service_staff WHERE service_id = $1`, [A.service])).toEqual([{ staff_id: A.staff }])
  })

  it('nová služba s přiřazením vznikne naráz', async () => {
    expect(await saveService(ctxA, bizA, { name: 'Barva', duration: 90, price: null, currency: 'CZK', showOnWeb: true, buffer: 0, staffIds: [A.staff] })).toBe(true)
    const [row] = await all<{ id: string }>(`SELECT id FROM ws.services WHERE business_id = $1 AND name = 'Barva'`, [A.business])
    expect(await all(`SELECT staff_id FROM ws.service_staff WHERE service_id = $1`, [row.id])).toEqual([{ staff_id: A.staff }])
  })

  it('přetažení uloží pořadí a cizí položky ignoruje', async () => {
    const before = await all<{ id: string }>(`SELECT id FROM ws.services WHERE business_id = $1 ORDER BY position, created_at`, [A.business])
    const reversed = before.map((x) => x.id).reverse()
    await reorder(ctxA, bizA, 'services', [...reversed, B.service])
    const after = await all<{ id: string }>(`SELECT id FROM ws.services WHERE business_id = $1 ORDER BY position`, [A.business])
    expect(after.map((x) => x.id)).toEqual(reversed)
    const foreign = await all<{ position: number }>(`SELECT position FROM ws.services WHERE id = $1`, [B.service])
    expect(foreign[0].position).toBe(0)

    await saveStaff(ctxA, bizA, { name: 'Petr' })
    const staff = await all<{ id: string }>(`SELECT id FROM ws.staff WHERE business_id = $1 ORDER BY position, created_at`, [A.business])
    await reorder(ctxA, bizA, 'staff', staff.map((x) => x.id).reverse())
    const staffAfter = await all<{ id: string }>(`SELECT id FROM ws.staff WHERE business_id = $1 ORDER BY position`, [A.business])
    expect(staffAfter.map((x) => x.id)).toEqual(staff.map((x) => x.id).reverse())

    await reorder(ctxA, bizA, 'fields', [A.field])
    await reorder(ctxA, bizA, 'stages', [A.stage])
  })
})

describe('ceny a skrytí pracovníci', () => {
  it('cena s haléři projde i tam, kde plovoucí čárka zaokrouhlí', () => {
    for (const ok of [19.99, 0.29, 1.13, 0.07, 450.5, 249, 0]) expect(hasWholeMinor(ok)).toBe(true)
    for (const bad of [19.999, 0.001, Number.NaN, Number.POSITIVE_INFINITY]) expect(hasWholeMinor(bad)).toBe(false)
  })

  it('služba přiřazená jen skrytému pracovníkovi jde objednat u ostatních', async () => {
    const [jana] = await all<{ id: string }>(`SELECT id FROM ws.staff WHERE business_id = $1 AND name = 'Jana N.'`, [A.business])
    await saveService(ctxA, bizA, { id: A.service, name: 'Služba', duration: 45, price: 19.99, currency: 'CZK', showOnWeb: true, buffer: 0, staffIds: [jana.id] })
    expect(await setStaffActive(ctxA, bizA, jana.id, false)).toBe('ok')
    // Nastavení pak ukazuje „dělá kdokoli“ — termín bez vybraného pracovníka musí jít uložit.
    const booked = await createBooking(ctxA, bizA, { serviceId: A.service, staffId: null, start: new Date('2026-12-07T09:00:00Z'), note: null })
    expect(booked.ok).toBe(true)
    if (booked.ok) {
      const [row] = await all<{ staff_id: string }>(`SELECT staff_id FROM ws.appointments WHERE id = $1`, [booked.data.appointmentId])
      expect(row.staff_id).not.toBe(jana.id)
    }
    expect(await setStaffActive(ctxA, bizA, jana.id, true)).toBe('ok')
    await saveService(ctxA, bizA, { id: A.service, name: 'Služba', duration: 45, price: 300, currency: 'CZK', showOnWeb: true, buffer: 0, staffIds: [] })
  })
})
