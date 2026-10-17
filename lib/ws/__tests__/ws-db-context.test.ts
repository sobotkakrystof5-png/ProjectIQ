import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isOverlapError, isUniqueViolation, q, setWsDriverForTests, wsDb, wsSystem } from '../db'
import { hasRole, requireBusiness, requireRole, requireWorkspace, setWsAuthProvider, type WsContext } from '../context'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

// lib/ws/db.ts a lib/ws/context.ts proti skutečnému Postgresu (PGlite) jako ws_app.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setWsAuthProvider(async () => null)
  await db?.close()
})

/** Next redirect()/notFound() hází chybu s `digest`. */
async function digestOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'bez chyby'
  } catch (e) {
    return String((e as { digest?: string }).digest ?? (e as Error).message)
  }
}

describe('q', () => {
  it('čísluje parametry a hodnoty nevkládá do textu', () => {
    const name = "x'); DROP TABLE ws.customers; --"
    expect(q`SELECT * FROM ws.customers WHERE account_id = ${'id'} AND name = ${name}`).toEqual({
      text: 'SELECT * FROM ws.customers WHERE account_id = $1 AND name = $2',
      params: ['id', name],
    })
  })
})

describe('wsDb', () => {
  it('odmítne accountId, které není UUID', () => {
    expect(() => wsDb({ accountId: "' OR true --" })).toThrow()
    expect(() => wsDb({ accountId: '' })).toThrow()
  })

  it('vrátí jen řádky svého účtu i bez WHERE (RLS jako pojistka)', async () => {
    const rows = await wsDb(ctxA)<{ account_id: string }>`SELECT account_id FROM ws.customers`
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.account_id === A.account)).toBe(true)
  })

  it('cizí řádek přes jeho UUID nenajde', async () => {
    const rows = await wsDb(ctxA)`SELECT id FROM ws.customers WHERE id = ${B.customer}`
    expect(rows).toEqual([])
  })

  it('batch je jedna transakce — selže-li dotaz, neuloží se nic', async () => {
    const db = wsDb(ctxA)
    await expect(
      db.batch([
        q`INSERT INTO ws.customers (account_id, name, phone) VALUES (${A.account}, 'Dávka', '+420777000111')`,
        q`INSERT INTO ws.customers (account_id, name, phone) VALUES (${A.account}, 'Dávka 2', '+420777000111')`,
      ]),
    ).rejects.toSatisfy(isUniqueViolation)
    expect(await db`SELECT id FROM ws.customers WHERE phone = '+420777000111'`).toEqual([])
  })

  it('kontext účtu po transakci nezůstane viset', async () => {
    await wsDb(ctxA)`SELECT 1`
    const [row] = await wsSystem<{ n: number }>`SELECT count(*)::int AS n FROM ws.customers`
    expect(row.n).toBe(0)
  })

  it('překryv termínu pozná isOverlapError', async () => {
    await expect(
      wsDb(ctxA)`
        INSERT INTO ws.appointments (account_id, business_id, staff_id, starts_at, ends_at)
        VALUES (${A.account}, ${A.business}, ${A.staff}, '2026-10-01 09:30+02', '2026-10-01 09:45+02')
      `,
    ).rejects.toSatisfy(isOverlapError)
  })
})

describe('requireWorkspace', () => {
  it('nepřihlášený → přihlášení', async () => {
    setWsAuthProvider(async () => null)
    expect(await digestOf(requireWorkspace())).toContain('/w/prihlaseni')
  })

  it('přihlášený bez firmy nebo s neznámou firmou → nový byznys', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_x', orgId: null, orgRole: null }))
    expect(await digestOf(requireWorkspace())).toContain('/w/novy')
    setWsAuthProvider(async () => ({ userId: 'user_x', orgId: 'org_neexistuje', orgRole: 'org:admin' }))
    expect(await digestOf(requireWorkspace())).toContain('/w/novy')
  })

  it('účet se bere z Clerk organizace, role z role v organizaci', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_a', orgId: 'org_a', orgRole: 'org:admin' }))
    expect(await requireWorkspace()).toEqual({ userId: 'user_a', accountId: A.account, role: 'owner' })
    setWsAuthProvider(async () => ({ userId: 'user_b2', orgId: 'org_b', orgRole: 'org:member' }))
    expect(await requireWorkspace()).toEqual({ userId: 'user_b2', accountId: B.account, role: 'staff' })
  })
})

describe('requireBusiness a role', () => {
  it('vlastní byznys vrátí', async () => {
    const b = await requireBusiness(ctxA, 'byznys-a')
    expect(b.id).toBe(A.business)
  })

  it('cizí, neexistující i nesmyslný slug = 404', async () => {
    // Next 16 značí notFound() digestem `NEXT_HTTP_ERROR_FALLBACK;404`, dřív `NEXT_NOT_FOUND`.
    const notFound = /NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/
    expect(await digestOf(requireBusiness(ctxA, 'byznys-b'))).toMatch(notFound)
    expect(await digestOf(requireBusiness(ctxA, 'neni'))).toMatch(notFound)
    expect(await digestOf(requireBusiness(ctxA, '../x'))).toMatch(notFound)
  })

  it('pracovník na stránku jen pro vlastníka nesmí', async () => {
    const staff: WsContext = { ...ctxA, role: 'staff' }
    expect(hasRole(staff, 'staff')).toBe(true)
    expect(hasRole(staff, 'owner')).toBe(false)
    expect(hasRole(ctxA, 'owner')).toBe(true)
    expect(() => requireRole(staff, 'owner')).toThrow()
    expect(() => requireRole(ctxA, 'owner')).not.toThrow()
  })
})
