import { NextResponse, type NextRequest } from 'next/server'
import { handleResendEvent, verifySvix } from '@/lib/ws/email/resend-webhook'
import { readBodyLimited } from '@/lib/security/request-body'

// Webhook Resendu (S15): nedoručené e-maily a stížnosti. Bez platného podpisu
// (RESEND_WEBHOOK_SECRET) 400, bez nastaveného tajemství 503.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 64 * 1024

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ success: false, error: 'Not configured' }, { status: 503 })
  const bounded = await readBodyLimited(req, MAX_BODY)
  if (!bounded.ok) return NextResponse.json({ success: false, error: 'Too large' }, { status: 413 })
  const body = Buffer.from(bounded.bytes).toString('utf8')
  const headers = {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }
  if (!verifySvix(body, headers, secret)) return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
  let evt: unknown
  try {
    evt = JSON.parse(body)
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const result = await handleResendEvent(headers.id!, evt as Parameters<typeof handleResendEvent>[1])
    return NextResponse.json({ success: true, result })
  } catch (e) {
    console.error('ws.resend.webhook', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ success: false, error: 'Retry' }, { status: 500 })
  }
}
