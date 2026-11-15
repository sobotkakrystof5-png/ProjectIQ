import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Přihlášení do adminu přes Supabase Auth (R-105). Hlídá tři věci, na kterých
 * stojí bezpečnost: do adminu smí jen `ADMIN_EMAIL`, zapsaný druhý faktor se
 * nedá obejít, a session v cookie zůstává nedostupná JavaScriptu a krátká.
 */

const ADMIN = 'admin@example.cz'

process.env.SUPABASE_URL = 'https://projekt.supabase.co'
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
process.env.ADMIN_EMAIL = ADMIN

type Claims = Record<string, unknown> | null

const state: { claims: Claims; totpFactors: { id: string }[] } = { claims: null, totpFactors: [] }

vi.mock('@/lib/db', () => ({ sql: async () => [{ count: 0 }] }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      mfa: { listFactors: async () => ({ data: { totp: state.totpFactors, all: state.totpFactors }, error: null }) },
    },
  }),
}))

import { loadAdminSession } from '@/lib/auth'
import { ADMIN_SESSION_MAX_AGE_SECONDS, hardenedCookieOptions } from '@/lib/supabase/cookies'
import { isAdminEmail } from '@/lib/supabase/config'

beforeEach(() => {
  state.claims = null
  state.totpFactors = []
})

describe('kdo se dostane do adminu', () => {
  it('bez session nikdo', async () => {
    expect(await loadAdminSession()).toBeNull()
  })

  it('admin s heslem projde, dokud nemá druhý faktor', async () => {
    state.claims = { email: ADMIN, sub: 'uuid-1', aal: 'aal1' }
    expect(await loadAdminSession()).toEqual({ email: ADMIN, userId: 'uuid-1', aal: 'aal1' })
  })

  it('cizí účet neprojde, i když je přihlášený', async () => {
    state.claims = { email: 'kdokoli@jinde.cz', sub: 'uuid-2', aal: 'aal2' }
    expect(await loadAdminSession()).toBeNull()
  })

  it('e-mail se porovnává bez ohledu na velikost písmen', async () => {
    state.claims = { email: 'Admin@Example.CZ', sub: 'uuid-3', aal: 'aal2' }
    expect(await loadAdminSession()).not.toBeNull()
    expect(isAdminEmail(' ADMIN@EXAMPLE.CZ ')).toBe(true)
    expect(isAdminEmail('admin@example.cz.jinde.cz')).toBe(false)
  })

  it('kdo má zapsanou ověřovací aplikaci, nesmí ji přeskočit', async () => {
    state.claims = { email: ADMIN, sub: 'uuid-4', aal: 'aal1' }
    state.totpFactors = [{ id: 'faktor-1' }]
    expect(await loadAdminSession()).toBeNull()

    state.claims = { email: ADMIN, sub: 'uuid-4', aal: 'aal2' }
    expect(await loadAdminSession()).not.toBeNull()
  })

  it('session bez e-mailu neprojde', async () => {
    state.claims = { sub: 'uuid-5', aal: 'aal2' }
    expect(await loadAdminSession()).toBeNull()
  })
})

describe('cookie se session', () => {
  it('není čitelná JavaScriptem a platí nejvýš 12 hodin', () => {
    const o = hardenedCookieOptions({ maxAge: 400 * 24 * 60 * 60, httpOnly: false, sameSite: 'strict' })
    expect(o.httpOnly).toBe(true)
    expect(o.maxAge).toBe(ADMIN_SESSION_MAX_AGE_SECONDS)
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBe(12 * 60 * 60)
    expect(o.sameSite).toBe('lax')
    expect(o.path).toBe('/')
  })

  it('bez zadané platnosti dostane strop, mazání projde', () => {
    expect(hardenedCookieOptions(undefined).maxAge).toBe(ADMIN_SESSION_MAX_AGE_SECONDS)
    expect(hardenedCookieOptions({ maxAge: 0 }).maxAge).toBe(0)
  })
})

describe('NextAuth v repu nezůstal', () => {
  const ROOT = path.resolve(__dirname, '../..')
  const tracked = (pattern: string): string[] =>
    execFileSync('git', ['ls-files', pattern], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)

  it('žádný soubor neimportuje next-auth', () => {
    // Testy se vynechávají — ty o NextAuthu mluvit smějí (i tenhle).
    const files = [
      ...tracked('app/**/*.ts'),
      ...tracked('app/**/*.tsx'),
      ...tracked('lib/**/*.ts'),
      ...tracked('components/**/*.tsx'),
      ...tracked('proxy.ts'),
    ]
      .filter((f) => !f.includes('__tests__'))
      // Soubor smazaný na disku, ale ještě v indexu gitu (nezastagované smazání).
      .filter((f) => fs.existsSync(path.join(ROOT, f)))
    const offenders = files.filter((f) => /from 'next-auth|require\('next-auth/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('next-auth ani bcryptjs nejsou v závislostech', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps['next-auth']).toBeUndefined()
    expect(deps['bcryptjs']).toBeUndefined()
  })
})
