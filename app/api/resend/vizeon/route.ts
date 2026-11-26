import { NextResponse, type NextRequest } from 'next/server'
import { handleAdminResendEvent } from '@/lib/admin/email-deliveries'
import { readBodyLimited } from '@/lib/security/request-body'
import { verifySvix } from '@/lib/security/webhook-signature'

// Webhook Resendu pro e-maily z adminu (krystof@vizeon.cz, R-146): doručeno,
// zdržuje se, vrátilo se. Vlastní tajemství VIZEON_RESEND_WEBHOOK_SECRET —
// Workspace má svůj webhook /api/resend/webhook se svým klíčem. Bez platného
// podpisu 400, bez nastaveného tajemství 503. Chyba databáze = 500, ať to
// Resend zkusí znovu.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 64 * 1024

export async function POST(req: NextRequest) {
  const secret = process.env.VIZEON_RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ success: false, error: 'Not configured' }, { status: 503 })
  const bounded = await readBodyLimited(req, MAX_BODY)
  if (!bounded.ok) return NextResponse.json({ success: false, error: 'Too large' }, { status: 413 })
  const body = Buffer.from(bounded.bytes).toString('utf8')
  const headers = {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }
  if (!verifySvix(body, headers, secret)) {
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
  }
  let evt: unknown
  try {
    evt = JSON.parse(body)
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const result = await handleAdminResendEvent(evt)
    return NextResponse.json({ success: true, result })
  } catch (e) {
    console.error('admin.resend.webhook', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ success: false, error: 'Retry' }, { status: 500 })
  }
}
