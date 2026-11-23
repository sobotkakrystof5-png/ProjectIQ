import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { applyCookies, checkAdminSession, checkUserSession } from '@/lib/supabase/proxy'
import { clerkAuthorizedParties } from '@/lib/security/clerk'
import { buildCsp, clerkFrontendApiHost, cspProfileFor, createNonce, hasPrefix } from '@/lib/security/csp'
import { frameAncestorsFor } from '@/lib/security/embed'
import { frontGate } from '@/lib/security/front-gate'
import { embedOriginsForSlug, orderSlugFromPath } from '@/lib/ws/intake/embed-origins'
import { WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'
import { PORTAL_PUBLIC_PATHS, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

/**
 * Jediný proxy (dřív middleware) celého repa; od Next 16 běží na Node runtime. Pořadí:
 *   1. Admin konzole — přihlášení přes Supabase Auth (R-105). Session se tu
 *      obnovuje (jinak by admin po vypršení tokenu vypadl) a cookies jdou na
 *      tutéž odpověď jako CSP. Kdo není přihlášený jako admin, jde na /login.
 *   2. Workspace (`/w`, `/api/ws`) — Clerk. Běží jen tady, admin a landing page
 *      Clerk vůbec nespouští. Bez přihlášení → `/w/prihlaseni` (kromě
 *      přihlášení a registrace). Účet a organizaci hlídá `requireWorkspace()`.
 *   2b. Klientský prostor (`/klient`, KP05) — od R-107 Supabase Auth jako admin:
 *      session se tu obnovuje, veřejné jsou jen přihlášení, pozvánka a obnova
 *      hesla, zbytek chce přihlášení. Členství firmy hlídá `requireClient()`.
 *   3. CSP s nonce pro každou stránku (`lib/security/csp.ts`). Clerk hlavičky
 *      požadavku s nonce zachová (přidává k nim své), ClerkProvider si nonce
 *      přečte z `x-nonce`.
 * Statické hlavičky (HSTS, nosniff, X-Frame-Options…) jsou v `next.config.mjs`.
 * Stav a důvody: `.claude/security/STATE.md`.
 */

// `/alteno` (AD02) a `/hub` (AD03) tu zůstávají jako pojistka: obě sekce
// zanikly a staré adresy přesměrovává next.config.mjs, ale kdyby se pořadí
// routování změnilo, nesmí se nepřihlášený člověk dostat dál než na /login.
const ADMIN_PROTECTED = ['/dashboard', '/alteno', '/hub'] as const

const CLERK_PATHS = ['/w', '/api/ws'] as const

/** Stránky /w přístupné bez přihlášení. `/w/_design` je v produkci 404. */
const WS_PUBLIC = [WS_SIGN_IN_PATH, WS_SIGN_UP_PATH, '/w/_design'] as const

const CLERK_HOST = clerkFrontendApiHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/** V produkci jen session tokeny vydané pro hlavní host (`lib/security/clerk.ts`). */
const CLERK_AUTHORIZED_PARTIES = clerkAuthorizedParties(process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_APP_URL)

const workspace = clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl
    // API Workspace si přihlášení ověří samo (requireWorkspace), CSP nepotřebuje.
    if (hasPrefix(pathname, '/api/ws')) return NextResponse.next()
    if (!WS_PUBLIC.some((p) => hasPrefix(pathname, p))) await auth.protect()
    return withCsp(req)
  },
  { signInUrl: WS_SIGN_IN_PATH, signUpUrl: WS_SIGN_UP_PATH, authorizedParties: CLERK_AUTHORIZED_PARTIES },
)

/** Klientský prostor (R-107): Supabase session, bez Clerku. */
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

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  // Strop požadavků na IP dřív, než se spustí Clerk, Supabase nebo dotaz do databáze
  // (`lib/security/front-gate.ts`, DECISIONS #050). Vypnutí při potížích: FRONT_GATE=off.
  const limited = frontGate(req)
  if (limited) return limited

  if (hasPrefix(pathname, '/klient')) return portal(req)

  if (CLERK_PATHS.some((p) => hasPrefix(pathname, p))) return workspace(req, event)

  if (ADMIN_PROTECTED.some((p) => hasPrefix(pathname, p))) {
    const { admin, cookiesToSet } = await checkAdminSession(req)
    if (!admin) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      return applyCookies(NextResponse.redirect(url), cookiesToSet)
    }
    // Druhý faktor a platnost hlídá ještě `getAdminSession()` na stránce samé.
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
    clerkHost: CLERK_HOST,
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
    // API Workspace — jen kvůli Clerku (auth() v route handlerech)
    '/api/ws/:path*',
  ],
}
