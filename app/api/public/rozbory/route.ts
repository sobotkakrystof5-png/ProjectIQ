import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientIp, verifyBearerApiKey } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { readBodyLimited } from '@/lib/security/request-body'
import { claimResearch } from '@/lib/admin/offers/research'

/**
 * Vyzvednutí rozboru firmy z fronty (navrhovač nabídek, R-148).
 *
 * Volá ho jen cloudová úloha Claude Code. Klíč `OFFER_RESEARCH_API_KEY`
 * přidává k požadavku cloudové prostředí (network secret), úloha ho nevidí.
 * Prohlížeč sem nechodí, takže žádné CORS.
 *
 * Tělo: `{}` nebo `{ "id": "<uuid>" }` — id z textu spuštění je jen přání,
 * když už nečeká, dostane úloha nejstarší rozbor z fronty.
 * Odpověď: `{ success: true, rozbor: null }`, nebo zadání (veřejné údaje
 * o firmě), JSON Schema výsledku a adresa, kam výsledek poslat.
 */
const ENDPOINT = 'offer_research_claim'
const MAX_BODY_BYTES = 2 * 1024

const bodySchema = z.object({ id: z.string().uuid().nullable().optional() }).strict()

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)
  if (await isApiRateLimited(ENDPOINT, ip, 1, 30)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

  // Klíč se nikdy neloguje. Bez nastavené proměnné se odmítá všechno.
  if (!verifyBearerApiKey(req, 'OFFER_RESEARCH_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  }

  const read = await readBodyLimited(req, MAX_BODY_BYTES)
  if (!read.ok) return errorResponse(413, 'Tělo požadavku je příliš velké')
  let raw: unknown = {}
  const text = Buffer.from(read.bytes).toString('utf8').trim()
  if (text !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      return errorResponse(400, 'Neplatné JSON tělo požadavku')
    }
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'Tělo smí obsahovat jen "id" (uuid)')

  try {
    const claimed = await claimResearch(parsed.data.id ?? null)
    if (claimed === null) return NextResponse.json({ success: true, rozbor: null })
    return NextResponse.json({
      success: true,
      rozbor: { ...claimed, odevzdat: `/api/public/rozbory/${claimed.id}` },
    })
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01' || (err as { code?: string })?.code === '42703') {
      return errorResponse(503, 'Databáze ještě nemá frontu rozborů (migrace 136 a 137).')
    }
    console.error('[navrhovac] vyzvednutí rozboru selhalo:', (err as Error)?.message?.slice(0, 120))
    return errorResponse(500, 'Vyzvednutí selhalo')
  }
}
