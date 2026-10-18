import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { getChangeStamp } from '../calendar'
import { currencyTotals, monthSeries } from '../money/calculations'
import { getFinance, getMoneyTotals } from '../money/data'
import { createWsTestDb, ids, pgliteDriver, u } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// RD03: součty plateb v SQL (getMoneyTotals) musí dát přesně totéž co výpočet
// nad řádky z getFinance (currencyTotals / monthSeries), bez sčítání měn.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business }
const A2 = { business: u('a', 90), request: u('a', 91), job: u('a', 92) }

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  // Druhý byznys téhož účtu + platby s haléři, dvěma měnami, výdaji a hranicemi měsíců.
  await db.exec(`
    INSERT INTO ws.businesses (id, account_id, name, slug) VALUES ('${A2.business}', '${A.account}', 'Druhý byznys', 'druhy');
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on)
      SELECT '${A.account}', CASE WHEN g % 5 = 0 THEN '${A2.business}'::uuid ELSE '${A.business}'::uuid END,
             CASE WHEN g % 4 = 0 THEN 'expense' ELSE 'income' END,
             round((((g * 7919) % 100000) / 100.0 + 0.01)::numeric, 2),
             CASE WHEN g % 11 = 0 THEN 'EUR' ELSE 'CZK' END,
             date '2025-09-30' + (g % 400)
      FROM generate_series(1, 600) g;
    -- Hranice měsíců přesně.
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on) VALUES
      ('${A.account}', '${A.business}', 'income', 0.01, 'CZK', '2026-01-01'),
      ('${A.account}', '${A.business}', 'income', 0.02, 'CZK', '2026-01-31'),
      ('${A.account}', '${A.business}', 'income', 0.04, 'CZK', '2026-02-01');
    -- Zkušební poptávka (is_test) s termínem a zakázkou: platby k nim se nepočítají.
    INSERT INTO ws.requests (id, account_id, business_id, source, is_test) VALUES ('${A2.request}', '${A.account}', '${A.business}', 'web', true);
    INSERT INTO ws.jobs (id, account_id, business_id, request_id, stage_id, title) VALUES ('${A2.job}', '${A.account}', '${A.business}', '${A2.request}', '${A.stage}', 'Zkouška');
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on, job_id) VALUES
      ('${A.account}', '${A.business}', 'income', 99999.99, 'CZK', '2026-03-15', '${A2.job}');
    -- Cizí účet: nesmí se objevit nikde.
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on)
      SELECT '${B.account}', '${B.business}', 'income', 777.77, 'CZK', date '2026-03-01' + (g % 20) FROM generate_series(1, 50) g;
  `)
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

const RANGES: [string, string][] = [
  ['2025-11-01', '2026-10-31'],
  ['2026-01-01', '2026-01-31'],
  ['2026-02-01', '2026-02-28'],
  ['2026-01-01', '2026-12-31'],
  ['2025-01-01', '2025-01-31'],
]

describe('getMoneyTotals = součty nad řádky z getFinance', () => {
  for (const all of [false, true]) {
    it(`graf po měsících a součty po měnách jsou shodné (all = ${all})`, async () => {
      for (const [from, to] of RANGES) {
        const rows = await getFinance(ctxA, bizA, from, to, all)
        const totals = await getMoneyTotals(ctxA, bizA, from, to, all)
        expect(currencyTotals(totals)).toEqual(currencyTotals(rows))
        expect(totals.some((t) => t.currency !== 'CZK')).toBe(rows.some((r) => r.currency !== 'CZK'))
        for (const count of [6, 12] as const) {
          expect(monthSeries(totals, to.slice(0, 7), count)).toEqual(monthSeries(rows, to.slice(0, 7), count))
        }
      }
    })
  }

  it('měsíc na hranici: poslední a první den se počítají do správného měsíce', async () => {
    const totals = await getMoneyTotals(ctxA, bizA, '2026-01-01', '2026-02-28', false)
    const jan = currencyTotals(totals.filter((t) => t.day === '2026-01-01')).CZK
    const feb = currencyTotals(totals.filter((t) => t.day === '2026-02-01')).CZK
    expect(jan.income).toBeGreaterThanOrEqual(0.03)
    expect(feb.income).toBeGreaterThanOrEqual(0.04)
  })

  it('platby ke zkušební poptávce se nepočítají, měny se nesčítají', async () => {
    const rows = await getFinance(ctxA, bizA, '2026-03-01', '2026-03-31', false)
    expect(rows.some((r) => r.amount === 99999.99)).toBe(false)
    const totals = await getMoneyTotals(ctxA, bizA, '2026-03-01', '2026-03-31', false)
    expect(totals.every((t) => t.amount !== 99999.99)).toBe(true)
    expect(new Set(totals.map((t) => t.currency))).toEqual(new Set(['CZK', 'EUR']))
    // Každá dvojice (měsíc, měna, druh) je právě jednou.
    const keys = totals.map((t) => `${t.day}|${t.currency}|${t.kind}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('byznys vidí jen svoje platby, `all` celý účet, cizí účet nikdy', async () => {
    const own = currencyTotals(await getMoneyTotals(ctxA, bizA, '2025-01-01', '2026-12-31', false)).CZK
    const acc = currencyTotals(await getMoneyTotals(ctxA, bizA, '2025-01-01', '2026-12-31', true)).CZK
    expect(acc.income).toBeGreaterThan(own.income)
    const other = await getMoneyTotals(ctxB, { id: B.business }, '2026-03-01', '2026-03-31', true)
    expect(currencyTotals(other).CZK.income).toBe(Math.round(50 * 777.77 * 100) / 100)
    // Účet A nevidí 777,77 z účtu B ani omylem.
    const all = await getMoneyTotals(ctxA, bizA, '2026-03-01', '2026-03-31', true)
    expect(JSON.stringify(all)).not.toContain('38888.5')
  })
})

describe('getChangeStamp (max(updated_at))', () => {
  it('změní se při vložení i změně a jinak zůstává', async () => {
    const before = await getChangeStamp(ctxA, bizA)
    expect(await getChangeStamp(ctxA, bizA)).toBe(before)
    await db.exec(`INSERT INTO ws.requests (account_id, business_id, source) VALUES ('${A.account}', '${A.business}', 'web')`)
    const afterInsert = await getChangeStamp(ctxA, bizA)
    expect(afterInsert).not.toBe(before)
    await db.exec(`UPDATE ws.appointments SET status = 'cancelled' WHERE id = '${A.appointment}'`)
    const afterUpdate = await getChangeStamp(ctxA, bizA)
    expect(afterUpdate).not.toBe(afterInsert)
    await db.exec(`UPDATE ws.jobs SET title = 'Jiný název' WHERE id = '${A.job}'`)
    expect(await getChangeStamp(ctxA, bizA)).not.toBe(afterUpdate)
  })

  it('změna u jiného byznysu nebo účtu otisk nezmění', async () => {
    const before = await getChangeStamp(ctxA, bizA)
    await db.exec(`INSERT INTO ws.requests (account_id, business_id, source) VALUES ('${B.account}', '${B.business}', 'web')`)
    await db.exec(`INSERT INTO ws.requests (account_id, business_id, source) VALUES ('${A.account}', '${A2.business}', 'web')`)
    expect(await getChangeStamp(ctxA, bizA)).toBe(before)
  })
})
