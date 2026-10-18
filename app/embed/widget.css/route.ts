import { usableAccent } from '@/lib/ws/accent'
import { widgetCss } from '@/lib/ws/intake/widget-css'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const requested = new URL(req.url).searchParams.get('accent')
  const accent = usableAccent(requested) ?? '#23478b'
  return new Response(widgetCss(accent), {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
