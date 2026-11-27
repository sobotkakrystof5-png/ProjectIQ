import { execSync } from 'child_process'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import {
  decideSignup,
  INVITE_METADATA_KEY,
  WS_INVITE_METADATA_KEY,
  WS_SIGNUP_METADATA_KEY,
} from '@/lib/supabase/signup-hook'
import { safeWsNext, WS_PUBLIC_PATHS, RESERVED_BUSINESS_SLUGS } from '@/lib/ws/paths'
import { renderWsInviteEmail } from '@/lib/ws/admin/invite-email'

// Workspace přes Supabase Auth (R-154): hook pustí účet jen s oprávněním
// vázaným na e-mail, přesměrování zůstane uvnitř /w a Clerk v repu nezůstal.

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const lookup = (map: Record<string, string>) => async (h: string) => map[h] ?? null

describe('hook Before User Created — Workspace', () => {
  it('pustí účet s pozvánkou vlastníka nebo povolením k registraci jen pro jejich e-mail', async () => {
    const lookups = {
      [INVITE_METADATA_KEY]: lookup({}),
      [WS_INVITE_METADATA_KEY]: lookup({ [H1]: 'jana@firma.cz' }),
      [WS_SIGNUP_METADATA_KEY]: lookup({ [H2]: 'petr@firma.cz' }),
    }
    expect(await decideSignup({ user: { email: 'Jana@Firma.cz', user_metadata: { [WS_INVITE_METADATA_KEY]: H1 } } }, lookups)).toEqual({ allow: true })
    expect(await decideSignup({ user: { email: 'petr@firma.cz', user_metadata: { [WS_SIGNUP_METADATA_KEY]: H2 } } }, lookups)).toEqual({ allow: true })
    // Cizí e-mail, prohozený druh oprávnění, neznámý otisk.
    expect((await decideSignup({ user: { email: 'cizi@firma.cz', user_metadata: { [WS_INVITE_METADATA_KEY]: H1 } } }, lookups)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: { [WS_SIGNUP_METADATA_KEY]: H1 } } }, lookups)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: { [INVITE_METADATA_KEY]: H1 } } }, lookups)).allow).toBe(false)
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: {} } }, lookups)).allow).toBe(false)
  })

  it('bez hledání pro daný druh se otisk ignoruje (nikdy nepustí naslepo)', async () => {
    const onlyPortal = { [INVITE_METADATA_KEY]: lookup({ [H1]: 'jana@firma.cz' }) }
    expect((await decideSignup({ user: { email: 'jana@firma.cz', user_metadata: { [WS_INVITE_METADATA_KEY]: H1 } } }, onlyPortal)).allow).toBe(false)
  })
})

describe('přesměrování po přihlášení do Workspace', () => {
  it('jen uvnitř /w', () => {
    expect(safeWsNext('/w/salon/kalendar?tyden=1')).toBe('/w/salon/kalendar?tyden=1')
    expect(safeWsNext('/w')).toBe('/w')
    for (const bad of ['https://zlo.cz/w', '//zlo.cz', '/w//zlo.cz', '/wiki', '/w\\zlo', '/dashboard', '', null, 'x'.repeat(400)]) {
      expect(safeWsNext(bad)).toBe('/w')
    }
  })

  it('veřejné cesty /w jsou rezervované jako slug byznysu', () => {
    for (const p of WS_PUBLIC_PATHS) {
      const slug = p.split('/')[2]
      if (slug && slug !== '_design') expect(RESERVED_BUSINESS_SLUGS.has(slug), slug).toBe(true)
    }
  })
})

describe('e-mail s pozvánkou do Workspace', () => {
  it('nese odkaz, název firmy escapovaný a datum platnosti; jen https', () => {
    const mail = renderWsInviteEmail({
      businessName: 'Kadeřnictví <script>',
      url: 'https://www.zakaziq.cz/w/pozvanka/zw_abc',
      expiresAt: new Date('2026-12-11T10:00:00Z'),
    })
    expect(mail.text).toContain('https://www.zakaziq.cz/w/pozvanka/zw_abc')
    expect(mail.text).toContain('11. 12. 2026')
    expect(mail.html).not.toContain('<script>')
    expect(() => renderWsInviteEmail({ businessName: 'X', url: 'http://zlo.cz/x', expiresAt: new Date() })).toThrow()
  })
})

describe('Clerk z repa odešel', () => {
  it('v kódu ani v závislostech není @clerk/', () => {
    const root = path.resolve(__dirname, '../..')
    const hits = execSync(
      "git grep -l -e '@clerk/' -- 'app' 'lib' 'components' 'proxy.ts' 'package.json' ':!lib/__tests__/ws-supabase-auth.test.ts' || true",
      { cwd: root, encoding: 'utf8' },
    ).trim()
    expect(hits).toBe('')
  })
})
