import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { loadDemoPreviewUrl } from '@/lib/admin/outreach-crm'
import { isAllowedDemoAsset } from '@/lib/admin/outreach-demo'

/**
 * Náhled ukázkového webu (R-120) — obrázek, který Growth OS vyfotí po stavbě
 * ukázky. Stahuje se **přes náš server**, ať CSP adminu (`img-src 'self'`)
 * zůstane, jak je.
 *
 * Bezpečnost: jen přihlášený admin, adresa jde z naší tabulky a smí mířit jen
 * na `navrhy.vizeon.cz` přes https (žádné SSRF na jinou adresu), bez
 * přesměrování, jen PNG/JPEG/WebP do 2 MB.
 */

export const runtime = 'nodejs'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await getAdminSession())) return new NextResponse(null, { status: 401 })
  const { id } = await ctx.params

  const url = await loadDemoPreviewUrl(id)
  if (!url || !isAllowedDemoAsset(url)) return new NextResponse(null, { status: 404 })

  let upstream: Response
  try {
    upstream = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
  const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!upstream.ok || !TYPES.has(type)) return new NextResponse(null, { status: 502 })
  if (Number(upstream.headers.get('content-length') ?? 0) > MAX_BYTES) return new NextResponse(null, { status: 502 })
  const body = await readCapped(upstream, MAX_BYTES)
  if (!body) return new NextResponse(null, { status: 502 })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}

/**
 * Přečte tělo nejvýš do `max` bajtů. Bez stropu by odpověď bez
 * `content-length` (nebo se lživou hodnotou) celá skončila v paměti.
 */
async function readCapped(res: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
