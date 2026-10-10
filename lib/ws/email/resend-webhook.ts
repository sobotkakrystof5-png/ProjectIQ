import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { wsDb, wsSystem } from '../db'

// Webhook Resendu (S15): nedoručené a odmítnuté e-maily. Podpis ve formátu
// Svix (hlavičky svix-id, svix-timestamp, svix-signature) s RESEND_WEBHOOK_SECRET.
// Účet a zprávu bere z tagů, které jsme e-mailu dali při odeslání (queue.ts) —
// po ověření podpisu jde o důvěryhodný zdroj. Idempotence: svix-id
// v ws.webhook_events. Payload se neukládá.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOLERANCE_S = 5 * 60

/** Ověří podpis Svix. Bez tajemství nebo se starým časem = false. */
export function verifySvix(body: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret?.startsWith('whsec_') || !headers.id || !headers.timestamp || !headers.signature) return false
  const ts = Number(headers.timestamp)
  if (!Number.isInteger(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false
  let key: Buffer
  try {
    key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  } catch {
    return false
  }
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${body}`).digest()
  return headers.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

type ResendEvent = {
  type?: string
  data?: { email_id?: string; tags?: Record<string, string>; bounce?: { type?: string } }
}

export type ResendResult = 'processed' | 'duplicate' | 'ignored'

const HANDLED = new Set(['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'])

export async function handleResendEvent(eventId: string, evt: ResendEvent): Promise<ResendResult> {
  const type = String(evt.type ?? '').slice(0, 60)
  if (!HANDLED.has(type)) return 'ignored'
  const [row] = await wsSystem<{ processed_at: Date | null }>`
    INSERT INTO ws.webhook_events (source, id, type) VALUES ('resend', ${eventId.slice(0, 100)}, ${type})
    ON CONFLICT (source, id) DO UPDATE SET type = EXCLUDED.type
    RETURNING processed_at`
  if (row?.processed_at) return 'duplicate'

  const accountId = evt.data?.tags?.account
  const messageId = evt.data?.tags?.message
  if (!accountId || !messageId || !UUID_RE.test(accountId) || !UUID_RE.test(messageId)) {
    await wsSystem`UPDATE ws.webhook_events SET processed_at = now() WHERE source = 'resend' AND id = ${eventId.slice(0, 100)}`
    return 'ignored'
  }
  const scope = { accountId }
  const reason = type === 'email.bounced' ? (evt.data?.bounce?.type === 'Permanent' ? 'bounced' : 'bounced_soft') : type.slice('email.'.length)
  const [msg] = await wsDb(scope)`
    UPDATE ws.outbound_messages SET status = 'failed', last_error = ${reason}
    WHERE account_id = ${accountId} AND id = ${messageId}
    RETURNING business_id, customer_id, to_address, type`
  if (msg && msg.customer_id) {
    // Stížnost na spam = zákazník už nechce nabídky (jen hromadné zprávy).
    if (type === 'email.complained') {
      await wsDb(scope)`UPDATE ws.customers SET unsubscribed_at = COALESCE(unsubscribed_at, now())
        WHERE account_id = ${accountId} AND id = ${String(msg.customer_id)}`
    }
    if (reason === 'bounced' && msg.business_id) {
      const [c] = await wsDb(scope)`SELECT name FROM ws.customers WHERE account_id = ${accountId} AND id = ${String(msg.customer_id)}`
      const [b] = await wsDb(scope)`SELECT slug FROM ws.businesses WHERE account_id = ${accountId} AND id = ${String(msg.business_id)}`
      if (c && b) {
        await wsDb(scope)`
          INSERT INTO ws.notifications (account_id, business_id, type, title, body, link)
          VALUES (${accountId}, ${String(msg.business_id)}, 'email_bounced', ${`E-mail se nepodařilo doručit: ${String(c.name)}`.slice(0, 200)},
                  'Zkontrolujte prosím e-mailovou adresu zákazníka.', ${`/w/${String(b.slug)}/zakaznici?detail=zakaznik:${String(msg.customer_id)}`})`
      }
    }
  }
  await wsSystem`UPDATE ws.webhook_events SET processed_at = now() WHERE source = 'resend' AND id = ${eventId.slice(0, 100)}`
  return 'processed'
}
