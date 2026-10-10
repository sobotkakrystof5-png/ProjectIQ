import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import { getCustomerDetail } from '../customers'
import { completeVisit, DEFAULT_PROGRAM, stampVisitManually, stampsForPayment } from '../loyalty'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

let db: PGlite
const A = ids('a')
const ctx = { userId: 'user_a', accountId: A.account, role: 'owner' as const }
const business = { id: A.business }

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('S12: odměna a měny', () => {
  it('útratu v eurech nepovažuje za koruny, návštěvu bez částkového pravidla počítá', () => {
    const input = { source: 'visit' as const, amount: 500, serviceId: A.service, currency: 'EUR' }
    expect(stampsForPayment({ ...DEFAULT_PROGRAM, enabled: true, counts: 'amount', amountPerStamp: 500 }, input)).toBe(0)
    expect(stampsForPayment({ ...DEFAULT_PROGRAM, enabled: true, minSpend: 500 }, input)).toBe(0)
    expect(stampsForPayment({ ...DEFAULT_PROGRAM, enabled: true }, input)).toBe(1)
  })

  it('odměněnou návštěvu nelze dodatečně orazítkovat, ani po založení další karty', async () => {
    await db.query(`UPDATE ws.loyalty_cards SET stamps = 5, status = 'full' WHERE id = $1`, [A.card])
    await db.query(`UPDATE ws.loyalty_programs SET auto_stamp = false WHERE id = $1`, [A.program])
    const { rows } = await db.query<{ id: string }>(`
      INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, service_id, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, '2026-10-12T09:00Z', '2026-10-12T10:00Z') RETURNING id
    `, [A.account, A.business, A.staff, A.customer, A.service])
    const id = rows[0].id
    expect(await completeVisit(ctx, business, { appointmentId: id, amount: 0, method: 'cash', redeem: true })).toMatchObject({
      ok: true, data: { redeemed: true, stamp: null },
    })
    expect(await stampVisitManually(ctx, business, id)).toEqual({ result: 'duplicate' })
    const events = await db.query<{ kind: string }>(`SELECT kind FROM ws.loyalty_events WHERE appointment_id = $1`, [id])
    expect(events.rows).toEqual([{ kind: 'redeem' }])
    const cards = await db.query(`SELECT id FROM ws.loyalty_cards WHERE customer_id = $1 AND status IN ('active', 'full')`, [A.customer])
    expect(cards.rows).toHaveLength(0)
    await db.query(`INSERT INTO ws.loyalty_cards (account_id, business_id, program_id, customer_id) VALUES ($1, $2, $3, $4)`,
      [A.account, A.business, A.program, A.customer])
    expect(await stampVisitManually(ctx, business, id)).toEqual({ result: 'duplicate' })
  })

  it('zaplacená eurová návštěva zapíše EUR a nedostane razítka podle útraty v Kč', async () => {
    await db.query(`UPDATE ws.services SET currency = 'EUR' WHERE id = $1`, [A.service])
    await db.query(`UPDATE ws.loyalty_programs SET auto_stamp = true, counts = 'amount', amount_per_stamp = 500 WHERE id = $1`, [A.program])
    const { rows } = await db.query<{ id: string }>(`
      INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, service_id, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, '2026-10-13T09:00Z', '2026-10-13T10:00Z') RETURNING id
    `, [A.account, A.business, A.staff, A.customer, A.service])
    expect(await completeVisit(ctx, business, { appointmentId: rows[0].id, amount: 500, method: 'card' })).toMatchObject({
      ok: true, data: { stamp: null },
    })
    const payment = await db.query<{ currency: string }>(`SELECT currency FROM ws.transactions WHERE appointment_id = $1`, [rows[0].id])
    expect(payment.rows).toEqual([{ currency: 'EUR' }])
    expect(await stampVisitManually(ctx, business, rows[0].id)).toEqual({ result: 'none' })
    // Import nebo následná platba v jiné měně nesmí změnit eurovou částku v historii.
    await db.query(`INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on, customer_id, appointment_id)
      VALUES ($1, $2, 'income', 750, 'CZK', '2026-10-13', $3, $4)`,
      [A.account, A.business, A.customer, rows[0].id])
    const detail = await getCustomerDetail(ctx, business, A.customer, new Date('2026-10-14T09:00Z'))
    expect(detail?.history.find((h) => h.id === rows[0].id)).toMatchObject({ paid: 500, currency: 'EUR' })
    expect(detail?.spend).toEqual([{ currency: 'CZK', amount: 750 }, { currency: 'EUR', amount: 500 }])
  })
})
