import { NextResponse, type NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { adminChatStamp } from '@/lib/admin/chat'

// Živé obnovení schránky Zprávy (KP15): 304 beze změny, jinak nový ETag.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await getAdminSession())) return new NextResponse(null, { status: 401 })
  try {
    const etag = await adminChatStamp()
    const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
    if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
    return new NextResponse(null, { status: 200, headers })
  } catch (err) {
    console.error('[chat] otisk schránky selhal:', err instanceof Error ? err.name : 'unknown')
    return new NextResponse(null, { status: 503 })
  }
}
