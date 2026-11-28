import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientIp, verifyBearerApiKey } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { readJsonLimited } from '@/lib/security/request-body'
import { DEMO_URL_RE, recordDemoResult } from '@/lib/admin/offers/demo'

/**
 * Growth OS hlásí výsledek stavby ukázky, kterou si vyžádala nabídka (R-160).
 *
 *   POST /api/public/nabidky/ukazka
 *   Authorization: Bearer <GROWTH_OS_API_KEY>
 *   { "proposal_id": "<uuid>", "status": "ready", "url": "https://navrhy.vizeon.cz/<slug>/" }
 *   { "proposal_id": "<uuid>", "status": "failed" }
 *
 * Stejný klíč jako snímky firem (`/api/public/outreach`): volá ho týž systém.
 * Odkaz jen z navrhy.vizeon.cz. Výsledek se zapíše jen k nabídce, ke které
 * ZakazIQ ukázku opravdu vyžádal, jinak 404. Volá se ze serveru, ne z prohlížeče.
 */

const ENDPOINT = 'offer_demo_result'
const MAX_BODY_BYTES = 2 * 1024

const bodySchema = z.discriminatedUnion('status', [
  z
    .object({
      proposal_id: z.string().uuid(),
      status: z.literal('ready'),
      url: z.string().max(200).regex(DEMO_URL_RE),
      slug: z.string().max(100).optional(),
    })
    .strict(),
  z
    .object({
      proposal_id: z.string().uuid(),
      status: z.literal('failed'),
      slug: z.string().max(100).optional(),
    })
    .strict(),
])

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)
  if (await isApiRateLimited(ENDPOINT, ip, 1, 30)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

  if (req.headers.get('origin')) return errorResponse(403, 'Volá se jen ze serveru.')
  // Klíč se nikdy neloguje. Bez nastavené proměnné se odmítá všechno.
  if (!verifyBearerApiKey(req, 'GROWTH_OS_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  }

  const read = await readJsonLimited(req, MAX_BODY_BYTES)
  if (!read.ok) {
    return read.reason === 'too-large'
      ? errorResponse(413, 'Tělo požadavku je příliš velké')
      : errorResponse(400, 'Neplatné JSON tělo požadavku')
  }
  const parsed = bodySchema.safeParse(read.value)
  if (!parsed.success) {
    return errorResponse(400, 'Čekám proposal_id, status (ready nebo failed) a u ready odkaz z navrhy.vizeon.cz.')
  }
  const body = parsed.data

  try {
    const ok = await recordDemoResult(
      body.status === 'ready'
        ? { proposalId: body.proposal_id, status: 'ready', url: body.url }
        : { proposalId: body.proposal_id, status: 'failed' },
    )
    if (!ok) return errorResponse(404, 'K téhle nabídce si ZakazIQ ukázku nevyžádal.')
    return NextResponse.json({ success: true })
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return errorResponse(503, 'Databáze ještě nemá ukázky k nabídkám (migrace 145).')
    }
    console.error('[navrhovac] výsledek ukázky se nezapsal:', (err as Error)?.message?.slice(0, 120))
    return errorResponse(500, 'Zápis selhal')
  }
}
