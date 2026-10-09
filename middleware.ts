import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { buildCsp, clerkFrontendApiHost, cspProfileFor, createNonce, hasPrefix } from '@/lib/security/csp'
import { frameAncestorsFor } from '@/lib/security/embed'
import { WS_SIGN_IN_PATH, WS_SIGN_UP_PATH } from '@/lib/ws/paths'

/**
 * Jediný middleware celého repa. Pořadí:
 *   1. Admin konzole — přihlášení přes NextAuth, chování beze změny
 *      (stejné cesty jako dřív, přesměrování na /api/auth/signin → /login).
 *   2. Workspace (`/w`, `/api/ws`) — Clerk. Běží jen tady, admin a landing page
 *      Clerk vůbec nespouští. Bez přihlášení → `/w/prihlaseni` (kromě
 *      přihlášení a registrace). Účet a organizaci hlídá `requireWorkspace()`.
 *   3. CSP s nonce pro každou stránku (`lib/security/csp.ts`). Clerk hlavičky
 *      požadavku s nonce zachová (přidává k nim své), ClerkProvider si nonce
 *      přečte z `x-nonce`.
 * Statické hlavičky (HSTS, nosniff, X-Frame-Options…) jsou v `next.config.mjs`.
 * Stav a důvody: `.claude/security/STATE.md`.
 */

const ADMIN_PROTECTED = ['/dashboard', '/alteno', '/hub'] as const

const CLERK_PATHS = ['/w', '/api/ws'] as const

/** Stránky /w přístupné bez přihlášení. `/w/_design` je v produkci 404. */
const WS_PUBLIC = [WS_SIGN_IN_PATH, WS_SIGN_UP_PATH, '/w/_design'] as const

const CLERK_HOST = clerkFrontendApiHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

const workspace = clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl
    // API Workspace si přihlášení ověří samo (requireWorkspace), CSP nepotřebuje.
    if (hasPrefix(pathname, '/api/ws')) return NextResponse.next()
    if (!WS_PUBLIC.some((p) => hasPrefix(pathname, p))) await auth.protect()
    return withCsp(req)
  },
  { signInUrl: WS_SIGN_IN_PATH, signUpUrl: WS_SIGN_UP_PATH },
)

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (CLERK_PATHS.some((p) => hasPrefix(pathname, p))) return workspace(req, event)

  if (ADMIN_PROTECTED.some((p) => hasPrefix(pathname, p))) {
    // withAuth(req) vrátí přesměrování na přihlášení, nebo nic, když je session platná.
    const denied = await withAuth(req as NextRequestWithAuth)
    if (denied) return denied
  }

  return withCsp(req)
}

function withCsp(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl
  const nonce = createNonce()
  const { profile, mode } = cspProfileFor(pathname)

  const csp = buildCsp({
    nonce,
    pathname,
    profile,
    mode,
    isDev: process.env.NODE_ENV === 'development',
    // Objednávací stránka se vkládá na weby klientů. Povolené domény
    // (web_integrations.allowed_origins) doplní S11; do té doby jen vlastní doména.
    frameAncestors: hasPrefix(pathname, '/r') ? frameAncestorsFor([]) : undefined,
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
