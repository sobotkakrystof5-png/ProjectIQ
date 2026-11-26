import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientIp, verifyBearerApiKey } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { readJsonLimited } from '@/lib/security/request-body'
import { failResearch, submitResult } from '@/lib/admin/offers/research'

/**
 * Odevzdání rozboru firmy (navrhovač nabídek, R-149). Volá ho jen cloudová
 * úloha Claude Code s klíčem `OFFER_RESEARCH_API_KEY` (přidává ho prostředí).
 *
 * Tělo: `{ "vysledek": { … } }` podle JSON Schema z vyzvednutí, nebo
 * `{ "nepodarilo_se": "krátký důvod" }`, když rozbor dokončit nejde. Text
 * důvodu se neukládá (je od modelu), rozbor dostane jen kód `gave_up`.
 *
 * Výsledek je nedůvěryhodný vstup: server ho ořeže a tvrzení bez zdroje
 * zahodí (`normalizeResult`). Když nesedí, vrátí 422 a rozbor běží dál,
 * takže úloha může poslat opravu.
 */
const ENDPOINT = 'offer_research_submit'
const MAX_BODY_BYTES = 256 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.union([
  z.object({ vysledek: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ nepodarilo_se: z.string().max(500) }).strict(),
])

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ip = getClientIp(req)
  if (await isApiRateLimited(ENDPOINT, ip, 1, 30)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

  if (!verifyBearerApiKey(req, 'OFFER_RESEARCH_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  }

  const { id } = await props.params
  if (!UUID.test(id)) return errorResponse(404, 'Rozbor nenalezen')

  const read = await readJsonLimited(req, MAX_BODY_BYTES)
  if (!read.ok) {
    return read.reason === 'too-large'
      ? errorResponse(413, 'Tělo požadavku je příliš velké')
      : errorResponse(400, 'Neplatné JSON tělo požadavku')
  }
  const parsed = bodySchema.safeParse(read.value)
  if (!parsed.success) return errorResponse(400, 'Tělo musí být { "vysledek": {…} }, nebo { "nepodarilo_se": "…" }')

  try {
    const out = 'vysledek' in parsed.data ? await submitResult(id, parsed.data.vysledek) : await failResearch(id)
    if (out.ok) return NextResponse.json({ success: true })
    switch (out.reason) {
      case 'not_found':
        return errorResponse(404, 'Rozbor nenalezen')
      case 'not_running':
        return errorResponse(409, 'Rozbor už neběží (hotový, smazaný, nebo ukončený po hodině)')
      case 'invalid_result':
        return errorResponse(
          422,
          'Výsledek nesedí na schéma, nebo nemá shrnutí firmy (company.summary). Oprav ho podle schématu a pošli znovu.',
        )
    }
  } catch (err) {
    console.error('[navrhovac] odevzdání rozboru selhalo:', (err as Error)?.message?.slice(0, 120))
    return errorResponse(500, 'Uložení selhalo')
  }
}
