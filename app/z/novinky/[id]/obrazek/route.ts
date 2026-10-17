import { NextResponse } from 'next/server'
import { z } from 'zod'
import { wsSystem } from '@/lib/ws/db'

// Obrázek novinky ZakazIQ (S17) pro zvonek v aplikaci a e-maily. Veřejný
// (e-mailový klient se nepřihlašuje), ale jen u zveřejněné novinky. Typ je
// ověřený při nahrání (PNG, JPEG, WebP — nikdy SVG). ws.product_news je
// globální tabulka bez dat účtů, ws_app ji smí číst.

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => new NextResponse('Obrázek tu není.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const id = z.string().uuid().safeParse(params.id)
  if (!id.success) return NOT_FOUND()
  try {
    const [row] = await wsSystem<{ data: string | null; type: string | null }>`
      SELECT encode(image_data, 'base64') AS data, image_type AS type FROM ws.product_news
      WHERE id = ${id.data} AND published_at IS NOT NULL AND published_at <= now()`
    if (!row?.data || !row.type) return NOT_FOUND()
    return new NextResponse(Buffer.from(row.data, 'base64'), {
      headers: {
        'Content-Type': row.type,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    })
  } catch (e) {
    console.error('ws.news.image', { error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse('Obrázek se nepodařilo načíst.', { status: 503 })
  }
}
