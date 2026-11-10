import { NextResponse, type NextRequest } from 'next/server'
import { readProxySession } from '@/lib/supabase/proxy'
import { isAdminIdentity } from '@/lib/auth/admin-identity'
import { buildCsp, cspProfileFor, createNonce, hasPrefix, supabaseOrigin } from '@/lib/security/csp'
import { frameAncestorsFor } from '@/lib/security/embed'
import { embedOriginsForSlug, orderSlugFromPath } from '@/lib/ws/intake/embed-origins'
import { WS_PUBLIC_PATHS, WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { PORTAL_PUBLIC_PATHS, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

/**
 * Jediný proxy (dřív middleware) celého repa; od Next 16 běží na Node runtime.
 * Přihlášení všude přes Supabase Auth (R-080). Pořadí:
 *   1. Session — jen na cestách, kde se přihlášení používá (aplikace, admin,
 *      přihlašovací stránky, /auth). Ověří JWT z cookie a prošlý token obnoví
 *      (lib/supabase/proxy.ts). Landing page a veřejné stránky Supabase nevolají.
 *   2. Klientský prostor (`/klient`, KP05) — bez přihlášení jen přihlášení,
 *      registrace, obnova hesla a pozvánka. Členství firmy hlídá `requireClient()`.
 *   3. Workspace (`/w`, `/api/ws`) — bez přihlášení → `/w/prihlaseni`. Účet
 *      a roli hlídá `requireWorkspace()`. API si přihlášení ověří samo.
 *   4. Admin konzole — přihlášený účet s ADMIN_EMAIL, jinak `/login`; bez
 *      ověřeného kódu z aplikace (2FA, úroveň aal2) na `/login/overeni` (R-081).
 *      Rozhodující kontrola je v layoutu (`getAdminSession`, uživatel z Auth serveru).
 *   5. CSP s nonce pro každou stránku (`lib/security/csp.ts`).
 * Statické hlavičky (HSTS, nosniff, X-Frame-Options…) jsou v `next.config.mjs`.
 * Stav a důvody: `.claude/security/STATE.md`.
 */

const ADMIN_PROTECTED = ['/dashboard', '/alteno', '/hub'] as const
/** Admin bez ověřeného kódu z aplikace (2FA) — R-081. */
const ADMIN_MFA_PATH = '/login/overeni'
const WS_PATHS = ['/w', '/api/ws'] as const
const PORTAL_PATHS = ['/klient', '/api/klient'] as const

/** Kde proxy čte a obnovuje session. */
const SESSION_PATHS = [...WS_PATHS, ...PORTAL_PATHS, ...ADMIN_PROTECTED, '/login', '/auth'] as const

const SUPABASE_ORIGIN = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL)

const startsWithAny = (pathname: string, prefixes: readonly string[]) => prefixes.some((p) => hasPrefix(pathname, p))

/** Na přihlášení a po něm zpátky, kam člověk mířil. */
function toSignIn(req: NextRequest, signInPath: string): NextResponse {
  const url = new URL(signInPath, req.nextUrl.origin)
  url.searchParams.set('next', `${req.nextUrl.pathname}${req.nextUrl.search}`)
  return NextResponse.redirect(url)
}

/** API: obnovené cookies musí vidět i route handler v tomtéž požadavku. */
const passThrough = (req: NextRequest) => NextResponse.next({ request: { headers: new Headers(req.headers) } })

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!startsWithAny(pathname, SESSION_PATHS)) return withCsp(req)

  const session = await readProxySession(req)

  if (startsWithAny(pathname, PORTAL_PATHS)) {
    if (hasPrefix(pathname, '/api/klient')) return session.apply(passThrough(req))
    if (!session.userId && !startsWithAny(pathname, PORTAL_PUBLIC_PATHS)) return session.apply(toSignIn(req, PORTAL_SIGN_IN_PATH))
    return session.apply(await withCsp(req))
  }

  if (startsWithAny(pathname, WS_PATHS)) {
    if (hasPrefix(pathname, '/api/ws')) return session.apply(passThrough(req))
    if (!session.userId && !startsWithAny(pathname, WS_PUBLIC_PATHS)) return session.apply(toSignIn(req, WS_SIGN_IN_PATH))
    return session.apply(await withCsp(req))
  }

  if (startsWithAny(pathname, ADMIN_PROTECTED)) {
    if (!isAdminIdentity({ id: session.userId, email: session.email })) return session.apply(toSignIn(req, '/login'))
    if (session.aal !== 'aal2') return session.apply(toSignIn(req, ADMIN_MFA_PATH))
  }

  return session.apply(await withCsp(req))
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
    supabaseOrigin: SUPABASE_ORIGIN,
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
    // API Workspace a klientského prostoru — kvůli obnově session Supabase
    '/api/ws/:path*',
    '/api/klient/:path*',
  ],
}
