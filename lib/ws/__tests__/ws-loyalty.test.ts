import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import {
  adjustStamps,
  completeVisit,
  DEFAULT_PROGRAM,
  expireCards,
  getVisitPayment,
  redeemReward,
  stampJob,
  stampsForPayment,
  stampVisitManually,
  type LoyaltyProgram,
} from '../loyalty'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Věrnostní karty (S12): zaplacená návštěva přidá právě jedno razítko, plná
// karta nabídne odměnu, všechna pravidla včetně hranic (minimální útrata,
// 1 denně podle pražského dne, platnost, opakované zaplacení).

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business }
const bizB = { id: B.business }

let seq = 0

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params)
  return rows[0]
}

/** Nový zákazník a pracovník účtu A — testy se navzájem neovlivní (kolize termínů jsou per pracovník). */
async function fresh(): Promise<{ customer: string; staff: string }> {
  seq++
  const c = await one<{ id: string }>(`INSERT INTO ws.customers (account_id, name) VALUES ($1, $2) RETURNING id`, [A.account, `Věrná ${seq}`])
  const s = await one<{ id: string }>(`INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, $3) RETURNING id`, [
    A.account,
    A.business,
    `Pracovnice ${seq}`,
  ])
  return { customer: c.id, staff: s.id }
}

