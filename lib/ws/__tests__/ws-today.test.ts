import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests, wsDb } from '../db'
import type { WsContext } from '../context'
import { demoCleanupQueries, demoSeedQueries, DEMO_MARK } from '../demo-seed'
import { createAccountWithBusiness } from '../onboarding'
import { searchWorkspace } from '../search'
import { getCustomerCard, getNotifications, getRequestDetail, getTodayData, pickFocus, type FocusInvoice, type FocusVisit, type IncomingRequest } from '../today'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Obrazovka Dnes (S09) nad ukázkovými daty: co vidí účet A, co nesmí vidět
// účet B, a že ukázková data jdou vložit opakovaně a smazat bez stop.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business }
const bizB = { id: B.business }
const today = '2026-10-09' // pátek
const week = '2026-10-05'
const now = new Date('2026-10-09T06:00:00Z') // 8:00 v Praze

const scopeA = { accountId: A.account, businessId: A.business, slug: 'byznys-a', today }

async function customerId(name: string): Promise<string> {
  const [row] = await wsDb(ctxA)<{ id: string }>`SELECT id FROM ws.customers WHERE account_id = ${A.account} AND name = ${name}`
  return row.id
}

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  // Dvakrát po sobě — seed je opakovatelný.
  await wsDb(ctxA).batch(demoSeedQueries(scopeA))
  await wsDb(ctxA).batch(demoSeedQueries(scopeA))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('ukázková data', () => {
  it('vloží 6 zákazníků jen jednou, i po opakovaném spuštění', async () => {
    const rows = await wsDb(ctxA)`SELECT count(*)::int AS n FROM ws.customers WHERE account_id = ${A.account} AND note = ${DEMO_MARK}`
    expect(rows[0].n).toBe(6)
  })
})

