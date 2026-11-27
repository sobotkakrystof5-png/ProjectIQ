import { describe, expect, it } from 'vitest'
import { buildCsp, createNonce, cspProfileFor, hasPrefix } from '@/lib/security/csp'

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d === name || d.startsWith(`${name} `))

describe('cspProfileFor', () => {
  it('Workspace i admin naostro, každý svým profilem', () => {
    expect(cspProfileFor('/w')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/w/dnes')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/r/kadernictvi')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/z/abc')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/klient')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/klient/projekt/abc')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/dashboard')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/p/abc')).toEqual({ profile: 'admin', mode: 'enforce' })
  })

  it('landing page naostro jen na přesných cestách, ne jako prefix /', () => {
    for (const path of ['/', '/podminky', '/ochrana-udaju', '/zpracovatelska-smlouva', '/podminky/']) {
      expect(cspProfileFor(path)).toEqual({ profile: 'workspace', mode: 'enforce' })
    }
    expect(cspProfileFor('/login')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/dashboard/finance')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/podminky-stare')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/h/abc')).toEqual({ profile: 'admin', mode: 'enforce' })
  })

  it('prefix nechytá podobné cesty', () => {
    expect(hasPrefix('/wiki', '/w')).toBe(false)
    expect(hasPrefix('/klientela', '/klient')).toBe(false)
    expect(cspProfileFor('/klientela').profile).toBe('admin')
    expect(hasPrefix('/zakazky', '/z')).toBe(false)
    expect(cspProfileFor('/wiki').profile).toBe('admin')
  })
})

describe('buildCsp', () => {
  const nonce = 'abc123'

  it('script-src jen s nonce a strict-dynamic, v produkci bez unsafe-*', () => {
    for (const profile of ['admin', 'workspace'] as const) {
      const csp = buildCsp({ nonce, pathname: '/x', profile, mode: 'enforce' })
      const script = directive(csp, 'script-src')!
      expect(script).toContain(`'nonce-${nonce}'`)
      expect(script).toContain("'strict-dynamic'")
      expect(script).not.toContain('unsafe-inline')
      expect(script).not.toContain('unsafe-eval')
      expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/)
    }
  })

  it('unsafe-eval jen ve vývoji', () => {
    const csp = buildCsp({ nonce, pathname: '/w', profile: 'workspace', mode: 'enforce', isDev: true })
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'")
  })

  it('povinné direktivy jsou vždy', () => {
    const csp = buildCsp({ nonce, pathname: '/w', profile: 'workspace', mode: 'enforce' })
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'upgrade-insecure-requests')).toBeDefined()
  })

  it('Google Fonts ani TradingView nepouští nikdo', () => {
    const ws = buildCsp({ nonce, pathname: '/w', profile: 'workspace', mode: 'enforce' })
    const admin = buildCsp({ nonce, pathname: '/dashboard/finance', profile: 'admin', mode: 'report-only' })
    const login = buildCsp({ nonce, pathname: '/login', profile: 'admin', mode: 'report-only' })
    expect(ws).not.toContain('fonts.googleapis.com')
    expect(ws).not.toContain('tradingview')
    expect(directive(ws, 'frame-src')).toBe("frame-src 'none'")
    // Inter přes @import zmizel, Instrument Sans jde z vlastní domény přes next/font.
    for (const csp of [admin, login]) {
      expect(csp).not.toContain('fonts.googleapis.com')
      expect(csp).not.toContain('fonts.gstatic.com')
    }
    expect(admin).not.toContain('tradingview')
    expect(directive(admin, 'frame-src')).toBe("frame-src 'none'")
  })

  it("object-src a frame-src 'self' jen u faktur", () => {
    const faktura = buildCsp({ nonce, pathname: '/dashboard/faktury/1', profile: 'admin', mode: 'report-only' })
    const jinde = buildCsp({ nonce, pathname: '/dashboard', profile: 'admin', mode: 'report-only' })
    expect(directive(faktura, 'object-src')).toBe("object-src 'self'")
    expect(directive(faktura, 'frame-src')).toContain("'self'")
    expect(directive(jinde, 'frame-src')).not.toContain("'self'")
    expect(directive(jinde, 'object-src')).toBe("object-src 'none'")
  })

  it('Report-Only bez upgrade-insecure-requests', () => {
    const csp = buildCsp({ nonce, pathname: '/dashboard', profile: 'admin', mode: 'report-only' })
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('frame-ancestors jde přepsat pro vkládané stránky', () => {
    const csp = buildCsp({
      nonce,
      pathname: '/r/x',
      profile: 'workspace',
      mode: 'enforce',
      frameAncestors: ["'self'", 'https://kadernictvi.cz'],
    })
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self' https://kadernictvi.cz")
  })
})

describe('přihlášení bez cizích hostů (R-154, Clerk z repa odešel)', () => {
  const nonce = 'abc'
  it('/w, /klient, landing, portál i admin: connect-src jen vlastní doména, žádný Clerk ani Turnstile', () => {
    const w = buildCsp({ nonce, pathname: '/w/prihlaseni', profile: 'workspace', mode: 'enforce' })
    expect(directive(w, 'connect-src')).toBe(`connect-src 'self'`)
    expect(directive(w, 'frame-src')).toBe(`frame-src 'none'`)
    const klient = buildCsp({ nonce, pathname: '/klient/prihlaseni', profile: 'workspace', mode: 'enforce' })
    const landing = buildCsp({ nonce, pathname: '/', profile: 'workspace', mode: 'enforce' })
    const admin = buildCsp({ nonce, pathname: '/dashboard', profile: 'admin', mode: 'report-only' })
    const portal = buildCsp({ nonce, pathname: '/z/abc', profile: 'workspace', mode: 'enforce' })
    for (const csp of [w, klient, landing, admin, portal]) {
      expect(csp).not.toContain('clerk')
      expect(csp).not.toContain('challenges.cloudflare.com')
      expect(csp).not.toContain('*')
    }
  })
})

describe('createNonce', () => {
  it('je pokaždé jiný a dost dlouhý', () => {
    const a = createNonce()
    const b = createNonce()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(22)
  })
})
