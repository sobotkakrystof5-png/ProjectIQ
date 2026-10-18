import fs from 'fs'
import path from 'path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// React.cache existuje jen v Reactu, který přibaluje Next. Tady ho nahradíme
// pamětí na jeden „požadavek“ (`request.reset()` = nový požadavek), aby šlo
// ověřit, že layout a stránka sdílejí jeden dotaz do DB.
const request = vi.hoisted(() => {
  const memo = new Map<unknown, { args: unknown[]; value: unknown }[]>()
  return {
    reset: () => memo.clear(),
    cache: <F extends (...args: unknown[]) => unknown>(fn: F): F =>
      ((...args: unknown[]) => {
        const entries = memo.get(fn) ?? []
        const hit = entries.find((e) => e.args.length === args.length && e.args.every((a, i) => Object.is(a, args[i])))
        if (hit) return hit.value
        const value = fn(...args)
        memo.set(fn, [...entries, { args, value }])
        return value
      }) as F,
  }
})
vi.mock('server-only', () => ({}))
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: request.cache }))

import { q, setWsDriverForTests, wsSystem, type WsDriver } from '../db'
import { requireBusiness, requireWorkspace, setWsAuthProvider } from '../context'
import { getFrameChrome } from '../chrome'
import { loadBusinessScope, parseBusinessScope } from '../scope'
import { getEnabledModules } from '../today'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

// RD02: kontext obrazovky jedním dotazem (migrace 085, lib/ws/scope.ts).

let db: PGlite
let rounds = 0
const A = ids('a')
const B = ids('b')
const NOT_FOUND = /NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  const base = pgliteDriver(db)
  const counting: WsDriver = {
    transaction(queries) {
      rounds++
      return base.transaction(queries)
    },
  }
  setWsDriverForTests(counting)
}, 60_000)

beforeEach(() => {
  request.reset()
  rounds = 0
  setWsAuthProvider(async () => ({ userId: 'user_a', orgId: 'org_a', orgRole: 'org:admin' }))
})

afterAll(async () => {
  setWsDriverForTests(null)
  setWsAuthProvider(async () => null)
  await db?.close()
})

async function digestOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'bez chyby'
  } catch (e) {
    return String((e as { digest?: string }).digest ?? (e as Error).message)
  }
}

describe('ws.business_scope (SECURITY DEFINER)', () => {
  const scopeOf = async (org: string, slug: string) =>
    (await wsSystem<{ scope: Record<string, unknown> | null }>`SELECT ws.business_scope(${org}, ${slug}) AS scope`)[0].scope

  it('vrátí účet, byznys, předplatné a byznysy jen jedné organizace', async () => {
    const scope = await scopeOf('org_a', 'byznys-a')
    expect(scope).toMatchObject({ account_id: A.account, business: { id: A.business, slug: 'byznys-a' } })
    expect(scope?.businesses).toEqual([{ name: expect.any(String), slug: 'byznys-a' }])
    expect(scope?.subscriptions).toHaveLength(1)
    // Nic z účtu B se do odpovědi nedostane.
    expect(JSON.stringify(scope)).not.toContain(B.account)
    expect(JSON.stringify(scope)).not.toContain(B.business)
  })

  it('cizí slug nevrátí byznys a nic cizího neprozradí', async () => {
    const scope = await scopeOf('org_a', 'byznys-b')
    expect(scope?.account_id).toBe(A.account)
    expect(scope?.business).toBeNull()
    expect(scope?.modules).toEqual([])
    expect(JSON.stringify(scope)).not.toContain(B.business)
  })

  it('neznámá organizace nebo nesmyslný slug = žádný účet / žádný byznys', async () => {
    expect(await scopeOf('org_neexistuje', 'byznys-a')).toBeNull()
    expect((await scopeOf('org_a', "x'; DROP TABLE ws.accounts; --"))?.business).toBeNull()
    // Tabulky jsou celé (kontrola jako vlastník, mimo RLS).
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ws.accounts')).rows[0].n).toBe(2)
  })

  it('archivovaný byznys = jako by nebyl', async () => {
    await db.exec(`UPDATE ws.businesses SET archived_at = now() WHERE id = '${A.business}'`)
    try {
      const scope = await scopeOf('org_a', 'byznys-a')
      expect(scope?.business).toBeNull()
      expect(scope?.businesses).toEqual([])
    } finally {
      await db.exec(`UPDATE ws.businesses SET archived_at = NULL WHERE id = '${A.business}'`)
    }
  })

  it('zapnuté funkce jsou jen ty zapnuté a jen ze zvoleného byznysu', async () => {
    await db.exec(`
      INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
      VALUES ('${A.account}', '${A.business}', 'calendar', true), ('${A.account}', '${A.business}', 'jobs', false)
      ON CONFLICT (business_id, module) DO UPDATE SET enabled = EXCLUDED.enabled
    `)
    try {
      expect((await scopeOf('org_a', 'byznys-a'))?.modules).toEqual(['calendar'])
      expect((await scopeOf('org_a', 'byznys-b'))?.modules).toEqual([])
    } finally {
      await db.exec(`DELETE FROM ws.business_modules WHERE business_id = '${A.business}'`)
    }
  })
})

