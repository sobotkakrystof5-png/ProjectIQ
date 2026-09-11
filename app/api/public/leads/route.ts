import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { verifyApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { n8nLeadSchema } from '@/types/leads'

const ENDPOINT = 'n8n_lead'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

function errorResponse(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
  }
  await recordApiRequest(ENDPOINT, ip)

  if (!verifyApiKey(req, 'N8N_API_KEY')) {
    return errorResponse(401, 'Neplatný API klíč', 'UNAUTHORIZED')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
  }

  const parsed = n8nLeadSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
  }
  const data = parsed.data

  const rows = await sql`
    INSERT INTO client_leads
      (company_name, contact_name, phone, email, notes,
       lead_status, next_action_type, next_action, next_action_date, next_action_time)
    VALUES
      (${data.company_name}, ${data.contact_name ?? null}, ${data.phone ?? null}, ${data.email ?? null}, ${data.notes ?? null},
       'cold', 'call', 'Domluvená schůzka z chatbota', ${data.next_action_date ?? null}, ${data.next_action_time ?? null})
    RETURNING id, company_name, contact_name, next_action_date, next_action_time, email
  `

  revalidatePath('/dashboard/calls')

  return NextResponse.json({ success: true, lead: rows[0] })
}
