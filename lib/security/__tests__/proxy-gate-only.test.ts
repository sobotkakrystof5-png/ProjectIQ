import { describe, expect, it, vi } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'

/**
 * Brána na IP běží i pro veřejná API, API klientského prostoru a widget
 * (audit 2026-11-24, #17). Proxy na nich dělá **jen** bránu: žádné CSP,
 * žádné přihlášení. Webhooky a crony do matcheru nepatří.
 */

const gateCalls: string[] = []
vi.mock('@/lib/security/front-gate', () => ({
  frontGate: (req: NextRequest) => {
    gateCalls.push(req.nextUrl.pathname)
    return null
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ clerkMiddleware: () => () => new Response('clerk') }))
const sessionChecks: string[] = []
vi.mock('@/lib/supabase/proxy', () => ({
  applyCookies: (r: Response) => r,
  checkAdminSession: async (req: NextRequest) => {
    sessionChecks.push(req.nextUrl.pathname)
    return { admin: null, cookiesToSet: [] }
  },
  checkUserSession: async (req: NextRequest) => {
    sessionChecks.push(req.nextUrl.pathname)
    return { userId: null, cookiesToSet: [] }
  },
}))

import proxy, { config } from '@/proxy'

const event = {} as NextFetchEvent

describe('proxy — jen brána pro API a widget', () => {
  it('matcher zahrnuje veřejná API, API prostoru a widget, ne webhooky a crony', () => {
    expect(config.matcher).toEqual(expect.arrayContaining(['/api/public/:path*', '/api/klient/:path*', '/embed/:path*']))
    for (const m of config.matcher) {
      expect(m).not.toMatch(/stripe|clerk|resend|cron|auth/)
    }
  })

  it.each(['/api/public/booking', '/api/klient/zpravy/123', '/embed/kadernictvi.js'])('%s projde bránou bez CSP a přihlášení', async (path) => {
    gateCalls.length = 0
    sessionChecks.length = 0
    const res = await proxy(new NextRequest(`https://www.zakaziq.cz${path}`), event)
    expect(gateCalls).toEqual([path])
    expect(sessionChecks).toEqual([])
    expect(res!.headers.get('Content-Security-Policy')).toBeNull()
    expect(res!.headers.get('Content-Security-Policy-Report-Only')).toBeNull()
  })
})
