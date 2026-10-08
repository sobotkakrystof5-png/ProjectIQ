import { NextResponse, type NextRequest } from 'next/server'
import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware'
import { buildCsp, cspProfileFor, createNonce, hasPrefix } from '@/lib/security/csp'
import { frameAncestorsFor } from '@/lib/security/embed'

/**
 * Jediný middleware celého repa. Pořadí:
 *   1. Admin konzole — přihlášení přes NextAuth, chování beze změny
 *      (stejné cesty jako dřív, přesměrování na /api/auth/signin → /login).
 *   2. Workspace — S07 sem přidá Clerk (obalit tuhle funkci `clerkMiddleware`
 *      a chránit `/w`, kromě registrace/přihlášení).
 *   3. CSP s nonce pro každou stránku (`lib/security/csp.ts`).
 * Statické hlavičky (HSTS, nosniff, X-Frame-Options…) jsou v `next.config.mjs`.
 * Stav a důvody: `.claude/security/STATE.md`.
 */

const ADMIN_PROTECTED = ['/dashboard', '/alteno', '/hub'] as const

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

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
  ],
}
