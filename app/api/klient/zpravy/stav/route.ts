import { NextResponse, type NextRequest } from 'next/server'
import { getPortalContext } from '@/lib/portal/context'
import { clientChatStamp } from '@/lib/portal/chat'

// Živé obnovení chatu v klientském prostoru (KP15): otevřená stránka se sem
// ptá každých 10 s s If-None-Match. Beze změny 304 bez těla, se změnou nový
// ETag a prohlížeč si stránku načte znovu. Nic nezapisuje — přečteno
// a poslední návštěvu zapisuje akce `touchThread` (POST).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await getPortalContext()
  if (!ctx) return new NextResponse(null, { status: 401 })
  try {
    const etag = await clientChatStamp(ctx.clientId)
    const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
    if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
    return new NextResponse(null, { status: 200, headers })
  } catch (err) {
    console.error('[chat] otisk klienta selhal:', err instanceof Error ? err.name : 'unknown')
    return new NextResponse(null, { status: 503 })
  }
}
