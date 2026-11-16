import { createHmac, timingSafeEqual } from 'crypto'

// Podpis ve formátu Standard Webhooks / Svix: HMAC-SHA256 z `${id}.${timestamp}.${body}`
// klíčem z `whsec_<base64>`. Používá ho webhook Resendu (hlavičky `svix-*`)
// i hook Supabase Auth (hlavičky `webhook-*`, tajemství ve tvaru `v1,whsec_…`).

const TOLERANCE_S = 5 * 60

export type WebhookSignatureHeaders = { id: string | null; timestamp: string | null; signature: string | null }

/** Ověří podpis. Bez tajemství, s cizím podpisem nebo se starým časem = false. */
export function verifySvix(
  body: string,
  headers: WebhookSignatureHeaders,
  secret: string | undefined,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  // Supabase ukazuje tajemství jako `v1,whsec_…`; předpona verze k klíči nepatří.
  const normalized = secret?.startsWith('v1,') ? secret.slice(3) : secret
  if (!normalized?.startsWith('whsec_') || !headers.id || !headers.timestamp || !headers.signature) return false
  const ts = Number(headers.timestamp)
  if (!Number.isInteger(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false
  const key = Buffer.from(normalized.slice('whsec_'.length), 'base64')
  if (key.length === 0) return false
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${body}`).digest()
  return headers.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
