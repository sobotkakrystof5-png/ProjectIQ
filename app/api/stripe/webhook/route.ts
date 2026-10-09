import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/ws/stripe'
import { handleStripeEvent } from '@/lib/ws/stripe-webhook'

// Webhook Stripe → ws.subscriptions (AGENTS.md B5, S08). Bez přihlášení, pouští
// ho jen platný podpis (STRIPE_WEBHOOK_SECRET) s čerstvým časovým razítkem
// (výchozí tolerance SDK 5 min, ochrana proti přehrání). Bez klíče odmítne
// všechno (fail-closed). Podpis se počítá ze syrového těla, proto req.text().
// Zpracování v lib/ws/stripe-webhook.ts, idempotentně podle event.id.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Události Stripe mají desítky kB, větší tělo je chyba nebo útok. */
const MAX_BODY_BYTES = 512 * 1024

const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status })

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe-webhook] chybí STRIPE_WEBHOOK_SECRET nebo STRIPE_SECRET_KEY')
    return reply(503, { success: false, code: 'NOT_CONFIGURED' })
  }

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply(413, { success: false, code: 'TOO_LARGE' })
  }

  const signature = req.headers.get('stripe-signature')
  const body = await req.text()
  if (!signature || body.length > MAX_BODY_BYTES) {
    return reply(400, { success: false, code: 'INVALID_SIGNATURE' })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch {
    return reply(400, { success: false, code: 'INVALID_SIGNATURE' })
  }

  try {
    const result = await handleStripeEvent(event)
    return reply(200, { success: true, result })
  } catch (e) {
    // Bez payloadu a osobních údajů. 500 = Stripe událost pošle znovu.
    console.error('[stripe-webhook] zpracování selhalo', { type: event.type, eventId: event.id, error: (e as Error).message })
    return reply(500, { success: false, code: 'PROCESSING_FAILED' })
  }
}
