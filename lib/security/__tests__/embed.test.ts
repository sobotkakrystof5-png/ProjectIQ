import { describe, expect, it } from 'vitest'
import { corsHeaders, frameAncestorsFor, normalizeOrigin, preflightResponse } from '@/lib/security/embed'

describe('normalizeOrigin', () => {
  it('přijme čistý https origin', () => {
    expect(normalizeOrigin('https://kadernictvi.cz')).toBe('https://kadernictvi.cz')
    expect(normalizeOrigin(' https://Kadernictvi.cz/ ')).toBe('https://kadernictvi.cz')
    expect(normalizeOrigin('https://web.cz:8443')).toBe('https://web.cz:8443')
  })

  it('odmítne wildcard, http, cestu, query a přihlašovací údaje', () => {
    expect(normalizeOrigin('https://*.kadernictvi.cz')).toBeNull()
    expect(normalizeOrigin('*')).toBeNull()
    expect(normalizeOrigin('http://kadernictvi.cz')).toBeNull()
    expect(normalizeOrigin('https://kadernictvi.cz/rezervace')).toBeNull()
    expect(normalizeOrigin('https://kadernictvi.cz/?a=1')).toBeNull()
    expect(normalizeOrigin('https://user:pass@kadernictvi.cz')).toBeNull()
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull()
    expect(normalizeOrigin('nesmysl')).toBeNull()
    expect(normalizeOrigin('')).toBeNull()
  })
})

describe('frameAncestorsFor', () => {
  it("bez domén jen 'self'", () => {
    expect(frameAncestorsFor([])).toEqual(["'self'"])
  })

  it('neplatné záznamy přeskočí, duplicity sloučí', () => {
    expect(
      frameAncestorsFor(['https://a.cz', 'https://a.cz/', 'http://b.cz', 'https://*.c.cz', 'https://www.a.cz'])
    ).toEqual(["'self'", 'https://a.cz', 'https://www.a.cz'])
  })
})

describe('corsHeaders', () => {
  const allowed = ['https://kadernictvi.cz']

  it('povolený origin dostane přesně svůj origin, nikdy *', () => {
    const h = corsHeaders('https://kadernictvi.cz', allowed)
    expect(h.get('Access-Control-Allow-Origin')).toBe('https://kadernictvi.cz')
    expect(h.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(h.get('Vary')).toBe('Origin')
  })

  it('cizí nebo chybějící origin žádné CORS povolení nedostane', () => {
    expect(corsHeaders('https://utocnik.cz', allowed).get('Access-Control-Allow-Origin')).toBeNull()
    expect(corsHeaders('http://kadernictvi.cz', allowed).get('Access-Control-Allow-Origin')).toBeNull()
    expect(corsHeaders(null, allowed).get('Access-Control-Allow-Origin')).toBeNull()
    expect(corsHeaders('https://kadernictvi.cz', []).get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('preflight: povolený 204, cizí 403', () => {
    expect(preflightResponse('https://kadernictvi.cz', allowed).status).toBe(204)
    expect(preflightResponse('https://utocnik.cz', allowed).status).toBe(403)
  })
})
