import { NextResponse, type NextRequest } from 'next/server'
import { applyCookies, checkAdminSession, checkUserSession } from '@/lib/supabase/proxy'
import { buildCsp, cspProfileFor, createNonce, hasPrefix } from '@/lib/security/csp'
import { frameAncestorsFor } from '@/lib/security/embed'
import { frontGate } from '@/lib/security/front-gate'
import { embedOriginsForSlug, orderSlugFromPath } from '@/lib/ws/intake/embed-origins'
import { WS_PUBLIC_PATHS, WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { PORTAL_PUBLIC_PATHS, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

/**
 * Jediný proxy (dřív middleware) celého repa; od Next 16 běží na Node runtime. Pořadí:
 *   1. Admin konzole — přihlášení přes Supabase Auth (R-105). Session se tu
 *      obnovuje (jinak by admin po vypršení tokenu vypadl) a cookies jdou na
 *      tutéž odpověď jako CSP. Kdo není přihlášený jako admin, jde na /login.
 *   2. Workspace (`/w`, `/api/ws`) a klientský prostor (`/klient`) — Supabase
 *      Auth jako admin (R-107, R-154; Clerk z repa odešel). Session se tu
 *      obnovuje, veřejné jsou jen přihlášení, registrace, pozvánka a obnova
 *      hesla, zbytek chce přihlášení. Účet a roli hlídá `requireWorkspace()`,
 *      členství firmy `requireClient()` — samotná session do nich nepustí.
 *   3. CSP s nonce pro každou stránku (`lib/security/csp.ts`).
 * Statické hlavičky (HSTS, nosniff, X-Frame-Options…) jsou v `next.config.mjs`.
 * Stav a důvody: `.claude/security/STATE.md`.
 */

// `/alteno` (AD02) a `/hub` (AD03) tu zůstávají jako pojistka: obě sekce
// zanikly a staré adresy přesměrovává next.config.mjs, ale kdyby se pořadí
// routování změnilo, nesmí se nepřihlášený člověk dostat dál než na /login.
const ADMIN_PROTECTED = ['/dashboard', '/alteno', '/hub'] as const

const WS_PATHS = ['/w', '/api/ws'] as const

/**
 * Cesty, kde proxy dělá jen bránu na IP (`frontGate`). Webhooky (`/api/stripe`,
 * `/api/resend`), hook přihlášení a crony sem záměrně nepatří:
 * posílá je jedna platforma z mála adres a 429 by je zbytečně opakovalo.
 */
const GATE_ONLY = ['/api/public', '/api/klient', '/embed'] as const

/**
 * Workspace (R-154): Supabase session jako klientský prostor. API Workspace si
 * přihlášení ověří samo (`requireWorkspace`) a CSP nepotřebuje — tady se mu jen
 * obnoví session, ať server action nedostane prošlý token.
 */
async function workspace(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl
  const { userId, cookiesToSet } = await checkUserSession(req)
  if (hasPrefix(pathname, '/api/ws')) return applyCookies(NextResponse.next(), cookiesToSet)
  if (!userId && !WS_PUBLIC_PATHS.some((p) => hasPrefix(pathname, p))) {
    const url = req.nextUrl.clone()
    url.pathname = WS_SIGN_IN_PATH
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`
    return applyCookies(NextResponse.redirect(url), cookiesToSet)
  }
  return applyCookies(await withCsp(req), cookiesToSet)
}

/** Klientský prostor (R-107): Supabase session. */
async function portal(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl
  const { userId, cookiesToSet } = await checkUserSession(req)
  if (!userId && !PORTAL_PUBLIC_PATHS.some((p) => hasPrefix(pathname, p))) {
    const url = req.nextUrl.clone()
    url.pathname = PORTAL_SIGN_IN_PATH
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`
    return applyCookies(NextResponse.redirect(url), cookiesToSet)
  }
  return applyCookies(await withCsp(req), cookiesToSet)
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Strop požadavků na IP dřív, než se spustí Supabase nebo dotaz do databáze
  // (`lib/security/front-gate.ts`, DECISIONS #050). Vypnutí při potížích: FRONT_GATE=off.
  const limited = frontGate(req)
  if (limited) return limited

  // Veřejná API, API klientského prostoru a widget sem chodí jen kvůli bráně
  // (audit 2026-11-24, #17): přihlášení si ověřují samy a CSP nepotřebují.
  if (GATE_ONLY.some((p) => hasPrefix(pathname, p))) return NextResponse.next()

  if (hasPrefix(pathname, '/klient')) return portal(req)

  if (WS_PATHS.some((p) => hasPrefix(pathname, p))) return workspace(req)

  if (ADMIN_PROTECTED.some((p) => hasPrefix(pathname, p))) {
    const { admin, cookiesToSet } = await checkAdminSession(req)
    if (!admin) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      return applyCookies(NextResponse.redirect(url), cookiesToSet)
    }
    // Druhý faktor hlídá proxy i `requireAdminPage()` na každé stránce (audit 2026-11-24, #2).
    return applyCookies(await withCsp(req), cookiesToSet)
  }

  return withCsp(req)
}

/**
 * Objednávací stránka se vkládá do iframe na weby klientů: `frame-ancestors`
 * = vlastní doména + povolené domény byznysu (web_integrations.allowed_origins,
 * S11). Neznámý slug nebo chyba DB = jen vlastní doména.
 */
async function frameAncestorsForPath(pathname: string): Promise<string[] | undefined> {
  if (!hasPrefix(pathname, '/r')) return undefined
  const slug = orderSlugFromPath(pathname)
  return frameAncestorsFor(slug ? await embedOriginsForSlug(slug) : [])
}

async function withCsp(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const nonce = createNonce()
  const { profile, mode } = cspProfileFor(pathname)

  const csp = buildCsp({
    nonce,
    pathname,
    profile,
    mode,
    isDev: process.env.NODE_ENV === 'development',
    frameAncestors: await frameAncestorsForPath(pathname),
  })
  const header = mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'

  // Next.js čte nonce z request hlavičky CSP a dává ho na své skripty.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(header, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(header, csp)
  return response
}

export const config = {
  matcher: [
    // Stránky. API, widget /embed/*.js, statické soubory Nextu a /.well-known CSP nepotřebují
    // (API routy si přihlášení kontrolují samy, viz AGENTS.md → Bezpečnost).
    '/((?!api/|embed/|_next/static|_next/image|favicon.ico|\\.well-known/).*)',
    // API Workspace — jen kvůli obnově session Supabase (route handlery si přihlášení ověří samy)
    '/api/ws/:path*',
    // Jen brána na IP (GATE_ONLY): veřejná API, API klientského prostoru a widget.
    '/api/public/:path*',
    '/api/klient/:path*',
    '/embed/:path*',
  ],
}