describe('parseBusinessScope', () => {
  it('bez účtu vrátí null, role se bere z Clerku', () => {
    expect(parseBusinessScope(null, { userId: 'u', orgRole: null })).toBeNull()
    const raw = { account_id: A.account, business: null, businesses: [], modules: [], subscriptions: [] }
    expect(parseBusinessScope(raw, { userId: 'u', orgRole: 'org:admin' })?.ctx.role).toBe('owner')
    expect(parseBusinessScope(raw, { userId: 'u', orgRole: 'org:member' })?.ctx.role).toBe('staff')
    expect(parseBusinessScope(JSON.stringify(raw), { userId: 'u', orgRole: null })?.ctx.accountId).toBe(A.account)
  })

  it('předplatné bez řádků = bez přístupu, zkušební doba = trialing', () => {
    const base = { account_id: A.account, business: null, businesses: [], modules: [] }
    expect(parseBusinessScope({ ...base, subscriptions: [] }, { userId: 'u', orgRole: null })?.billing.access).toBe('none')
    const trial = { status: 'trialing', current_period_end: '2030-01-01T00:00:00+00:00', cancel_at_period_end: false, past_due_since: null, created_at: '2026-10-01T00:00:00+00:00' }
    const parsed = parseBusinessScope({ ...base, subscriptions: [trial] }, { userId: 'u', orgRole: null })
    expect(parsed?.billing.access).toBe('trialing')
    expect(parsed?.billing.periodEnd).toEqual(new Date('2030-01-01T00:00:00+00:00'))
  })
})

