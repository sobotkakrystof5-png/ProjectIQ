import { describe, expect, it } from 'vitest'
import { buildCsp, clerkFrontendApiHost, createNonce, cspProfileFor, hasPrefix } from '@/lib/security/csp'

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

  it('Google Fonts nepouští nikdo (AD04), TradingView jen admin', () => {
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
    expect(directive(admin, 'frame-src')).toBe('frame-src https://www.tradingview-widget.com')
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

describe('Clerk', () => {
  const nonce = 'dGVzdG5vbmNl'
  // pk_test_ + base64("demo-app-12.clerk.accounts.dev$")
  const key = `pk_test_${btoa('demo-app-12.clerk.accounts.dev$')}`
  const host = 'demo-app-12.clerk.accounts.dev'

  it('host Frontend API z publishable key', () => {
    expect(clerkFrontendApiHost(key)).toBe(host)
    expect(clerkFrontendApiHost(`pk_live_${btoa('clerk.zakaziq.cz$')}`)).toBe('clerk.zakaziq.cz')
  })

  it('neplatný klíč nepustí nic', () => {
    expect(clerkFrontendApiHost(undefined)).toBeNull()
    expect(clerkFrontendApiHost('sk_test_abc')).toBeNull()
    expect(clerkFrontendApiHost(`pk_test_${btoa('*.evil.com$')}`)).toBeNull()
    expect(clerkFrontendApiHost(`pk_test_${btoa('a.b.cz https://x.cz$')}`)).toBeNull()
    expect(clerkFrontendApiHost(`pk_test_${btoa('bez-dolaru.cz')}`)).toBeNull()
  })

  it('jen na /w, konkrétní hosty, script-src beze změny', () => {
    const w = buildCsp({ nonce, pathname: '/w/prihlaseni', profile: 'workspace', mode: 'enforce', clerkHost: host })
    expect(directive(w, 'connect-src')).toBe(`connect-src 'self' https://${host}`)
    expect(directive(w, 'img-src')).toContain('https://img.clerk.com')
    expect(directive(w, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com')
    expect(directive(w, 'script-src')).not.toContain(host)
    expect(w).not.toContain('*')

    // Klientský prostor (KP05) má stejné Clerk zdroje jako /w a nic víc.
    const klient = buildCsp({ nonce, pathname: '/klient/prihlaseni', profile: 'workspace', mode: 'enforce', clerkHost: host })
    expect(directive(klient, 'connect-src')).toBe(`connect-src 'self' https://${host}`)
    expect(directive(klient, 'script-src')).not.toContain(host)
    expect(klient).not.toContain('*')

    const landing = buildCsp({ nonce, pathname: '/', profile: 'workspace', mode: 'enforce', clerkHost: host })
    const admin = buildCsp({ nonce, pathname: '/dashboard', profile: 'admin', mode: 'report-only', clerkHost: host })
    const portal = buildCsp({ nonce, pathname: '/z/abc', profile: 'workspace', mode: 'enforce', clerkHost: host })
    for (const csp of [landing, admin, portal]) expect(csp).not.toContain('clerk')
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
