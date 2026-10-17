import { NextResponse } from 'next/server'
import { unsubscribeCustomer, unsubscribeNews } from '@/lib/ws/email/public-links'

// Odhlášení jedním klikem (RFC 8058, hlavička List-Unsubscribe-Post): pošta
// (Gmail, Apple Mail) pošle POST bez cookies. Oprávnění dává podepsaný odkaz.

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  try {
    const done = params.token.startsWith('n') ? await unsubscribeNews(params.token) : Boolean(await unsubscribeCustomer(params.token))
    return new NextResponse(null, { status: done ? 200 : 404 })
  } catch (e) {
    console.error('ws.email.oneClick', { error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse(null, { status: 503 })
  }
}
