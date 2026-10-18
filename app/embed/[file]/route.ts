import { usableAccent } from '@/lib/ws/accent'
import { businessBySlug } from '@/lib/ws/intake/http'
import { loadIntakeConfig } from '@/lib/ws/intake/intake'
import { widgetScript } from '@/lib/ws/intake/widget-script'

// GET /embed/<slug>.js — veřejný launcher widgetu (S11, RD07). Vkládá stejnou
// objednávku jako /r; stránku v iframe omezí frame-ancestors na domény byznysu.
// Samotný skript neobsahuje API klíč. Cache 5 minut.

export const dynamic = 'force-dynamic'

const FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.js$/

function script(body: string, status: number, cache: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

const missing = () => script('/* ZakazIQ: tahle firma widget nemá zapnutý. */\n', 404, 'public, max-age=60')

export async function GET(req: Request, props: { params: Promise<{ file: string }> }): Promise<Response> {
  const params = await props.params
  const m = FILE_RE.exec(params.file)
  if (!m || m[1].length > 60) return missing()
  try {
    const biz = await businessBySlug(m[1])
    if (!biz?.publicKey) return missing()
    const config = await loadIntakeConfig(biz.accountId, biz.businessId)
    if (!config) return missing()
    const apiOrigin = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, '')
    return script(
      widgetScript({
        apiOrigin,
        slug: m[1]!,
        businessName: config.business.name,
        accent: usableAccent(config.business.color),
      }),
      200,
      'public, max-age=300',
    )
  } catch (e) {
    console.error('embed.widget', { error: e instanceof Error ? e.message : 'unknown' })
    return script('/* ZakazIQ: widget se nepodařilo načíst. */\n', 500, 'no-store')
  }
}
