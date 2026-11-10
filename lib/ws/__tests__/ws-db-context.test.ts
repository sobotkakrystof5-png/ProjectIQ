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
  // Pracovník účtu B (role z ws.members, migrace 100).
  await db.exec(`INSERT INTO ws.members (account_id, user_id, role) VALUES ('${B.account}', 'user_b2', 'staff')`)
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

  it('přihlášený bez účtu → nový byznys', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_x', email: null }))
    expect(await digestOf(requireWorkspace())).toContain('/w/novy')
  })

  it('účet a role se berou z ws.members podle uživatele', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_a', email: null }))
    expect(await requireWorkspace()).toEqual({ userId: 'user_a', accountId: A.account, role: 'owner' })
    setWsAuthProvider(async () => ({ userId: 'user_b2', email: null }))
    expect(await requireWorkspace()).toEqual({ userId: 'user_b2', accountId: B.account, role: 'staff' })
  })
})

describe('requireWorkspace: zrušená relace a dvoufázové ověření (R-081)', () => {
  const USER = '7d1e2f3a-4b5c-4d6e-8f70-112233445566'
  const SESSION = '8e2f3a4b-5c6d-4e7f-9a81-223344556677'
  const identity = (aal: 'aal1' | 'aal2', sessionId = SESSION) => async () => ({ userId: USER, email: null, aal, sessionId })

  beforeAll(async () => {
    await db.exec(`INSERT INTO ws.members (account_id, user_id, role) VALUES ('${A.account}', '${USER}', 'staff')`)
  })

  it('bez schématu auth (testy, mimo Supabase) se nic nemění', async () => {
    setWsAuthProvider(identity('aal1'))
    expect(await requireWorkspace()).toEqual({ userId: USER, accountId: A.account, role: 'staff' })
  })

  it('se schématem auth: zrušená relace → odhlášení, 2FA bez kódu → ověření, s kódem dál', async () => {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);
      CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, status text NOT NULL);
    `)
    try {
      setWsAuthProvider(identity('aal1'))
      expect(await digestOf(requireWorkspace())).toContain('/auth/odhlaseni?kam=w')

      await db.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)', [SESSION, USER])
      expect(await requireWorkspace()).toEqual({ userId: USER, accountId: A.account, role: 'staff' })

      await db.query("INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'verified')", [USER])
      expect(await digestOf(requireWorkspace())).toContain('/w/overeni')
      setWsAuthProvider(identity('aal2'))
      expect(await requireWorkspace()).toEqual({ userId: USER, accountId: A.account, role: 'staff' })

      // Cizí relace (Odhlásit všude smazal tu naši) neprojde ani s aal2.
      setWsAuthProvider(identity('aal2', '9f3a4b5c-6d7e-4f80-8b92-334455667788'))
      expect(await digestOf(requireWorkspace())).toContain('/auth/odhlaseni?kam=w')
    } finally {
      await db.exec('DROP SCHEMA auth CASCADE')
    }
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
