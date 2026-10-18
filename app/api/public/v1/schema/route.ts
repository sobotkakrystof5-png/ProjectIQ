import { preflightResponse } from '@/lib/security/embed'
import { resolvePublicKey } from '@/lib/ws/keys'
import { apiError, getOpenSessions, loadIntakeConfig, loadOrderAvailability } from '@/lib/ws/intake/intake'
import { authenticate, isAuthenticated, publicKeyFrom, respond } from '@/lib/ws/intake/http'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { buildPublicSchema } from '@/lib/ws/intake/schema'

// GET /api/public/v1/schema — služby, kolonky a volné časy byznysu (S11).
// Stejné ověření jako /requests: tajný klíč ze serveru, nebo ?key=pk_live_…
// z povolené domény. Volitelně ?serviceId= a ?staffId= pro odpovídající volné časy.
// Odpověď se smí 60 s cachovat.

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS(req: Request): Promise<Response> {
  const pk = publicKeyFrom(req)
  const key = pk ? await resolvePublicKey(pk).catch(() => null) : null
  return preflightResponse(req.headers.get('origin'), key?.allowedOrigins ?? [])
}

export async function GET(req: Request): Promise<Response> {
  try {
    if (await hitLimit(LIMITS.schemaPerIp, clientIp(req.headers))) {
      return respond(apiError(429, 'RATE_LIMITED', 'Příliš mnoho požadavků. Zkuste to prosím za minutu.'), { req })
    }
    const auth = await authenticate(req)
    if (!isAuthenticated(auth)) return respond(auth, { req })
    const cors = { req, allowedOrigins: auth.key.allowedOrigins }

    const config = await loadIntakeConfig(auth.key.accountId, auth.key.businessId)
    if (!config) return respond(apiError(401, 'UNAUTHORIZED', 'Klíč nepatří žádné firmě.'), cors)

    const params = new URL(req.url).searchParams
    const serviceIdsParam = params.get('serviceIds')
    let serviceIds: string[] | null = null
    if (serviceIdsParam) {
      serviceIds = serviceIdsParam.split(',')
      if (serviceIds.length > 5 || new Set(serviceIds).size !== serviceIds.length
        || serviceIds.some((id) => !UUID_RE.test(id) || !config.services.some((service) => service.id === id))) {
        return respond(apiError(400, 'VALIDATION_ERROR', 'Služby: vyberte prosím služby ze seznamu.'), cors)
      }
    }
    const serviceParam = params.get('serviceId')
    const selection = serviceIds ?? [serviceParam && UUID_RE.test(serviceParam) && config.services.some((s) => s.id === serviceParam)
      ? serviceParam
      : (config.services[0]?.id ?? null)].filter((id): id is string => id !== null)
    const staffParam = params.get('staffId')
    if (staffParam && !UUID_RE.test(staffParam)) {
      return respond(apiError(400, 'VALIDATION_ERROR', 'Pracovník: vyberte prosím pracovníka ze seznamu.'), cors)
    }
    const [availability, sessions] = await Promise.all([
      loadOrderAvailability(auth.key.accountId, config, selection, staffParam),
      getOpenSessions(auth.key.accountId, auth.key.businessId, selection),
    ])
    if (staffParam && !availability.staff.some((s) => s.id === staffParam)) {
      return respond(apiError(400, 'VALIDATION_ERROR', 'Tento pracovník danou službu nenabízí. Vyberte prosím jiného.'), cors)
    }

    return respond(
      { status: 200, body: buildPublicSchema(config, availability.slots, availability.staff, sessions) },
      { ...cors, cache: auth.channel === 'widget' ? 'public, max-age=60' : 'private, max-age=60' },
    )
  } catch (e) {
    console.error('api.v1.schema', { error: e instanceof Error ? e.message : 'unknown' })
    return respond(apiError(500, 'SERVER_ERROR', 'Nastavení firmy se nepodařilo načíst. Zkuste to prosím znovu.'), { req })
  }
}