async function visit(who: { customer: string; staff: string }, startIso: string, service: string | null = A.service): Promise<string> {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + 60 * 60_000)
  const row = await one<{ id: string }>(
    `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, service_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [A.account, A.business, who.staff, who.customer, service, start, end],
  )
  return row.id
}

async function setProgram(patch: Record<string, unknown>) {
  const keys = Object.keys(patch)
  if (keys.length === 0) return
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
  await db.query(`UPDATE ws.loyalty_programs SET ${sets} WHERE id = $1`, [A.program, ...keys.map((k) => patch[k])])
}

async function card(customer: string) {
  return one<{ id: string; stamps: number; status: string } | undefined>(
    `SELECT id, stamps, status FROM ws.loyalty_cards WHERE customer_id = $1 AND status IN ('active', 'full')`,
    [customer],
  )
}

const pay = (appointmentId: string, amount = 500, extra: { redeem?: boolean } = {}) =>
  completeVisit(ctxA, bizA, { appointmentId, amount, method: 'cash', ...extra })

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

beforeEach(async () => {
  await setProgram({
    enabled: true,
    stamps_needed: 5,
    reward_text: 'Střih zdarma',
    counts: 'visit_paid',
    amount_per_stamp: null,
    service_ids: '{}',
    min_spend: null,
    max_one_per_day: true,
    validity_months: null,
    auto_stamp: true,
  })
})

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('stampsForPayment (pravidla bez DB)', () => {
  const program = (patch: Partial<LoyaltyProgram>): LoyaltyProgram => ({ ...DEFAULT_PROGRAM, enabled: true, ...patch })
  const visitPay = (amount: number | null, serviceId: string | null = 's1') => ({ source: 'visit' as const, amount, serviceId })

  it('vypnutý program nedá nic', () => {
    expect(stampsForPayment({ ...DEFAULT_PROGRAM, enabled: false }, visitPay(1000))).toBe(0)
  })

  it('zaplacená návštěva = 1 razítko, zakázka ne', () => {
    expect(stampsForPayment(program({}), visitPay(100))).toBe(1)
    expect(stampsForPayment(program({}), { source: 'job', amount: 100, serviceId: null })).toBe(0)
  })

  it('dokončená zakázka = 1 razítko, návštěva ne', () => {
    expect(stampsForPayment(program({ counts: 'job_done' }), { source: 'job', amount: null, serviceId: null })).toBe(1)
    expect(stampsForPayment(program({ counts: 'job_done' }), visitPay(100))).toBe(0)
  })

  it('minimální útrata: přesně minimum projde, o haléř méně ne', () => {
    const p = program({ minSpend: 500 })
    expect(stampsForPayment(p, visitPay(500))).toBe(1)
    expect(stampsForPayment(p, visitPay(499.99))).toBe(0)
    expect(stampsForPayment(p, visitPay(null))).toBe(0)
    expect(stampsForPayment(program({ minSpend: 0 }), visitPay(0))).toBe(1)
  })

  it('jen vybrané služby', () => {
    const p = program({ serviceIds: ['s1'] })
    expect(stampsForPayment(p, visitPay(100, 's1'))).toBe(1)
    expect(stampsForPayment(p, visitPay(100, 's2'))).toBe(0)
    expect(stampsForPayment(p, visitPay(100, null))).toBe(0)
  })

  it('každých X Kč: dolů zaokrouhlené, počítá v haléřích', () => {
    const p = program({ counts: 'amount', amountPerStamp: 500 })
    expect(stampsForPayment(p, visitPay(1999))).toBe(3)
    expect(stampsForPayment(p, visitPay(2000))).toBe(4)
    expect(stampsForPayment(p, visitPay(499.99))).toBe(0)
    expect(stampsForPayment(program({ counts: 'amount', amountPerStamp: 0.1 }), visitPay(0.3))).toBe(3)
    expect(stampsForPayment(p, { source: 'job', amount: 5000, serviceId: null })).toBe(0)
  })
})

describe('zaplacená návštěva', () => {
  it('přidá právě jedno razítko a zapíše příjem', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-02T09:00:00Z')
    const res = await pay(id, 650)
    expect(res).toMatchObject({ ok: true, data: { stamp: { result: 'added', added: 1, stamps: 1, needed: 5, full: false } } })
    const appt = await one<{ status: string; completed_at: Date | null }>(`SELECT status, completed_at FROM ws.appointments WHERE id = $1`, [id])
    expect(appt.status).toBe('completed')
    expect(appt.completed_at).not.toBeNull()
    const tx = await db.query<{ amount: string; payment_method: string; customer_id: string }>(
      `SELECT amount, payment_method, customer_id FROM ws.transactions WHERE appointment_id = $1`,
      [id],
    )
    expect(tx.rows).toEqual([{ amount: '650.00', payment_method: 'cash', customer_id: who.customer }])
    expect((await card(who.customer))?.stamps).toBe(1)
  })

  it('opakované zaplacení nic nepřidá (ani razítko, ani druhý příjem)', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-03T09:00:00Z')
    expect((await pay(id)).ok).toBe(true)
    expect(await pay(id)).toEqual({ ok: false, reason: 'already_done' })
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ws.transactions WHERE appointment_id = $1`, [id])
    expect(n.n).toBe(1)
    expect((await card(who.customer))?.stamps).toBe(1)
  })

  it('souběžné zaplacení téhož termínu projde jen jednou', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-04T09:00:00Z')
    const results = await Promise.all([pay(id), pay(id), pay(id)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const ev = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ws.loyalty_events WHERE appointment_id = $1 AND kind = 'stamp'`, [id])
    expect(ev.n).toBe(1)
    expect((await card(who.customer))?.stamps).toBe(1)
  })

  it('zrušený termín ani blokace zaplatit nejde', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-05T09:00:00Z')
    await db.query(`UPDATE ws.appointments SET status = 'cancelled' WHERE id = $1`, [id])
    expect(await pay(id)).toEqual({ ok: false, reason: 'cancelled' })
    const block = await one<{ id: string }>(
      `INSERT INTO ws.appointments (account_id, business_id, kind, starts_at, ends_at) VALUES ($1, $2, 'block', '2026-11-05T12:00Z', '2026-11-05T13:00Z') RETURNING id`,
      [A.account, A.business],
    )
    expect(await pay(block.id)).toEqual({ ok: false, reason: 'block' })
  })

  it('nula Kč (návštěva zdarma) dá razítko, ale příjem nezapíše', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-06T09:00:00Z')
    expect(await pay(id, 0)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ws.transactions WHERE appointment_id = $1`, [id])
    expect(n.n).toBe(0)
  })

  it('cizí účet termín nezaplatí a nic se nezmění', async () => {
    const who = await fresh()
    const id = await visit(who, '2026-11-07T09:00:00Z')
    expect(await completeVisit(ctxB, bizB, { appointmentId: id, amount: 500, method: 'card' })).toEqual({ ok: false, reason: 'not_found' })
    expect(await completeVisit(ctxB, bizA, { appointmentId: id, amount: 500, method: 'card' })).toEqual({ ok: false, reason: 'not_found' })
    const appt = await one<{ status: string }>(`SELECT status FROM ws.appointments WHERE id = $1`, [id])
    expect(appt.status).toBe('confirmed')
    expect(await card(who.customer)).toBeUndefined()
  })
})

