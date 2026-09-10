import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyBearerApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { createNotification } from '@/lib/notifications'
import { toBusiness } from '@/lib/business'
import { agentLeadPayloadSchema } from '@/types/agent-leads'

// Příjem AI-scorovaných leadů z externího vizeon-lead-agent (Python/FastAPI).
// Agent na tenhle endpoint posílá už hotový výsledek — žádná AI logika ani
// scoring se tady nedělá, jen se uloží a zobrazí v adminu.
const ENDPOINT = 'agent_lead'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)

  // Klíč se nikdy neloguje — ani v chybové odpovědi, ani v konzoli.
  if (!verifyBearerApiKey(req, 'VIZEON_AGENT_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Neplatné JSON tělo požadavku')
  }

  const parsed = agentLeadPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? 'Neplatná data')
  }
  const { lead_id, source, version, section, received_at, client, analysis } = parsed.data
  const business = toBusiness(section)

  // ON CONFLICT na lead_id → idempotence: opakované doručení stejného leadu
  // (ruční retry, budoucí retry logika na straně agenta) přepíše záznam
  // místo vytvoření duplicity.
  const rows = await sql`
    INSERT INTO agent_leads (
      lead_id, source, payload_version, business, received_at,
      client_name, client_email, client_phone, client_company, client_service, client_budget, client_deadline, client_message,
      lead_score, priority, score_breakdown, company_type, industry, digital_maturity, project_complexity, clarity_of_request, summary, communication_strategy
    ) VALUES (
      ${lead_id}, ${source}, ${version}, ${business}, ${received_at},
      ${client.name}, ${client.email}, ${client.phone ?? null}, ${client.company ?? null}, ${client.service}, ${client.budget ?? null}, ${client.deadline ?? null}, ${client.message ?? null},
      ${analysis.lead_score}, ${analysis.priority}, ${JSON.stringify(analysis.score_breakdown)}::jsonb, ${analysis.company_type}, ${analysis.industry}, ${analysis.digital_maturity}, ${analysis.project_complexity}, ${analysis.clarity_of_request}, ${analysis.summary}, ${JSON.stringify(analysis.communication_strategy)}::jsonb
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      source = EXCLUDED.source,
      payload_version = EXCLUDED.payload_version,
      business = EXCLUDED.business,
      received_at = EXCLUDED.received_at,
      client_name = EXCLUDED.client_name,
      client_email = EXCLUDED.client_email,
      client_phone = EXCLUDED.client_phone,
      client_company = EXCLUDED.client_company,
      client_service = EXCLUDED.client_service,
      client_budget = EXCLUDED.client_budget,
      client_deadline = EXCLUDED.client_deadline,
      client_message = EXCLUDED.client_message,
      lead_score = EXCLUDED.lead_score,
      priority = EXCLUDED.priority,
      score_breakdown = EXCLUDED.score_breakdown,
      company_type = EXCLUDED.company_type,
      industry = EXCLUDED.industry,
      digital_maturity = EXCLUDED.digital_maturity,
      project_complexity = EXCLUDED.project_complexity,
      clarity_of_request = EXCLUDED.clarity_of_request,
      summary = EXCLUDED.summary,
      communication_strategy = EXCLUDED.communication_strategy,
      updated_at = now()
    RETURNING id, lead_id
  `

  // Nekritický vedlejší efekt — createNotification si chyby chytá sama a
  // nikdy nesmí shodit odpověď agentovi.
  createNotification({
    type: 'agent_lead_received',
    title: `Nový AI lead (${analysis.priority}, ${analysis.lead_score}/100)`,
    body: `${client.name}${client.company ? ` — ${client.company}` : ''}\n${analysis.summary}`,
  })

  return NextResponse.json({ success: true, lead: rows[0] }, { status: 201 })
}
