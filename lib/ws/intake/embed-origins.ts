import { wsSystem } from '../db'

// Povolené domény pro `frame-ancestors` objednávací stránky /r/[slug] (S11).
// Volá ho proxy.ts, proto bez `server-only` a bez Node API — jen
// SECURITY DEFINER funkce přes Neon HTTP. Krátká cache v paměti instance,
// ať každé zobrazení stránky nejde do DB. Při chybě prázdný seznam, tedy
// jen 'self' (selže zavřeně).

const TTL_MS = 60_000
const MAX_ENTRIES = 500
const cache = new Map<string, { origins: string[]; expires: number }>()

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Slug z cesty `/r/<slug>` (i s další částí za ním), jinak null. */
export function orderSlugFromPath(pathname: string): string | null {
  const m = /^\/r\/([^/]+)/.exec(pathname)
  if (!m) return null
  const slug = decodeURIComponent(m[1])
  return SLUG_RE.test(slug) && slug.length <= 60 ? slug : null
}

export async function embedOriginsForSlug(slug: string, now: number = Date.now()): Promise<string[]> {
  const hit = cache.get(slug)
  if (hit && hit.expires > now) return hit.origins
  let origins: string[] = []
  try {
    const [row] = await wsSystem`SELECT allowed_origins FROM ws.business_by_public_slug(${slug})`
    origins = (row?.allowed_origins as string[] | null) ?? []
  } catch (e) {
    console.error('embedOrigins', { error: e instanceof Error ? e.message : 'unknown' })
    return []
  }
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(slug, { origins, expires: now + TTL_MS })
  return origins
}
