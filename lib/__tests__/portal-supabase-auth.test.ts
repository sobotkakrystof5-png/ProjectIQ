import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { decideSignup, INVITE_METADATA_KEY } from '@/lib/supabase/signup-hook'
import { safePortalNext } from '@/lib/portal/paths'
import { verifySvix } from '@/lib/security/webhook-signature'
import { buildCsp } from '@/lib/security/csp'
import { isAdminUser } from '@/lib/supabase/config'

// Klientský prostor přes Supabase Auth (R-107): kdo smí založit účet, kam se smí
// po přihlášení přesměrovat a že v /klient nezůstal Clerk.

const HASH = 'a'.repeat(64)
const lookup = (map: Record<string, string>) => async (h: string) => map[h] ?? null

describe('hook Before User Created', () => {
  it('pustí jen účet s otiskem platné pozvánky a shodným e-mailem', async () => {
    const payload = { user: { email: 'Jana@Firma.cz', user_metadata: { [INVITE_METADATA_KEY]: HASH } } }
    expect(await decideSignup(payload, lookup({ [HASH]: 'jana@firma.cz' }))).toEqual({ allow: true })
  })

  it('odmítne registraci bez otisku, s cizím e-mailem i s neznámým otiskem', async () => {
    const known = lookup({ [HASH]: 'jana@firma.cz' })
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: {} } }, known)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'cizi@firma.cz', user_metadata: { [INVITE_METADATA_KEY]: HASH } } }, known)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: { [INVITE_METADATA_KEY]: 'b'.repeat(64) } } }, known)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: { [INVITE_METADATA_KEY]: 'nehex' } } }, known)).allow).toBe(false)
    expect((await decideSignup({}, known)).allow).toBe(false)
  })

  it('admin účet tudy nevznikne (žádná výjimka pro ADMIN_EMAIL)', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@zakaziq.cz')
    expect((await decideSignup({ user: { email: 'admin@zakaziq.cz', user_metadata: {} } }, lookup({}))).allow).toBe(false)
    vi.unstubAllEnvs()
  })
})

describe('admin připnutý na id účtu', () => {
  it('s ADMIN_USER_ID nestačí shodný e-mail', () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@zakaziq.cz')
    vi.stubEnv('ADMIN_USER_ID', '11111111-1111-4111-8111-111111111111')
    expect(isAdminUser('Admin@zakaziq.cz', '11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isAdminUser('admin@zakaziq.cz', '22222222-2222-4222-8222-222222222222')).toBe(false)
    expect(isAdminUser('klient@firma.cz', '11111111-1111-4111-8111-111111111111')).toBe(false)
    vi.stubEnv('ADMIN_USER_ID', '')
    expect(isAdminUser('admin@zakaziq.cz', 'cokoli')).toBe(true)
    vi.unstubAllEnvs()
  })
})

describe('podpis hooku (Standard Webhooks)', () => {
  const key = Buffer.from('tajny-klic-pro-test-32-bajtu!!!!').toString('base64')
  const sign = (id: string, ts: number, body: string) =>
    `v1,${createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${ts}.${body}`).digest('base64')}`

  it('přijme tajemství ve tvaru ze Supabase (v1,whsec_…) i bez předpony', () => {
    const ts = 1_800_000_000
    const body = '{"user":{}}'
    const headers = { id: 'msg_1', timestamp: String(ts), signature: sign('msg_1', ts, body) }
    expect(verifySvix(body, headers, `v1,whsec_${key}`, ts)).toBe(true)
    expect(verifySvix(body, headers, `whsec_${key}`, ts)).toBe(true)
    expect(verifySvix(`${body} `, headers, `v1,whsec_${key}`, ts)).toBe(false)
    expect(verifySvix(body, headers, `v1,whsec_${key}`, ts + 600)).toBe(false)
    expect(verifySvix(body, headers, undefined, ts)).toBe(false)
  })
})

describe('přesměrování po přihlášení', () => {
  it('jen uvnitř /klient', () => {
    expect(safePortalNext('/klient/projekt/abc')).toBe('/klient/projekt/abc')
    expect(safePortalNext('/klient/pozvanka/zi_x?a=1')).toBe('/klient/pozvanka/zi_x?a=1')
    expect(safePortalNext('/klient')).toBe('/klient')
    for (const bad of ['https://zlo.cz', '//zlo.cz', '/klientela', '/dashboard', '/klient//zlo.cz', '/klient\\..\\x', null, 42]) {
      expect(safePortalNext(bad)).toBe('/klient')
    }
  })
})

describe('Clerk v klientském prostoru', () => {
  const root = path.resolve(__dirname, '../..')
  const files = [
    'app/klient/layout.tsx',
    'app/klient/actions.ts',
    'app/klient/prihlaseni/page.tsx',
    'app/klient/pozvanka/[kod]/page.tsx',
    'app/klient/bez-pristupu/page.tsx',
    'components/portal/client-shell.tsx',
    'lib/portal/context.ts',
  ]

  it('žádný soubor /klient neimportuje Clerk', () => {
    for (const f of files) expect(readFileSync(path.join(root, f), 'utf8')).not.toMatch(/@clerk\//)
  })

  it('CSP na /klient nepovoluje hosty Clerku', () => {
    const csp = buildCsp({
      nonce: 'n',
      pathname: '/klient/prihlaseni',
      profile: 'workspace',
      mode: 'enforce',
    })
    expect(csp).not.toContain('clerk')
  })
})
