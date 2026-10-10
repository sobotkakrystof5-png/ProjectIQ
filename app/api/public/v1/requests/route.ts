import { preflightResponse } from '@/lib/security/embed'
import { resolvePublicKey } from '@/lib/ws/keys'
import { apiError, ingestRequest, IDEMPOTENCY_KEY_RE } from '@/lib/ws/intake/intake'
import { authenticate, isAuthenticated, publicKeyFrom, readJson, respond } from '@/lib/ws/intake/http'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'

// POST /api/public/v1/requests — nová poptávka z webu klienta (S11, B6).
// Tajný klíč: Authorization: Bearer sk_live_… (server webu, bez CORS).
// Veřejný klíč: ?key=pk_live_… z povolené domény (widget, CORS jen pro ni).
// Popis a příklady: docs/workspace/API.md.

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request): Promise<Response> {
  const pk = publicKeyFrom(req)
  const key = pk ? await resolvePublicKey(pk).catch(() => null) : null
  return preflightResponse(req.headers.get('origin'), key?.allowedOrigins ?? [])
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (await hitLimit(LIMITS.requestsPerIp, clientIp(req.headers))) {
      return respond(apiError(429, 'RATE_LIMITED', 'Příliš mnoho poptávek najednou. Zkuste to prosím za minutu.'), { req })
    }

    const auth = await authenticate(req)
    if (!isAuthenticated(auth)) return respond(auth, { req })
    const cors = { req, allowedOrigins: auth.key.allowedOrigins }

    if (await hitLimit(LIMITS.requestsPerBusiness, auth.key.businessId)) {
      return respond(apiError(429, 'RATE_LIMITED', 'Příliš mnoho poptávek najednou. Zkuste to prosím za chvíli.'), cors)
    }

    const idempotencyKey = req.headers.get('idempotency-key')
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      return respond(apiError(400, 'INVALID_BODY', 'Hlavička Idempotency-Key má mít 1–200 znaků bez mezer.'), cors)
    }

    const body = await readJson(req)
    if (!body.ok) return respond(body.result, cors)

    const result = await ingestRequest(
      {
        accountId: auth.key.accountId,
        businessId: auth.key.businessId,
        integrationId: auth.key.integrationId,
        channel: auth.channel,
        origin: auth.origin,
      },
      body.value,
      { idempotencyKey },
    )
    return respond(result, cors)
  } catch (e) {
    console.error('api.v1.requests', { error: e instanceof Error ? e.message : 'unknown' })
    return respond(apiError(500, 'SERVER_ERROR', 'Poptávku se nepodařilo uložit. Zkuste to prosím znovu.'), { req })
  }
}
