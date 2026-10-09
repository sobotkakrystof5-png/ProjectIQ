import { NextResponse, type NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { handleClerkEvent } from '@/lib/ws/clerk-webhook'

// Webhook Clerku → ws.accounts, ws.members (AGENTS.md B4, S07). Bez přihlášení,
// pouští ho jen platný podpis Svix (CLERK_WEBHOOK_SECRET) s čerstvým časovým
// razítkem (ochrana proti přehrání). Bez klíče odmítne všechno (fail-closed).
// Zpracování v lib/ws/clerk-webhook.ts, idempotentně podle svix-id.

export const dynamic = 'force-dynamic'

/** Události Clerku jsou malé, větší tělo je chyba nebo útok. */
const MAX_BODY_BYTES = 256 * 1024

const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status })

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error('[clerk-webhook] chybí CLERK_WEBHOOK_SECRET')
    return reply(503, { success: false, code: 'NOT_CONFIGURED' })
  }

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply(413, { success: false, code: 'TOO_LARGE' })
  }

  let evt: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    evt = await verifyWebhook(req, { signingSecret })
  } catch {
    return reply(400, { success: false, code: 'INVALID_SIGNATURE' })
  }

  // Po ověření podpisu je hlavička jistě přítomná (je součástí podpisu).
  const eventId = req.headers.get('svix-id') ?? ''
  try {
    const result = await handleClerkEvent(evt, eventId)
    return reply(200, { success: true, result })
  } catch (e) {
    // Bez payloadu a osobních údajů. 500 = Clerk událost pošle znovu.
    console.error('[clerk-webhook] zpracování selhalo', { type: evt.type, eventId, error: (e as Error).message })
    return reply(500, { success: false, code: 'PROCESSING_FAILED' })
  }
}
