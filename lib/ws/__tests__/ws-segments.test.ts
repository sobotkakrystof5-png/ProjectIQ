import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests, wsDb, wsSystem } from '../db'
import type { WsContext } from '../context'
import { demoSeedQueries } from '../demo-seed'
import {
  classifySegment,
  DEFAULT_SEGMENT_RULES,
  dormantAfterDays,
  recomputeSegments,
  typicalInterval,
  type SegmentRules,
} from '../segments'
import { addDays } from '../time'
import { asApp, createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Skupiny zákazníků (S12): všech 5 skupin včetně hraničních dní, pořadí
// vyhodnocení, pražský den návštěvy, ukázková data, historie změn a
// oddělení účtů.

const rules: SegmentRules = DEFAULT_SEGMENT_RULES // 30 dní, 3 návštěvy / 365 dní, 2× interval, min. 56 dní
const today = '2026-10-10'
const ago = (n: number) => addDays(today, -n)
const seg = (visitAgo: number[], opts: { created?: number; ended?: boolean; rules?: SegmentRules } = {}) =>
  classifySegment(
    { visitDays: visitAgo.map(ago), createdDay: ago(opts.created ?? Math.max(0, ...visitAgo)), ended: opts.ended ?? false },
    opts.rules ?? rules,
    today,
  )

describe('classifySegment', () => {
  it('Ukončení má přednost před vším', () => {
    expect(seg([1, 20, 40], { ended: true }).segment).toBe('ended')
    expect(seg([], { ended: true }).segment).toBe('ended')
  })

  it('Noví: první návštěva nejvýš před 30 dny (včetně), 31 dní už ne', () => {
    expect(seg([0]).segment).toBe('new')
    expect(seg([30]).segment).toBe('new')
    expect(seg([31]).segment).toBe('one_time')
    // tři návštěvy během prvního měsíce: pořád Nový (Noví se vyhodnocují před Stálými)
    expect(seg([2, 10, 20]).segment).toBe('new')
  })

  it('bez návštěvy: Nový 30 dní od první poptávky, potom bez skupiny', () => {
    expect(seg([], { created: 30 }).segment).toBe('new')
    expect(seg([], { created: 31 }).segment).toBeNull()
  })

  it('Stálí: 3 návštěvy v okně 365 dní', () => {
    expect(seg([14, 42, 70]).segment).toBe('regular')
  })

  it('okno Stálých se měří k poslední návštěvě: 364 dní ano, 365 ne', () => {
    expect(seg([40, 200, 40 + 364]).segment).toBe('regular')
    expect(seg([40, 200, 40 + 365]).segment).toBe('one_time')
  })

  it('Jednorázoví: 1 návštěva po okně pro Nové, i 2 návštěvy pod hranicí Stálých (R-046)', () => {
    expect(seg([100]).segment).toBe('one_time')
    expect(seg([40, 100]).segment).toBe('one_time')
  })

  it('Spící: po 2× obvyklém intervalu, ale nejdřív po 56 dnech (hranice přísně „déle než“)', () => {
    // interval 28 dní → 2× = 56 = minimum
    expect(seg([56, 84, 112]).segment).toBe('regular')
    expect(seg([57, 85, 113]).segment).toBe('dormant')
    // interval 50 → 100 dní
    expect(seg([100, 150, 200]).segment).toBe('regular')
    expect(seg([101, 151, 201]).segment).toBe('dormant')
    // interval 7 → 14 dní, ale minimum je 56
    expect(seg([50, 57, 64]).segment).toBe('regular')
    expect(seg([57, 64, 71]).segment).toBe('dormant')
  })

  it('Spící jen ten, kdo byl Stálý — dvě staré návštěvy jsou Jednorázoví', () => {
    expect(seg([300, 400]).segment).toBe('one_time')
  })

  it('Noví před Spícími: první návštěva v okně pro Nové vyhraje', () => {
    const r = { ...rules, newDays: 400, dormantMinDays: 10 }
    expect(seg([100, 110, 120], { rules: r }).segment).toBe('new')
  })

  it('budoucí dny a duplicitní dny se nepočítají', () => {
    const res = classifySegment({ visitDays: [ago(-5), ago(70), ago(70), ago(42), ago(14)], createdDay: ago(70), ended: false }, rules, today)
    expect(res).toMatchObject({ segment: 'regular', visitsInWindow: 3, firstVisit: ago(70), lastVisit: ago(14), intervalDays: 28 })
  })

  it('studnařství: hranice v letech', () => {
    const well: SegmentRules = { newDays: 365, regularMinVisits: 2, regularWindowDays: 1825, dormantFactor: 2, dormantMinDays: 730 }
    expect(seg([400, 1100], { rules: well }).segment).toBe('regular')
    expect(seg([1500, 2200], { rules: well }).segment).toBe('dormant')
  })
})

describe('obvyklý interval', () => {
  it('medián mezer, sudý počet = průměr prostředních', () => {
    expect(typicalInterval(['2026-01-01'])).toBeNull()
    expect(typicalInterval(['2026-01-01', '2026-01-11', '2026-01-31'])).toBe(15)
    expect(typicalInterval(['2026-01-01', '2026-01-08', '2026-01-15', '2026-03-01'])).toBe(7)
    expect(dormantAfterDays(null, rules)).toBe(56)
    expect(dormantAfterDays(40, rules)).toBe(80)
    expect(dormantAfterDays(10, { ...rules, dormantFactor: 1.5 })).toBe(56)
  })
})

// --- DB ---------------------------------------------------------------------

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const bizA = { id: A.business }

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

async function segmentOf(customerId: string): Promise<string | null> {
  const { rows } = await db.query<{ segment: string }>(`SELECT segment FROM ws.customer_segments WHERE business_id = $1 AND customer_id = $2`, [
    A.business,
    customerId,
  ])
  return rows[0]?.segment ?? null
}

describe('recomputeSegments', () => {
  it('ukázková data: skupiny sedí na deklarované (Stálé, Spící, Noví)', async () => {
    const seedNow = new Date('2026-10-09T04:00:00Z') // 6:00 v Praze, dnešní termíny ještě neproběhly
    await wsDb(ctxA).batch(demoSeedQueries({ accountId: A.account, businessId: A.business, slug: 'byznys-a', today: '2026-10-09' }))
    await recomputeSegments(ctxA, bizA, { now: seedNow })
    const { rows } = await db.query<{ name: string; segment: string }>(
      `SELECT c.name, s.segment FROM ws.customers c JOIN ws.customer_segments s ON s.customer_id = c.id
       WHERE c.account_id = $1 AND c.note = '[ukázková data]' ORDER BY c.name`,
      [A.account],
    )
    expect(Object.fromEntries(rows.map((r) => [r.name, r.segment]))).toEqual({
      'Eva Demo': 'new',
      'Jana Ukázková': 'regular',
      'Karel Pokusný': 'dormant',
      'Marie Vzorová': 'regular',
      'Petr Zkušební': 'new',
      'Tereza Testová': 'new',
    })
    // výpočet nezměnil nic, co seed deklaroval
    const after = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ws.segment_history h JOIN ws.customers c ON c.id = h.customer_id
       WHERE h.business_id = $1 AND c.note = '[ukázková data]'`,
      [A.business],
    )
    expect(after.rows[0].n).toBe(0)
  })

  it('Karel přijde dnes odpoledne → po termínu je zase Stálý, změna je v historii', async () => {
    const karel = (await db.query<{ id: string }>(`SELECT id FROM ws.customers WHERE name = 'Karel Pokusný' AND account_id = $1`, [A.account])).rows[0].id
    const evening = new Date('2026-10-09T18:00:00Z')
    const res = await recomputeSegments(ctxA, bizA, { customerIds: [karel], now: evening })
    expect(res).toEqual({ customers: 1, changed: 1 })
    expect(await segmentOf(karel)).toBe('regular')
    const h = await db.query<{ from_segment: string; to_segment: string }>(
      `SELECT from_segment, to_segment FROM ws.segment_history WHERE customer_id = $1 ORDER BY changed_at DESC LIMIT 1`,
      [karel],
    )
    expect(h.rows[0]).toEqual({ from_segment: 'dormant', to_segment: 'regular' })
    // znovu: beze změny, nic nového v historii
    expect(await recomputeSegments(ctxA, bizA, { customerIds: [karel], now: evening })).toEqual({ customers: 1, changed: 0 })
  })

  it('počítá se jen proběhlá návštěva: zrušená, nedorazil, blokace a budoucí ne', async () => {
    const c = (
      await db.query<{ id: string }>(`INSERT INTO ws.customers (account_id, name, created_at) VALUES ($1, 'Nová Hraniční', '2026-01-01') RETURNING id`, [
        A.account,
      ])
    ).rows[0].id
    const staff = (
      await db.query<{ id: string }>(`INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, 'Hraniční') RETURNING id`, [
        A.account,
        A.business,
      ])
    ).rows[0].id
    const add = (start: string, status: string) =>
      db.query(
        `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '1 hour', $6)`,
        [A.account, A.business, staff, c, start, status],
      )
    await add('2026-03-01T09:00:00Z', 'cancelled')
    await add('2026-03-02T09:00:00Z', 'no_show')
    await add('2026-12-01T09:00:00Z', 'confirmed')
    await recomputeSegments(ctxA, bizA, { customerIds: [c], now: new Date('2026-10-10T08:00:00Z') })
    // vznikl v lednu, nikdy nepřišel → bez skupiny
    expect(await segmentOf(c)).toBeNull()
  })

  it('den návštěvy v pražském čase (0:30 v Praze je v UTC ještě předchozí den)', async () => {
    const c = (await db.query<{ id: string }>(`INSERT INTO ws.customers (account_id, name) VALUES ($1, 'Půlnoční') RETURNING id`, [A.account])).rows[0].id
    const staff = (
      await db.query<{ id: string }>(`INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, 'Noční') RETURNING id`, [
        A.account,
        A.business,
      ])
    ).rows[0].id
    // 9. 10. 22:30Z = 10. 10. 0:30 v Praze
    await db.query(
      `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, '2026-10-09T22:30:00Z', '2026-10-09T23:00:00Z', 'completed')`,
      [A.account, A.business, staff, c],
    )
    await recomputeSegments(ctxA, bizA, { customerIds: [c], now: new Date('2026-10-10T08:00:00Z') })
    const { rows } = await db.query<{ day: string; segment: string }>(
      `SELECT (first_visit_at AT TIME ZONE 'Europe/Prague')::date::text AS day, segment FROM ws.customer_segments WHERE customer_id = $1`,
      [c],
    )
    expect(rows[0]).toEqual({ day: '2026-10-10', segment: 'new' })
  })

  it('hotová zakázka bez termínu je návštěva (byznys bez kalendáře)', async () => {
    const c = (await db.query<{ id: string }>(`INSERT INTO ws.customers (account_id, name) VALUES ($1, 'Studna') RETURNING id`, [A.account])).rows[0].id
    const done = (
      await db.query<{ id: string }>(`INSERT INTO ws.stages (account_id, business_id, name, type) VALUES ($1, $2, 'Hotovo', 'done') RETURNING id`, [
        A.account,
        A.business,
      ])
    ).rows[0].id
    await db.query(
      `INSERT INTO ws.jobs (account_id, business_id, customer_id, stage_id, title, closed_at) VALUES ($1, $2, $3, $4, 'Vrt', '2026-10-05T10:00:00Z')`,
      [A.account, A.business, c, done],
    )
    await recomputeSegments(ctxA, bizA, { customerIds: [c], now: new Date('2026-10-10T08:00:00Z') })
    expect(await segmentOf(c)).toBe('new')
  })

  it('ručně ukončený zákazník je Ukončený, po vrácení zase podle návštěv', async () => {
    await db.query(`UPDATE ws.customers SET ended_at = now() WHERE id = $1`, [A.customer])
    await recomputeSegments(ctxA, bizA, { customerIds: [A.customer] })
    expect(await segmentOf(A.customer)).toBe('ended')
    await db.query(`UPDATE ws.customers SET ended_at = NULL, unsubscribed_at = now() WHERE id = $1`, [A.customer])
    await recomputeSegments(ctxA, bizA, { customerIds: [A.customer] })
    expect(await segmentOf(A.customer)).toBe('ended')
    await db.query(`UPDATE ws.customers SET unsubscribed_at = NULL WHERE id = $1`, [A.customer])
    await recomputeSegments(ctxA, bizA, { customerIds: [A.customer] })
    expect(await segmentOf(A.customer)).not.toBe('ended')
  })

  it('účet A nepřepočítá ani nevidí zákazníky účtu B', async () => {
    const before = await db.query(`SELECT segment, computed_at FROM ws.customer_segments WHERE business_id = $1`, [B.business])
    // byznys B pod účtem A: RLS i filtr account_id → nic
    expect(await recomputeSegments(ctxA, { id: B.business })).toEqual({ customers: 0, changed: 0 })
    expect(await recomputeSegments(ctxA, bizA, { customerIds: [B.customer] })).toEqual({ customers: 0, changed: 0 })
    const after = await db.query(`SELECT segment, computed_at FROM ws.customer_segments WHERE business_id = $1`, [B.business])
    expect(after.rows).toEqual(before.rows)
  })
})

describe('cron: seznam byznysů', () => {
  it('ws.active_businesses vrátí byznysy všech účtů (jen ID), tabulka bez účtu nic', async () => {
    const rows = await wsSystem<{ account_id: string; business_id: string }>`SELECT * FROM ws.active_businesses()`
    expect(rows).toEqual(
      expect.arrayContaining([
        { account_id: A.account, business_id: A.business },
        { account_id: B.account, business_id: B.business },
      ]),
    )
    const direct = await asApp(db, null, (tx) => tx.query(`SELECT id FROM ws.businesses`))
    expect(direct.rows).toHaveLength(0)
  })
})

describe('denní cron', () => {
  it('pustí jen se správným CRON_SECRET, bez něj nikoho', async () => {
    const { isCronAuthorized } = await import('../cron')
    const prev = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    expect(isCronAuthorized('Bearer cokoli')).toBe(false)
    process.env.CRON_SECRET = 'tajne-heslo-cronu'
    expect(isCronAuthorized('Bearer tajne-heslo-cronu')).toBe(true)
    expect(isCronAuthorized('Bearer tajne-heslo')).toBe(false)
    expect(isCronAuthorized('tajne-heslo-cronu')).toBe(false)
    expect(isCronAuthorized(null)).toBe(false)
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })

  it('projde byznysy obou účtů, každý pod svým účtem', async () => {
    const { runDailySegments } = await import('../cron')
    const res = await runDailySegments(new Date('2026-10-10T08:00:00Z'))
    expect(res.businesses).toBeGreaterThanOrEqual(2)
    expect(res.failed).toBe(0)
    const b = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.customer_segments WHERE business_id = $1`, [B.business])
    expect(b.rows[0].n).toBeGreaterThanOrEqual(1)
  })
})