describe('getTodayData', () => {
  it('Příchozí: jen nové poptávky, nejnovější nahoře', async () => {
    const data = await getTodayData(ctxA, bizA, { weekStart: week, now })
    // 3 ukázkové + 1 z testového seedu účtu A; vyřízená tam není
    expect(data.incomingTotal).toBe(4)
    expect(data.incoming.map((r) => r.customer_name)).toEqual(
      expect.arrayContaining(['Tereza Testová', 'Petr Zkušební', 'Eva Demo']),
    )
    expect(data.incoming.some((r) => r.customer_name === 'Marie Vzorová')).toBe(false)
    const times = data.incoming.map((r) => r.created_at.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(data.isEmpty).toBe(false)
  })

  it('kalendář týdne: termíny, blokace a poptávky s časem, nic mimo týden', async () => {
    const data = await getTodayData(ctxA, bizA, { weekStart: week, now })
    const count = (kind: string) => data.calendar.filter((e) => e.kind === kind).length
    expect(count('visit')).toBe(4) // dnes 3× + zítra Tereza; pondělí 12. 10. už je další týden
    expect(count('block')).toBe(1)
    expect(count('request')).toBe(1) // Tereza v neděli; Petr až v úterý dalšího týdne
    const req = data.calendar.find((e) => e.kind === 'request')!
    expect(req.end.getTime() - req.start.getTime()).toBe(60 * 60_000)
  })

  it('nový účet bez dat je prázdný (jeden úkol místo tří sloupců)', async () => {
    const { accountId } = await createAccountWithBusiness({
      orgId: 'org_dnes_prazdny',
      name: 'Zámečnictví Prázdné',
      industry: 'zamecnictvi',
      owner: { userId: 'user_p', name: null, email: null },
    })
    const ctx: WsContext = { userId: 'user_p', accountId, role: 'owner' }
    const [biz] = await wsDb(ctx)<{ id: string }>`SELECT id FROM ws.businesses WHERE account_id = ${accountId}`
    const data = await getTodayData(ctx, biz, { weekStart: week, now })
    expect(data).toMatchObject({ isEmpty: true, incoming: [], calendar: [], focus: { kind: 'none' } })
    expect(data.services.length).toBeGreaterThan(0)
  })
})

const request = { id: 'r1', customer_name: 'Jana' } as IncomingRequest
const visit = { id: 'v1', customer_name: 'Petr' } as FocusVisit
const invoice = { id: 'i1', number: '2026-000001' } as FocusInvoice

describe('hlavní věc nahoře (pickFocus)', () => {
  it('pořadí: poptávka, pak dnešní termín, pak faktura po splatnosti, pak nic', () => {
    expect(pickFocus({ request, visit, invoice })).toEqual({ kind: 'request', request })
    expect(pickFocus({ request: null, visit, invoice })).toEqual({ kind: 'visit', visit })
    expect(pickFocus({ request: null, visit: null, invoice })).toEqual({ kind: 'invoice', invoice })
    expect(pickFocus({ request: null, visit: null, invoice: null })).toEqual({ kind: 'none' })
  })
})

describe('hlavní věc v datech Dnes', () => {
  it('je nejdéle čekající nová poptávka, i když ji seznam Příchozích nezobrazí, a nezávisí na týdnu', async () => {
    const [oldest] = await wsDb(ctxA)<{ id: string; created_at: Date }>`
      SELECT id, created_at FROM ws.requests
      WHERE account_id = ${A.account} AND business_id = ${A.business} AND status = 'new' AND NOT is_test
      ORDER BY created_at, id LIMIT 1`
    const thisWeek = await getTodayData(ctxA, bizA, { weekStart: week, now })
    const otherWeek = await getTodayData(ctxA, bizA, { weekStart: '2027-01-04', now })
    expect(thisWeek.focus).toMatchObject({ kind: 'request', request: { id: oldest.id } })
    expect(otherWeek.focus).toEqual(thisWeek.focus)
    // nejstarší je opravdu na konci seznamu od nejnovější
    expect(thisWeek.incoming[thisWeek.incoming.length - 1].id).toBe(oldest.id)
  })

  it('bez poptávky je to nejbližší dnešní termín, který ještě neskončil', async () => {
    const { accountId } = await createAccountWithBusiness({
      orgId: 'org_dnes_termin',
      name: 'Zámečnictví Termín',
      industry: 'zamecnictvi',
      owner: { userId: 'user_t', name: null, email: null },
    })
    const ctx: WsContext = { userId: 'user_t', accountId, role: 'owner' }
    const [biz] = await wsDb(ctx)<{ id: string }>`SELECT id FROM ws.businesses WHERE account_id = ${accountId}`
    const [staff] = await wsDb(ctx)<{ id: string }>`INSERT INTO ws.staff (account_id, business_id, name) VALUES (${accountId}, ${biz.id}, 'Já') RETURNING id`
    const [cust] = await wsDb(ctx)<{ id: string }>`INSERT INTO ws.customers (account_id, name) VALUES (${accountId}, 'Marta Dnešní') RETURNING id`
    const add = (from: string, to: string, status = 'confirmed', who: string | null = cust.id) =>
      wsDb(ctx)`INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, customer_id, starts_at, ends_at, status)
        VALUES (${accountId}, ${biz.id}, 'visit', ${staff.id}, ${who}, ${from}, ${to}, ${status})`
    // now = 8:00 v Praze. Skončil v 7:00, zrušený v 8:30, zítra, a dnes v 10:00 (hledaný).
    await add('2026-10-09T04:00:00Z', '2026-10-09T05:00:00Z')
    await add('2026-10-09T06:30:00Z', '2026-10-09T07:30:00Z', 'cancelled', null)
    await add('2026-10-10T07:00:00Z', '2026-10-10T08:00:00Z')
    await add('2026-10-09T08:00:00Z', '2026-10-09T09:00:00Z')
    const data = await getTodayData(ctx, biz, { weekStart: week, now })
    expect(data.focus).toMatchObject({ kind: 'visit', visit: { customer_name: 'Marta Dnešní' } })
    if (data.focus.kind !== 'visit') throw new Error('očekávám termín')
    expect(data.focus.visit.start.toISOString()).toBe('2026-10-09T08:00:00.000Z')
    // Po skončení posledního dnešního termínu už není co ukázat.
    const evening = await getTodayData(ctx, biz, { weekStart: week, now: new Date('2026-10-09T10:00:00Z') })
    expect(evening.focus).toEqual({ kind: 'none' })

    // Faktura po splatnosti se ukáže jen se zapnutou funkcí Faktury; zaplacená a koncept ne.
    const inv = (number: string, status: string, due: string, paid: string | null) =>
      wsDb(ctx)`INSERT INTO ws.invoices (account_id, business_id, direction, number, customer_id, amount, currency, status, issued_on, due_on, paid_on)
        VALUES (${accountId}, ${biz.id}, 'issued', ${number}, ${cust.id}, 1850, 'CZK', ${status}, '2026-09-01', ${due}, ${paid})`
    await inv('2026-000001', 'paid', '2026-09-15', '2026-09-20')
    await inv('2026-000002', 'draft', '2026-09-15', null)
    await inv('2026-000003', 'issued', '2026-10-20', null)
    await inv('2026-000004', 'issued', '2026-09-20', null)
    await inv('2026-000005', 'issued', '2026-10-01', null)
    expect((await getTodayData(ctx, biz, { weekStart: week, now: new Date('2026-10-09T10:00:00Z') })).focus).toEqual({ kind: 'none' })
    const withInvoices = await getTodayData(ctx, biz, { weekStart: week, now: new Date('2026-10-09T10:00:00Z'), invoices: true })
    expect(withInvoices.focus).toMatchObject({
      kind: 'invoice',
      invoice: { number: '2026-000004', customer_name: 'Marta Dnešní', amount: 1850, currency: 'CZK', due_on: '2026-09-20', total: 2 },
    })
    // Dnešní termín má před fakturou přednost.
    expect((await getTodayData(ctx, biz, { weekStart: week, now, invoices: true })).focus.kind).toBe('visit')
  })
})

describe('karta zákazníka a detail poptávky', () => {
  it('Jana: stálá, 3 návštěvy, příští termín dnes, razítka', async () => {
    const card = await getCustomerCard(ctxA, bizA, await customerId('Jana Ukázková'), now)
    expect(card).toMatchObject({ name: 'Jana Ukázková', segment: 'regular', visits: 3 })
    expect(card?.nextVisit?.start.toISOString()).toBe('2026-10-09T07:00:00.000Z')
    expect(card?.loyalty).toMatchObject({ stamps: 4, needed: 5 })
  })

  it('detail poptávky se zprávou a kontaktem', async () => {
    const [req] = await wsDb(ctxA)<{ id: string }>`SELECT id FROM ws.requests WHERE account_id = ${A.account} AND external_id = 'ws-seed-2'`
    const detail = await getRequestDetail(ctxA, bizA, req.id)
    expect(detail).toMatchObject({ customer_name: 'Petr Zkušební', message: 'Šlo by to i odpoledne?', status: 'new' })
    expect(detail?.contact.phone).toBe('+420000000103')
  })

  it('upozornění pro zvonek s odkazem na poptávku', async () => {
    const { items, unread } = await getNotifications(ctxA, bizA)
    expect(unread).toBeGreaterThanOrEqual(1)
    expect(items.find((n) => n.title === 'Nová poptávka' && n.link)?.link).toMatch(/^\/w\/byznys-a\?detail=poptavka:[0-9a-f-]{36}$/)
  })
})

describe('oddělení účtů', () => {
  it('účet B nevidí kartu, poptávku ani Dnes účtu A — ani s jeho byznysem v ruce', async () => {
    const jana = await customerId('Jana Ukázková')
    const [req] = await wsDb(ctxA)<{ id: string }>`SELECT id FROM ws.requests WHERE account_id = ${A.account} AND external_id = 'ws-seed-1'`
    expect(await getCustomerCard(ctxB, bizB, jana)).toBeNull()
    expect(await getCustomerCard(ctxB, bizA, jana)).toBeNull()
    expect(await getRequestDetail(ctxB, bizA, req.id)).toBeNull()
    // poptávka účtu A přes jiný byznys téhož účtu taky ne
    expect(await getRequestDetail(ctxA, bizB, req.id)).toBeNull()
    const data = await getTodayData(ctxB, bizA, { weekStart: week, now, invoices: true })
    expect(data.incoming).toEqual([])
    expect(data.calendar).toEqual([])
    expect(data.focus).toEqual({ kind: 'none' })
    expect(await searchWorkspace(ctxB, bizB, 'Ukázková')).toEqual([])
  })
})

describe('hledání ⌘K', () => {
  it('najde zákazníka podle jména, telefonu bez mezer i poptávku', async () => {
    const hits = await searchWorkspace(ctxA, bizA, 'tereza')
    expect(hits.find((h) => h.kind === 'zakaznik')?.title).toBe('Tereza Testová')
    expect(hits.some((h) => h.kind === 'poptavka' && h.title === 'Tereza Testová')).toBe(true)
    expect((await searchWorkspace(ctxA, bizA, '000 000 104')).map((h) => h.title)).toContain('Marie Vzorová')
  })

  it('zástupné znaky se berou doslova, krátký dotaz nic nehledá', async () => {
    expect(await searchWorkspace(ctxA, bizA, '%%')).toEqual([])
    expect(await searchWorkspace(ctxA, bizA, 'a')).toEqual([])
  })
})

describe('smazání ukázkových dat', () => {
  it('smaže jen ukázku, data účtu zůstanou', async () => {
    await wsDb(ctxA).batch(demoCleanupQueries(scopeA))
    const ws = wsDb(ctxA)
    const [demo] = await ws`SELECT count(*)::int AS n FROM ws.customers WHERE account_id = ${A.account} AND note = ${DEMO_MARK}`
    const [own] = await ws`SELECT count(*)::int AS n FROM ws.customers WHERE account_id = ${A.account} AND id = ${A.customer}`
    const [reqs] = await ws`SELECT count(*)::int AS n FROM ws.requests WHERE account_id = ${A.account}`
    const [appts] = await ws`SELECT count(*)::int AS n FROM ws.appointments WHERE account_id = ${A.account}`
    const [staff] = await ws`SELECT count(*)::int AS n FROM ws.staff WHERE account_id = ${A.account}`
    expect({ demo: demo.n, own: own.n, reqs: reqs.n, appts: appts.n, staff: staff.n }).toEqual({ demo: 0, own: 1, reqs: 1, appts: 1, staff: 1 })
  })
})
