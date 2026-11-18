import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { HANDLED_PAGE, loadHandledChanges } from '@/lib/admin/outreach'

/**
 * Zpětný kanál pro Growth OS (R-120): koho Kryštof v adminu převzal nebo
 * odložil, ať robot nevolá znovu. Growth OS se ptá sám (hodinově a před
 * každým kolem volání) se stejným klíčem jako při posílání snímků;
 * ZakazIQ nikam nevolá, takže v něm nemusí ležet adresa ani klíč autopilota.
 *
 * `GET ?since=<ISO>` vrátí změny po tom okamžiku vzestupně, nejvýš 500.
 * Bez `since` posledních 30 dní. Odpověď nenese jména ani kontakty, jen
 * `external_id` z Growth OS.
 */
const ENDPOINT = 'growth_os_handled'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 30
const DEFAULT_LOOKBACK_MS = 30 * 86_400_000

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)
  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

  if (!verifyBearerApiKey(req, 'GROWTH_OS_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  }

  const raw = req.nextUrl.searchParams.get('since')
  let since = new Date(Date.now() - DEFAULT_LOOKBACK_MS)
  if (raw) {
    if (raw.length > 40 || Number.isNaN(Date.parse(raw))) return errorResponse(400, 'since: neplatné datum')
    since = new Date(raw)
  }

  const now = new Date().toISOString()
  try {
    const leads = await loadHandledChanges(since)
    if (leads === null) {
      return errorResponse(503, 'Databáze ještě nemá zpětný kanál (migrace 119).')
    }
    return NextResponse.json(
      { success: true, now, has_more: leads.length === HANDLED_PAGE, leads },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[outreach-handled] Čtení selhalo:', (err as Error)?.message)
    return errorResponse(500, 'Čtení selhalo')
  }
}
