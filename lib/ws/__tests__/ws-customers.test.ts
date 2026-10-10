import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { getCustomerDetail, getCustomersList, mergeCustomers, nextBirthday, nextStepFor, updateCustomer } from '../customers'
import { adjustStamps } from '../loyalty'
import { parseDetail, detailValue } from '../detail-param'
import { draftMessage, getDrafts, getOutreachSuggestions, saveDraft, setDraftDiscarded } from '../outreach'
import { recomputeSegments } from '../segments'
import { addDays } from '../time'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Zákazníci (S12): seznam a filtry, úprava s duplicitou, sloučení duplicit
// a panel „Komu napsat“ — nikdy nikoho bez souhlasu.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business }
const bizB = { id: B.business }
const now = new Date('2026-10-10T08:00:00Z')
const today = '2026-10-10'

let seq = 0
let staff = ''

type CustomerOpts = {
  phone?: string | null
  email?: string | null
  consent?: boolean
  unsubscribed?: boolean
  ended?: boolean
  birthday?: string | null
  visitsAgo?: number[]
}

async function customer(name: string, o: CustomerOpts = {}): Promise<string> {
  seq++
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ws.customers (account_id, name, phone, email, contact_consent_at, unsubscribed_at, ended_at, birthday, created_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END, CASE WHEN $6 THEN now() END, CASE WHEN $7 THEN now() END, $8::date, '2025-01-01')
     RETURNING id`,
    [A.account, name, o.phone ?? null, o.email === undefined ? `z${seq}@example.cz` : o.email, o.consent ?? false, o.unsubscribed ?? false, o.ended ?? false, o.birthday ?? null],
  )
  const id = rows[0].id
  const visits = o.visitsAgo ?? []
  for (let i = 0; i < visits.length; i++) {
    const days = visits[i]
    const start = new Date(`${addDays(today, -days)}T08:00:00Z`)
    start.setUTCMinutes(seq % 50 + i) // různé časy — kolize hlídá DB per pracovník
    await db.query(
      `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $5::timestamptz + interval '1 minute', 'completed')`,
      [A.account, A.business, staff, id, start],
    )
  }
  return id
}

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  staff = (
    await db.query<{ id: string }>(`INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, 'Testová') RETURNING id`, [A.account, A.business])
  ).rows[0].id
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('seznam zákazníků', () => {
  it('filtr podle skupiny, hledání podle telefonu bez mezer, počty', async () => {
    const regular = await customer('Stálá Seznamová', { phone: '+420777111222', visitsAgo: [10, 40, 70] })
    const sleeper = await customer('Spící Seznamová', { visitsAgo: [200, 250, 300] })
    await recomputeSegments(ctxA, bizA, { now })
    const all = await getCustomersList(ctxA, bizA, { now })
    expect(all.items.map((c) => c.id)).toEqual(expect.arrayContaining([regular, sleeper]))
    expect(all.counts.regular).toBeGreaterThanOrEqual(1)
    expect(all.counts.dormant).toBeGreaterThanOrEqual(1)

    const dormant = await getCustomersList(ctxA, bizA, { segment: 'dormant', now })
    expect(dormant.items.map((c) => c.id)).toEqual([sleeper])

    const byPhone = await getCustomersList(ctxA, bizA, { query: '777 111', now })
    expect(byPhone.items.map((c) => c.id)).toEqual([regular])
    expect(byPhone.items[0]).toMatchObject({ segment: 'regular', visits: 3 })
  })

  it('účet B nevidí zákazníky účtu A ani přes cizí byznys', async () => {
    const list = await getCustomersList(ctxB, bizA, { now })
    expect(list.items).toHaveLength(0)
    const own = await getCustomersList(ctxB, bizB, { now })
    expect(own.items.every((c) => c.id !== A.customer)).toBe(true)
    expect(await getCustomerDetail(ctxB, bizB, A.customer, now)).toBeNull()
  })
})

describe('další krok', () => {
  const base = { segment: 'regular' as const, nextVisit: null, card: null, visits: 3, lastVisit: new Date() }
  it('odměna > termín > pozvat zpět > poslední razítko', () => {
    expect(nextStepFor({ ...base, card: { stamps: 5, needed: 5, full: true } })).toEqual({ kind: 'reward' })
    expect(nextStepFor({ ...base, nextVisit: now })).toEqual({ kind: 'booked', at: now })
    expect(nextStepFor({ ...base, segment: 'dormant' })).toEqual({ kind: 'winback' })
    expect(nextStepFor({ ...base, card: { stamps: 4, needed: 5, full: false } })).toEqual({ kind: 'almost' })
    expect(nextStepFor({ ...base, segment: 'ended', card: { stamps: 5, needed: 5, full: true } })).toBeNull()
    expect(nextStepFor({ ...base, segment: null, lastVisit: null })).toEqual({ kind: 'first_visit' })
  })
})

describe('úprava a sloučení', () => {
  it('telefon jiného zákazníka → nabídne sloučení s ním', async () => {
    const first = await customer('Dvojník', { phone: '+420777000111' })
    const second = await customer('Dvojník', { phone: null })
    const res = await updateCustomer(ctxA, second, { name: 'Dvojník', phone: '+420777000111', email: null, birthday: null, note: null })
    expect(res).toEqual({ ok: false, reason: 'duplicate', other: { id: first, name: 'Dvojník' } })
    const detail = await getCustomerDetail(ctxA, bizA, second, now)
    expect(detail?.duplicates.map((d) => d.id)).toContain(first)
  })

  it('sloučení přesune návštěvy, sečte razítka, doplní kontakt a duplikát smaže', async () => {
    const keep = await customer('Slučovaná', { phone: '+420777000222', email: null, visitsAgo: [5] })
    const drop = await customer('Slučovaná', { phone: null, email: 'slucovana@example.cz', consent: true, visitsAgo: [60] })
    await adjustStamps(ctxA, bizA, { customerId: keep, delta: 1, reason: 'Test' })
    await adjustStamps(ctxA, bizA, { customerId: drop, delta: 1, reason: 'Test' })
    await adjustStamps(ctxA, bizA, { customerId: drop, delta: 1, reason: 'Test' })

    expect(await mergeCustomers(ctxA, keep, drop)).toBe(true)
    const c = (await db.query(`SELECT phone, email, contact_consent_at FROM ws.customers WHERE id = $1`, [keep])).rows[0] as Record<string, unknown>
    expect(c.phone).toBe('+420777000222')
    expect(c.email).toBe('slucovana@example.cz')
    expect(c.contact_consent_at).not.toBeNull()
    expect((await db.query(`SELECT 1 FROM ws.customers WHERE id = $1`, [drop])).rows).toHaveLength(0)
    const visits = await db.query(`SELECT 1 FROM ws.appointments WHERE customer_id = $1`, [keep])
    expect(visits.rows).toHaveLength(2)
    const card = (await db.query<{ stamps: number }>(`SELECT stamps FROM ws.loyalty_cards WHERE customer_id = $1 AND status = 'active'`, [keep])).rows
    expect(card).toEqual([{ stamps: 3 }])
    const audit = await db.query(`SELECT details FROM ws.audit_log WHERE action = 'customer.merge' AND entity_id = $1`, [keep])
    expect(audit.rows).toEqual([{ details: { merged_id: drop } }])
  })

  it('cizí účet ani sám se sebou sloučit nejde', async () => {
    const mine = await customer('Moje')
    expect(await mergeCustomers(ctxA, mine, mine)).toBe(false)
    expect(await mergeCustomers(ctxA, mine, B.customer)).toBe(false)
    expect(await mergeCustomers(ctxB, B.customer, mine)).toBe(false)
    expect((await db.query(`SELECT 1 FROM ws.customers WHERE id = ANY($1::uuid[])`, [[mine, B.customer]])).rows).toHaveLength(2)
  })
})

describe('Komu napsat', () => {
  it('neukáže nikoho bez souhlasu, odhlášeného, ukončeného ani bez e-mailu', async () => {
    const ok = await customer('Spící Souhlas', { consent: true, visitsAgo: [200, 250, 300] })
    const noConsent = await customer('Spící Bez', { consent: false, visitsAgo: [201, 251, 301] })
    const unsub = await customer('Spící Odhlášená', { consent: true, unsubscribed: true, visitsAgo: [202, 252, 302] })
    const ended = await customer('Spící Ukončená', { consent: true, ended: true, visitsAgo: [203, 253, 303] })
    const noMail = await customer('Spící Bez Mailu', { consent: true, email: null, visitsAgo: [204, 254, 304] })
    await recomputeSegments(ctxA, bizA, { now })
    const ids = (await getOutreachSuggestions(ctxA, bizA, now)).map((s) => s.customerId)
    expect(ids).toContain(ok)
    for (const id of [noConsent, unsub, ended, noMail]) expect(ids).not.toContain(id)
  })

  it('narozeniny do 7 dní ano, za 8 ne; karta 4/5', async () => {
    // zákazníci byznysu (jedna stará návštěva — jinak by do byznysu nepatřili)
    const soon = await customer('Narozeninová', { consent: true, birthday: '1990-10-17', visitsAgo: [100] })
    const later = await customer('Pozdější', { consent: true, birthday: '1990-10-18', visitsAgo: [101] })
    const almost = await customer('Skoro Plná', { consent: true })
    for (let i = 0; i < 4; i++) await adjustStamps(ctxA, bizA, { customerId: almost, delta: 1, reason: 'Test' })
    const list = await getOutreachSuggestions(ctxA, bizA, now)
    expect(list.find((s) => s.customerId === soon)).toMatchObject({ kind: 'birthday' })
    expect(list.find((s) => s.customerId === later)).toBeUndefined()
    expect(list.find((s) => s.customerId === almost)).toMatchObject({ kind: 'almost' })
  })

  it('koncept uloží jen se souhlasem; připravený návrh se 30 dní neopakuje', async () => {
    const ok = await customer('Na Koncept', { consent: true, visitsAgo: [210, 260, 310] })
    const no = await customer('Bez Konceptu', { consent: false })
    await recomputeSegments(ctxA, bizA, { customerIds: [ok], now })
    expect(await saveDraft(ctxA, bizA, { customerId: no, kind: 'winback', subject: 'Ahoj', body: 'Text' })).toBe(false)
    expect(await saveDraft(ctxB, bizB, { customerId: ok, kind: 'winback', subject: 'Ahoj', body: 'Text' })).toBe(false)
    expect(await saveDraft(ctxA, bizA, { customerId: ok, kind: 'winback', subject: 'Dlouho jsme se neviděli', body: 'Text' })).toBe(true)
    const msg = (await db.query(`SELECT status, channel, type, to_address FROM ws.outbound_messages WHERE customer_id = $1`, [ok])).rows
    expect(msg).toEqual([{ status: 'draft', channel: 'email', type: 'outreach_winback', to_address: expect.stringContaining('@example.cz') }])
    expect((await db.query(`SELECT 1 FROM ws.outbound_messages WHERE customer_id = $1`, [no])).rows).toHaveLength(0)
    expect((await getOutreachSuggestions(ctxA, bizA, now)).some((s) => s.customerId === ok)).toBe(false)

    const drafts = await getDrafts(ctxA, bizA)
    const draft = drafts.find((d) => d.customerId === ok)!
    expect(await setDraftDiscarded(ctxA, bizA, draft.id, true)).toBe(true)
    expect((await getDrafts(ctxA, bizA)).some((d) => d.id === draft.id)).toBe(false)
    expect(await setDraftDiscarded(ctxA, bizA, draft.id, false)).toBe(true)
    expect(await setDraftDiscarded(ctxB, bizB, draft.id, true)).toBe(false)
  })

  it('text zprávy: volné termíny pro Spící, odměna pro skoro plnou kartu', () => {
    const winback = draftMessage('winback', {
      businessName: 'Salon',
      reward: null,
      orderUrl: 'https://zakaziq.cz/r/salon',
      slots: [new Date('2026-10-16T07:00:00Z')],
    })
    expect(winback.body).toContain('pá 16. 10. v 9:00')
    expect(winback.body).toContain('https://zakaziq.cz/r/salon')
    expect(winback.body.endsWith('Salon')).toBe(true)
    expect(draftMessage('almost', { businessName: 'Salon', reward: 'Střih zdarma', orderUrl: 'x', slots: [] }).body).toContain('Střih zdarma')
  })
})

describe('narozeniny', () => {
  it('letos, příští rok a 29. 2. v nepřestupném roce', () => {
    expect(nextBirthday('1990-10-10', '2026-10-10')).toEqual({ date: '2026-10-10', inDays: 0 })
    expect(nextBirthday('1990-10-09', '2026-10-10')).toEqual({ date: '2027-10-09', inDays: 364 })
    expect(nextBirthday('2000-02-29', '2026-02-20')).toEqual({ date: '2026-02-28', inDays: 8 })
    expect(nextBirthday('2000-02-29', '2028-02-20')).toEqual({ date: '2028-02-29', inDays: 9 })
  })
})

describe('panel zprávy v URL', () => {
  it('zprava:<id>:<druh> tam i zpět, neznámý druh nic', () => {
    const id = A.customer
    expect(parseDetail(`zprava:${id}:winback`)).toEqual({ kind: 'zprava', id, topic: 'winback' })
    expect(detailValue({ kind: 'zprava', id, topic: 'almost' })).toBe(`zprava:${id}:almost`)
    expect(parseDetail(`zprava:${id}:sleva`)).toBeNull()
    expect(parseDetail(`zprava:${id}`)).toBeNull()
  })
})
