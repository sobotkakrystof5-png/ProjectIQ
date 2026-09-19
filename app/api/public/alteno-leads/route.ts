import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { createNotification } from '@/lib/notifications'
import { BUSINESSES } from '@/lib/business'
import { altenoLeadSchema, type AltenoLeadPayload } from '@/types/alteno-lead'

// Příjem leadů z kontaktního formuláře na alteno.cz (samostatný repo). Web
// odesílá jen kontaktní údaje bez konkrétního termínu — proto se ukládá jako
// nepotvrzená poptávka nad `projects`, stejně jako veřejný booking flow
// (viz lib/web-booking.ts), jen bez calendar_events záznamu. Vlastní
// dedikovaný klíč (ALTENO_LEAD_WEBHOOK_SECRET), oddělený od ALTENO_API_KEY
// pro booking endpoint, ať integrace nejdou rozjet dohromady.
//
// Web už sám přes Resend posílá potvrzovací i notifikační email — tenhle
// endpoint proto žádný email neodesílá, jen zapisuje do DB a vytváří admin
// notifikaci v appce.

const ENDPOINT = 'alteno_lead'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

function errorResponse(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

function buildDescription(data: AltenoLeadPayload): string | null {
  const parts: string[] = []
  if (data.message) parts.push(data.message)
  if (data.companyUrl) parts.push(`Web: ${data.companyUrl}`)
  if (data.toolsUsed && data.toolsUsed.length > 0) parts.push(`Používané nástroje: ${data.toolsUsed.join(', ')}`)
  return parts.length > 0 ? parts.join('\n\n') : null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
  }
  await recordApiRequest(ENDPOINT, ip)

  // Klíč se nikdy neloguje — ani v chybové odpovědi, ani v konzoli.
  if (!verifyApiKey(req, 'ALTENO_LEAD_WEBHOOK_SECRET', 'x-alteno-lead-signature')) {
    return errorResponse(401, 'Neplatný nebo chybějící podpis', 'UNAUTHORIZED')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
  }

  const parsed = altenoLeadSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
  }
  const data = parsed.data

  const rows = await sql`
    INSERT INTO projects (client_name, client_email, client_phone, service_type, description, status, source, business)
    VALUES (
      ${data.name}, ${data.email}, ${data.phone ?? null},
      ${data.automationGoal ?? BUSINESSES.alteno.defaultServiceType},
      ${buildDescription(data)}, 'new', ${BUSINESSES.alteno.source}, 'alteno'
    )
    RETURNING id
  `
  const projectId = (rows[0] as { id: string }).id

  // Nekritický vedlejší efekt — createNotification si chyby chytá sama a
  // nikdy nesmí shodit odpověď webu.
  void createNotification({
    type: 'alteno_booking',
    title: `Nová poptávka z alteno.cz — ${data.name}`,
    body: data.automationGoal ?? data.message ?? undefined,
    link: BUSINESSES.alteno.inboxPath,
  })

  return NextResponse.json({ success: true, id: projectId }, { status: 201 })
}
