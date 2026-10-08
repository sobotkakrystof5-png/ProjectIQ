import { describe, expect, it } from 'vitest'
import { buildCsp, createNonce, cspProfileFor, hasPrefix } from '@/lib/security/csp'

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d === name || d.startsWith(`${name} `))

describe('cspProfileFor', () => {
  it('Workspace naostro, admin Report-Only', () => {
    expect(cspProfileFor('/w')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/w/dnes')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/r/kadernictvi')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/z/abc')).toEqual({ profile: 'workspace', mode: 'enforce' })
    expect(cspProfileFor('/dashboard')).toEqual({ profile: 'admin', mode: 'report-only' })
    expect(cspProfileFor('/p/abc')).toEqual({ profile: 'admin', mode: 'report-only' })
  })

  it('landing page naostro jen na přesných cestách, ne jako prefix /', () => {
    for (const path of ['/', '/podminky', '/ochrana-udaju', '/zpracovatelska-smlouva', '/podminky/']) {
      expect(cspProfileFor(path)).toEqual({ profile: 'workspace', mode: 'enforce' })
    }
    expect(cspProfileFor('/login')).toEqual({ profile: 'admin', mode: 'report-only' })
    expect(cspProfileFor('/hub/finance')).toEqual({ profile: 'admin', mode: 'report-only' })
    expect(cspProfileFor('/podminky-stare')).toEqual({ profile: 'admin', mode: 'report-only' })
    expect(cspProfileFor('/h/abc')).toEqual({ profile: 'admin', mode: 'report-only' })
  })

  it('prefix nechytá podobné cesty', () => {
    expect(hasPrefix('/wiki', '/w')).toBe(false)
    expect(hasPrefix('/hubert', '/hub')).toBe(false)
    expect(cspProfileFor('/wiki').mode).toBe('report-only')
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

describe('createNonce', () => {
  it('je pokaždé jiný a dost dlouhý', () => {
    const a = createNonce()
    const b = createNonce()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(22)
  })
})
