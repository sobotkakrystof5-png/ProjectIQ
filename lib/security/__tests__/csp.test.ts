import { describe, expect, it } from 'vitest'
import { buildCsp, createNonce, cspProfileFor, hasPrefix, supabaseOrigin } from '@/lib/security/csp'

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
    expect(cspProfileFor('/hub/finance')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/podminky-stare')).toEqual({ profile: 'admin', mode: 'enforce' })
    expect(cspProfileFor('/h/abc')).toEqual({ profile: 'admin', mode: 'enforce' })
  })

  it('prefix nechytá podobné cesty', () => {
    expect(hasPrefix('/wiki', '/w')).toBe(false)
    expect(hasPrefix('/klientela', '/klient')).toBe(false)
    expect(cspProfileFor('/klientela').profile).toBe('admin')
    expect(hasPrefix('/hubert', '/hub')).toBe(false)
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

  it('Workspace nepouští Google Fonts ani TradingView, admin ano', () => {
    const ws = buildCsp({ nonce, pathname: '/w', profile: 'workspace', mode: 'enforce' })
    const admin = buildCsp({ nonce, pathname: '/hub/finance', profile: 'admin', mode: 'report-only' })
    expect(ws).not.toContain('fonts.googleapis.com')
    expect(ws).not.toContain('tradingview')
    expect(directive(ws, 'frame-src')).toBe("frame-src 'none'")
    expect(directive(admin, 'style-src')).toContain('https://fonts.googleapis.com')
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

describe('Supabase Auth', () => {
  const nonce = 'dGVzdG5vbmNl'
  const origin = 'https://abcdefghijklmnop.supabase.co'

  it('origin jen z platné https adresy projektu', () => {
    expect(supabaseOrigin('https://abcdefghijklmnop.supabase.co')).toBe(origin)
    expect(supabaseOrigin('https://abcdefghijklmnop.supabase.co/')).toBe(origin)
    expect(supabaseOrigin('http://localhost:54321')).toBe('http://localhost:54321')
  })

  it('neplatná adresa nepustí nic', () => {
    expect(supabaseOrigin(undefined)).toBeNull()
    expect(supabaseOrigin('')).toBeNull()
    expect(supabaseOrigin('http://evil.example.com')).toBeNull()
    expect(supabaseOrigin('https://x.supabase.co/rest/v1')).toBeNull()
    expect(supabaseOrigin('https://user:pass@x.supabase.co')).toBeNull()
    expect(supabaseOrigin('javascript:alert(1)')).toBeNull()
    expect(supabaseOrigin('nesmysl')).toBeNull()
  })

  it('connect-src na přihlašovacích cestách, script-src beze změny, rámeček jen Turnstile', () => {
    const w = buildCsp({ nonce, pathname: '/w/prihlaseni', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    expect(directive(w, 'connect-src')).toBe(`connect-src 'self' ${origin}`)
    expect(directive(w, 'script-src')).not.toContain(origin)
    expect(directive(w, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com')
    expect(w).not.toContain('*')

    // Přihlášený Workspace (2FA, zabezpečení) Supabase volá, rámeček Turnstile nepotřebuje.
    const ucet = buildCsp({ nonce, pathname: '/w/zabezpeceni', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    expect(directive(ucet, 'connect-src')).toBe(`connect-src 'self' ${origin}`)
    expect(directive(ucet, 'frame-src')).toBe("frame-src 'none'")

    const klient = buildCsp({ nonce, pathname: '/klient/prihlaseni', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    expect(directive(klient, 'connect-src')).toBe(`connect-src 'self' ${origin}`)

    // Admin přihlášení (/login) volá Supabase taky, zbytek adminu ne.
    const login = buildCsp({ nonce, pathname: '/login', profile: 'admin', mode: 'enforce', supabaseOrigin: origin })
    expect(directive(login, 'connect-src')).toBe(`connect-src 'self' ${origin}`)
    expect(directive(login, 'frame-src')).toContain('https://challenges.cloudflare.com')

    // Zabezpečení admin účtu (2FA) volá Supabase z prohlížeče, ostatní admin stránky ne.
    const security = buildCsp({ nonce, pathname: '/dashboard/zabezpeceni', profile: 'admin', mode: 'enforce', supabaseOrigin: origin })
    expect(directive(security, 'connect-src')).toBe(`connect-src 'self' ${origin}`)
    expect(directive(security, 'frame-src')).not.toContain('challenges.cloudflare.com')

    const landing = buildCsp({ nonce, pathname: '/', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    const admin = buildCsp({ nonce, pathname: '/hub', profile: 'admin', mode: 'report-only', supabaseOrigin: origin })
    const portal = buildCsp({ nonce, pathname: '/z/abc', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    const order = buildCsp({ nonce, pathname: '/r/kadernictvi', profile: 'workspace', mode: 'enforce', supabaseOrigin: origin })
    for (const csp of [landing, admin, portal, order]) expect(csp).not.toContain('supabase')
    for (const csp of [landing, admin, portal, order]) expect(csp).not.toContain('challenges.cloudflare.com')
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
