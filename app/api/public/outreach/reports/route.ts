import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerApiKey, getClientIp } from '@/lib/api-auth'
import { readJsonLimited } from '@/lib/security/request-body'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { ingestOutreachReport } from '@/lib/admin/outreach-reports'
import { reportPayloadSchema } from '@/types/outreach-report'

/**
 * Příjem denních reportů hovorů z Growth OS (R-118). Volá ho vizeon-autopilot
 * ze serveru (GitHub Actions) se stejným klíčem jako snímky firem
 * (`GROWTH_OS_API_KEY`); prohlížeč sem nechodí, takže žádné CORS.
 *
 * Den s ~150 hovory a přepisy spojených hovorů má pod 2 MB.
 */
const MAX_BODY_BYTES = 2 * 1024 * 1024
const ENDPOINT = 'growth_os_reports'
const RATE_LIMIT_WINDOW_MINUTES = 1
// Dotažení historie posílá den po dni s pauzou.
const RATE_LIMIT_MAX_REQUESTS = 30

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

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

  const parsed = reportPayloadSchema.safeParse(read.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse(400, issue ? `${issue.path.join('.')}: ${issue.message}` : 'Neplatná data')
  }

  try {
    const { calls } = await ingestOutreachReport(parsed.data)
    return NextResponse.json({ success: true, saved: calls }, { status: 200 })
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return errorResponse(503, 'Databáze ještě nemá tabulky pro reporty hovorů (migrace 116).')
    }
    console.error('[outreach-reports] Uložení selhalo:', (err as Error)?.message)
    return errorResponse(500, 'Uložení selhalo')
  }
}