describe('pravidla razítek', () => {
  it('nejvýš 1 razítko za pražský den návštěvy', async () => {
    const who = await fresh()
    const morning = await visit(who, '2026-11-10T08:00:00Z')
    const afternoon = await visit(who, '2026-11-10T14:00:00Z')
    const nextDay = await visit(who, '2026-11-11T08:00:00Z')
    expect(await pay(morning)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
    expect(await pay(afternoon)).toMatchObject({ ok: true, data: { stamp: { result: 'same_day' } } })
    expect(await pay(nextDay)).toMatchObject({ ok: true, data: { stamp: { result: 'added', stamps: 2 } } })
  })

  it('den se počítá v pražském čase: 23:30 a 0:30 jsou dva dny', async () => {
    const who = await fresh()
    // 20. 10. 2026 je ještě letní čas (UTC+2): 21:30Z = 23:30, 22:30Z = 0:30 dalšího dne
    const late = await visit(who, '2026-10-20T21:30:00Z')
    const afterMidnight = await visit(who, '2026-10-20T22:30:00Z')
    expect(await pay(late)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
    expect(await pay(afterMidnight)).toMatchObject({ ok: true, data: { stamp: { result: 'added', stamps: 2 } } })
    const days = await db.query<{ for_day: string }>(
      `SELECT for_day::text FROM ws.loyalty_events WHERE appointment_id = ANY($1::uuid[]) ORDER BY for_day`,
      [[late, afterMidnight]],
    )
    expect(days.rows.map((r) => r.for_day)).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('a naopak: 0:30 a 23:00 téhož pražského dne jsou jeden den (v zimě)', async () => {
    const who = await fresh()
    // 15. 12. 2026 je zimní čas (UTC+1): 14. 12. 23:30Z = 15. 12. 0:30, 15. 12. 22:00Z = 23:00
    const first = await visit(who, '2026-12-14T23:30:00Z')
    const second = await visit(who, '2026-12-15T22:00:00Z')
    expect(await pay(first)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
    expect(await pay(second)).toMatchObject({ ok: true, data: { stamp: { result: 'same_day' } } })
  })

  it('bez omezení „1 denně“ dostane každá návštěva razítko', async () => {
    await setProgram({ max_one_per_day: false })
    const who = await fresh()
    const a = await visit(who, '2026-11-12T08:00:00Z')
    const b = await visit(who, '2026-11-12T14:00:00Z')
    await pay(a)
    expect(await pay(b)).toMatchObject({ ok: true, data: { stamp: { result: 'added', stamps: 2 } } })
  })

  it('minimální útrata: 499,99 Kč nic, 500 Kč razítko', async () => {
    await setProgram({ min_spend: 500 })
    const who = await fresh()
    const low = await visit(who, '2026-11-13T08:00:00Z')
    const ok = await visit(who, '2026-11-14T08:00:00Z')
    expect(await pay(low, 499.99)).toMatchObject({ ok: true, data: { stamp: null } })
    expect(await pay(ok, 500)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
  })

  it('jen vybrané služby', async () => {
    const other = await one<{ id: string }>(`INSERT INTO ws.services (account_id, business_id, name) VALUES ($1, $2, 'Jiná') RETURNING id`, [
      A.account,
      A.business,
    ])
    await setProgram({ service_ids: `{${A.service}}` })
    const who = await fresh()
    const no = await visit(who, '2026-11-15T08:00:00Z', other.id)
    const yes = await visit(who, '2026-11-16T08:00:00Z', A.service)
    expect(await pay(no)).toMatchObject({ ok: true, data: { stamp: null } })
    expect(await pay(yes)).toMatchObject({ ok: true, data: { stamp: { result: 'added' } } })
  })

  it('každých 500 Kč: 1 600 Kč = 3 razítka, s „1 denně“ jen 1', async () => {
    await setProgram({ counts: 'amount', amount_per_stamp: 500, max_one_per_day: false })
    const who = await fresh()
    expect(await pay(await visit(who, '2026-11-17T08:00:00Z'), 1600)).toMatchObject({ ok: true, data: { stamp: { added: 3, stamps: 3 } } })
    await setProgram({ max_one_per_day: true })
    expect(await pay(await visit(who, '2026-11-18T08:00:00Z'), 1600)).toMatchObject({ ok: true, data: { stamp: { added: 1, stamps: 4 } } })
  })

  it('přebytek nad plnou kartu propadá', async () => {
    await setProgram({ counts: 'amount', amount_per_stamp: 100, max_one_per_day: false })
    const who = await fresh()
    expect(await pay(await visit(who, '2026-11-19T08:00:00Z'), 900)).toMatchObject({
      ok: true,
      data: { stamp: { added: 5, stamps: 5, full: true } },
    })
    expect((await card(who.customer))?.status).toBe('full')
  })

  it('plná karta: další razítko nepřibude, odměna se uplatní a začne nová karta', async () => {
    await setProgram({ stamps_needed: 2 })
    const who = await fresh()
    await pay(await visit(who, '2026-11-20T08:00:00Z'))
    expect(await pay(await visit(who, '2026-11-21T08:00:00Z'))).toMatchObject({ ok: true, data: { stamp: { stamps: 2, full: true } } })
    const third = await visit(who, '2026-11-22T08:00:00Z')
    expect((await getVisitPayment(ctxA, bizA, third))?.rewardReady).toBe(true)
    expect(await pay(third, 0, { redeem: true })).toMatchObject({ ok: true, data: { stamp: null, redeemed: true } })
    expect(await card(who.customer)).toBeUndefined()
    const redeemed = await one<{ status: string; redeemed_at: Date | null }>(
      `SELECT status, redeemed_at FROM ws.loyalty_cards WHERE customer_id = $1`,
      [who.customer],
    )
    expect(redeemed.status).toBe('redeemed')
    expect(await pay(await visit(who, '2026-11-23T08:00:00Z'))).toMatchObject({ ok: true, data: { stamp: { stamps: 1 } } })
    const cards = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ws.loyalty_cards WHERE customer_id = $1`, [who.customer])
    expect(cards.n).toBe(2)
  })

  it('bez plné karty se odměna neuplatní a návštěva razítko nedostane', async () => {
    const who = await fresh()
    expect(await pay(await visit(who, '2026-11-24T08:00:00Z'), 100, { redeem: true })).toMatchObject({
      ok: true,
      data: { stamp: null, redeemed: false },
    })
  })

  it('platnost: rozpracovaná karta po platnosti propadne, razítko začne novou', async () => {
    await setProgram({ validity_months: 6 })
    const who = await fresh()
    await pay(await visit(who, '2026-11-25T08:00:00Z'))
    await pay(await visit(who, '2026-11-26T08:00:00Z'))
    const old = await card(who.customer)
    await db.query(`UPDATE ws.loyalty_cards SET created_at = now() - interval '7 months' WHERE id = $1`, [old!.id])
    expect(await pay(await visit(who, '2026-11-27T08:00:00Z'))).toMatchObject({ ok: true, data: { stamp: { stamps: 1 } } })
    const expired = await one<{ status: string }>(`SELECT status FROM ws.loyalty_cards WHERE id = $1`, [old!.id])
    expect(expired.status).toBe('expired')
    const ev = await one<{ delta: number }>(`SELECT delta FROM ws.loyalty_events WHERE card_id = $1 AND kind = 'expire'`, [old!.id])
    expect(ev.delta).toBe(-2)
  })

  it('platnost: těsně před koncem karta platí; denní úklid propadlé karty ukončí', async () => {
    await setProgram({ validity_months: 6 })
    const who = await fresh()
    await pay(await visit(who, '2026-11-28T08:00:00Z'))
    const c = await card(who.customer)
    await db.query(`UPDATE ws.loyalty_cards SET created_at = now() - interval '6 months' + interval '1 hour' WHERE id = $1`, [c!.id])
    expect(await pay(await visit(who, '2026-11-29T08:00:00Z'))).toMatchObject({ ok: true, data: { stamp: { stamps: 2 } } })
    await db.query(`UPDATE ws.loyalty_cards SET created_at = now() - interval '6 months' - interval '1 hour' WHERE id = $1`, [c!.id])
    expect(await expireCards(ctxA, bizA)).toBeGreaterThanOrEqual(1)
    expect(await card(who.customer)).toBeUndefined()
  })

  it('plná karta platností nepropadá', async () => {
    await setProgram({ validity_months: 1, stamps_needed: 1 })
    const who = await fresh()
    await pay(await visit(who, '2026-11-30T08:00:00Z'))
    const c = await card(who.customer)
    await db.query(`UPDATE ws.loyalty_cards SET created_at = now() - interval '2 months' WHERE id = $1`, [c!.id])
    await expireCards(ctxA, bizA)
    expect((await card(who.customer))?.status).toBe('full')
  })

  it('vypnutý program: platba projde, razítko ne', async () => {
    await setProgram({ enabled: false })
    const who = await fresh()
    expect(await pay(await visit(who, '2026-12-01T08:00:00Z'))).toMatchObject({ ok: true, data: { stamp: null } })
    expect(await card(who.customer)).toBeUndefined()
  })

  it('ruční razítkování: po zaplacení nic, „Dát razítko“ jednou', async () => {
    await setProgram({ auto_stamp: false })
    const who = await fresh()
    const id = await visit(who, '2026-12-02T08:00:00Z')
    expect(await pay(id)).toMatchObject({ ok: true, data: { stamp: null } })
    expect(await stampVisitManually(ctxA, bizA, id)).toMatchObject({ result: 'added', stamps: 1 })
    expect(await stampVisitManually(ctxA, bizA, id)).toEqual({ result: 'duplicate' })
  })
})

describe('ruční úprava a odměna', () => {
  it('přidat a odebrat razítko s důvodem, záznam v historii', async () => {
    const who = await fresh()
    expect(await adjustStamps(ctxA, bizA, { customerId: who.customer, delta: 1, reason: 'Zapomněli jsme razítko' })).toMatchObject({
      result: 'added',
      stamps: 1,
    })
    // ruční razítko „1 denně“ neomezuje
    expect(await adjustStamps(ctxA, bizA, { customerId: who.customer, delta: 1, reason: 'Druhé' })).toMatchObject({ stamps: 2 })
    expect(await adjustStamps(ctxA, bizA, { customerId: who.customer, delta: -1, reason: 'Omylem' })).toMatchObject({ stamps: 1 })
    const ev = await db.query<{ kind: string; delta: number; reason: string; actor: string }>(
      `SELECT e.kind, e.delta, e.reason, e.actor FROM ws.loyalty_events e JOIN ws.loyalty_cards c ON c.id = e.card_id
       WHERE c.customer_id = $1 ORDER BY e.created_at, e.delta DESC`,
      [who.customer],
    )
    expect(ev.rows).toHaveLength(3)
    expect(ev.rows.every((r) => r.kind === 'manual' && r.actor === 'user_a')).toBe(true)
  })

  it('odebrat z prázdné karty nejde pod nulu', async () => {
    const who = await fresh()
    expect(await adjustStamps(ctxA, bizA, { customerId: who.customer, delta: -1, reason: 'Test' })).toEqual({ result: 'none' })
  })

  it('cizí zákazník: nic', async () => {
    expect(await adjustStamps(ctxB, bizB, { customerId: A.customer, delta: 1, reason: 'Cizí' })).toBeNull()
  })

  it('uplatnit odměnu bez platby', async () => {
    await setProgram({ stamps_needed: 1 })
    const who = await fresh()
    await adjustStamps(ctxA, bizA, { customerId: who.customer, delta: 1, reason: 'Start' })
    expect(await redeemReward(ctxA, bizA, who.customer)).toBe(true)
    expect(await redeemReward(ctxA, bizA, who.customer)).toBe(false)
  })
})

describe('razítko za dokončenou zakázku', () => {
  it('jednou za zakázku, i když se do hotových přesune znovu', async () => {
    await setProgram({ counts: 'job_done' })
    const who = await fresh()
    const done = await one<{ id: string }>(
      `INSERT INTO ws.stages (account_id, business_id, name, type) VALUES ($1, $2, 'Hotovo', 'done') RETURNING id`,
      [A.account, A.business],
    )
    const job = await one<{ id: string }>(
      `INSERT INTO ws.jobs (account_id, business_id, customer_id, stage_id, title) VALUES ($1, $2, $3, $4, 'Vrt') RETURNING id`,
      [A.account, A.business, who.customer, done.id],
    )
    expect(await stampJob(ctxA, bizA, job.id)).toMatchObject({ result: 'added', stamps: 1 })
    expect(await stampJob(ctxA, bizA, job.id)).toEqual({ result: 'duplicate' })
    expect(await stampJob(ctxB, bizB, job.id)).toBeNull()
  })

  it('rozpracovaná zakázka razítko nedá', async () => {
    await setProgram({ counts: 'job_done' })
    const who = await fresh()
    const job = await one<{ id: string }>(
      `INSERT INTO ws.jobs (account_id, business_id, customer_id, stage_id, title) VALUES ($1, $2, $3, $4, 'Vrt') RETURNING id`,
      [A.account, A.business, who.customer, A.stage],
    )
    expect(await stampJob(ctxA, bizA, job.id)).toBeNull()
  })
})