describe('loadBusinessScope', () => {
  it('vlastní byznys: kontext, byznys, předplatné a byznysy v jednom kole', async () => {
    const scope = await loadBusinessScope('byznys-a')
    expect(scope.ctx).toEqual({ userId: 'user_a', accountId: A.account, role: 'owner' })
    expect(scope.business.id).toBe(A.business)
    expect(scope.billing.access).toBe('trialing')
    expect(scope.businesses.map((b) => b.slug)).toEqual(['byznys-a'])
    expect(rounds).toBe(1)
  })

  it('cizí, neexistující i nesmyslný slug = 404, nepřihlášený = přihlášení, bez firmy = průvodce', async () => {
    expect(await digestOf(loadBusinessScope('byznys-b'))).toMatch(NOT_FOUND)
    expect(await digestOf(loadBusinessScope('neni'))).toMatch(NOT_FOUND)
    expect(await digestOf(loadBusinessScope('../x'))).toMatch(NOT_FOUND)
    // Každý pokus je nový požadavek (paměť loadBusinessScope je na jeden požadavek).
    request.reset()
    setWsAuthProvider(async () => null)
    expect(await digestOf(loadBusinessScope('byznys-a'))).toContain('/w/prihlaseni')
    request.reset()
    setWsAuthProvider(async () => ({ userId: 'u', orgId: 'org_neexistuje', orgRole: 'org:admin' }))
    expect(await digestOf(loadBusinessScope('byznys-a'))).toContain('/w/novy')
  })

  it('organizace B nevidí byznys A ani přes seed A v téže paměti požadavku', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_b', orgId: 'org_b', orgRole: 'org:admin' }))
    expect(await digestOf(loadBusinessScope('byznys-a'))).toMatch(NOT_FOUND)
    expect((await loadBusinessScope('byznys-b')).ctx.accountId).toBe(B.account)
  })

  it('po načtení kontextu už layout ani stránka do DB kvůli účtu, byznysu a funkcím nesahají', async () => {
    const { ctx, business } = await loadBusinessScope('byznys-a')
    expect(rounds).toBe(1)
    expect(await requireWorkspace()).toBe(ctx)
    expect(await requireBusiness(ctx, 'byznys-a')).toBe(business)
    expect(await getEnabledModules(ctx, business)).toEqual(new Set())
    expect(rounds).toBe(1)
  })

  it('seed nepustí cizí byznys: jiný slug nebo jiný účet jde do DB a skončí 404', async () => {
    const { ctx } = await loadBusinessScope('byznys-a')
    expect(await digestOf(requireBusiness(ctx, 'byznys-b'))).toMatch(NOT_FOUND)
    const other = { userId: 'user_b', accountId: B.account, role: 'owner' as const }
    expect(await digestOf(requireBusiness(other, 'byznys-a'))).toMatch(NOT_FOUND)
  })

  it('před migrací 085 (funkce chybí) se kontext načte po částech a aplikace funguje', async () => {
    const migration = fs.readFileSync(path.join(__dirname, '../../../migrations/085_ws_kontext_jednim_dotazem.sql'), 'utf8')
    await db.exec('DROP FUNCTION ws.business_scope(text, text)')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const scope = await loadBusinessScope('byznys-a')
      expect(scope.ctx.accountId).toBe(A.account)
      expect(scope.business.id).toBe(A.business)
      expect(scope.billing.access).toBe('trialing')
      expect(scope.businesses.map((b) => b.slug)).toEqual(['byznys-a'])
      expect(rounds).toBeGreaterThan(2)
      request.reset()
      expect(await digestOf(loadBusinessScope('byznys-b'))).toMatch(NOT_FOUND)
    } finally {
      error.mockRestore()
      await db.exec(migration)
    }
  })

  it('bez seedu (server action, route handler) se čte jako dřív: účet a byznys zvlášť', async () => {
    const ctx = await requireWorkspace()
    await requireBusiness(ctx, 'byznys-a')
    expect(rounds).toBe(2)
  })
})

describe('počet kol do DB při navigaci', () => {
  it('kostra + stránka: nejvýš 2 kola (kontext, pak doplňky zároveň se stránkou)', async () => {
    // Layout: kontext, doplňky se rozjedou a stránku neblokují.
    const { ctx, business } = await loadBusinessScope('byznys-a')
    const chrome = getFrameChrome(ctx, business)
    // Stránka: kontext už zná.
    const pageCtx = await requireWorkspace()
    const pageBusiness = await requireBusiness(pageCtx, 'byznys-a')
    await getEnabledModules(pageCtx, pageBusiness)
    // Data stránky = 1 kolo (tady jednoduchý dotaz místo getTodayData).
    await q`SELECT 1`
    await chrome
    // kontext 1 + doplňky 1 (vedle stránky) = 2 kola do DB před daty stránky.
    expect(rounds).toBe(2)
  })

  it('doplňky kostry: jedno kolo, služby i zvonek', async () => {
    const { ctx, business } = await loadBusinessScope('byznys-a')
    rounds = 0
    const chrome = await getFrameChrome(ctx, business)
    expect(rounds).toBe(1)
    expect(chrome.services.length).toBeGreaterThan(0)
    expect(chrome.bell.items.length).toBeGreaterThan(0)
    expect(chrome.bell.unread).toBeGreaterThan(0)
    // Nic z účtu B.
    expect(JSON.stringify(chrome)).not.toContain(B.account)
  })

  it('doplňky kostry nikdy nevyhodí chybu, jen se vrátí prázdné', async () => {
    const { ctx, business } = await loadBusinessScope('byznys-a')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    setWsDriverForTests({
      transaction: () => Promise.reject(new Error('DB nedostupná')),
    })
    try {
      const chrome = await getFrameChrome(ctx, business)
      expect(chrome.services).toEqual([])
      expect(chrome.bell.items).toEqual([])
      expect(error).toHaveBeenCalled()
    } finally {
      error.mockRestore()
      const base = pgliteDriver(db)
      setWsDriverForTests({
        transaction(queries) {
          rounds++
          return base.transaction(queries)
        },
      })
    }
  })
})
