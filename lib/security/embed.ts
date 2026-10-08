/**
 * Hlavičky pro části Workspace, které se vkládají na weby klientů:
 * objednávací stránka `/r/[slug]` (iframe) a veřejné API `/api/public/v1/*`
 * (widget `/embed/[slug].js` z cizí domény). Povolené domény přijdou
 * z `web_integrations.allowed_origins` v S11 — tady jsou jen čisté funkce.
 *
 * Pravidla (AGENTS.md → B13): jen přesný origin `https://host[:port]`,
 * žádný wildcard, žádná cesta. Neplatný záznam se tiše přeskočí, nikdy
 * nerozšíří povolení.
 */

/** Normalizuje origin z DB / formuláře. Vrátí `null`, když to není čistý https origin. */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('*')) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // Není URL — vrací se null, volající záznam přeskočí.
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.pathname !== '/' || url.search || url.hash) return null
  return url.origin
}

export function normalizeOrigins(values: readonly string[]): string[] {
  const out = new Set<string>()
  for (const v of values) {
    const o = normalizeOrigin(v)
    if (o) out.add(o)
  }
  return Array.from(out)
}

/**
 * `frame-ancestors` pro `/r/[slug]`: vlastní doména + povolené weby klienta.
 * Bez povolených domén jen `'self'` (náhled v aplikaci), nikdy celý web.
 */
export function frameAncestorsFor(allowedOrigins: readonly string[]): string[] {
  return ["'self'", ...normalizeOrigins(allowedOrigins)]
}

/** Metody a hlavičky, které veřejné API přijímá z prohlížeče. */
const CORS_METHODS = 'GET, POST, OPTIONS'
const CORS_HEADERS = 'Content-Type, Authorization'

/**
 * CORS hlavičky pro `/api/public/v1/*`. Origin se vrací jen když je na
 * seznamu — jinak žádné `Access-Control-Allow-Origin` a prohlížeč odpověď
 * nepustí do stránky. Bez cookies (`Allow-Credentials` se nikdy neposílá).
 * `Vary: Origin` vždy, ať CDN nesdílí odpověď mezi weby.
 */
export function corsHeaders(requestOrigin: string | null, allowedOrigins: readonly string[]): Headers {
  const headers = new Headers({ Vary: 'Origin' })
  if (!requestOrigin) return headers
  const origin = normalizeOrigin(requestOrigin)
  if (!origin || !normalizeOrigins(allowedOrigins).includes(origin)) return headers

  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', CORS_METHODS)
  headers.set('Access-Control-Allow-Headers', CORS_HEADERS)
  headers.set('Access-Control-Max-Age', '600')
  return headers
}

/** Odpověď na preflight `OPTIONS`. Nepovolený origin dostane 403 bez CORS hlaviček. */
export function preflightResponse(requestOrigin: string | null, allowedOrigins: readonly string[]): Response {
  const headers = corsHeaders(requestOrigin, allowedOrigins)
  const allowed = headers.has('Access-Control-Allow-Origin')
  return new Response(null, { status: allowed ? 204 : 403, headers })
}
