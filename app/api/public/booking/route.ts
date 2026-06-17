import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyApiKey, getClientIp } from '@/lib/api-auth'
import { vizeonBookingSchema } from '@/types/booking'
import { pragueWallClockToISO, formatPragueDateTime } from '@/lib/prague-time'
import { sendBrandedEmail } from '@/lib/email'

const ALLOWED_ORIGINS = ['https://vizeon.cz', 'http://localhost:3000']
const ENDPOINT = 'vizeon_booking'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  }
}

function errorResponse(
  origin: string | null,
  status: number,
  error: string,
  code: string,
): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status, headers: corsHeaders(origin) })
}

async function isRateLimited(ip: string): Promise<boolean> {
  const rows = await sql`
    SELECT count(*)::int AS count FROM api_requests
    WHERE endpoint = ${ENDPOINT} AND ip = ${ip}
      AND created_at > now() - interval '1 minute' * ${RATE_LIMIT_WINDOW_MINUTES}
  `
  return (rows[0] as { count: number }).count >= RATE_LIMIT_MAX_REQUESTS
}

async function recordRequest(ip: string): Promise<void> {
  await sql`INSERT INTO api_requests (endpoint, ip) VALUES (${ENDPOINT}, ${ip})`
  await sql`DELETE FROM api_requests WHERE created_at < now() - interval '1 day'`
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get('origin')
  const ip = getClientIp(req)

  if (await isRateLimited(ip)) {
    return errorResponse(origin, 429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
  }
  await recordRequest(ip)

  if (!verifyApiKey(req, 'VIZEON_API_KEY')) {
    return errorResponse(origin, 401, 'Neplatný API klíč', 'UNAUTHORIZED')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(origin, 400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
  }

  const parsed = vizeonBookingSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(origin, 400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
  }
  const data = parsed.data

  const [year, month, day] = data.date.split('-').map(Number)
  const [hour, minute] = data.time.split(':').map(Number)
  const scheduledAtISO = pragueWallClockToISO(year, month, day, hour, minute)
  const endsAtISO = new Date(new Date(scheduledAtISO).getTime() + 60 * 60 * 1000).toISOString()

  // consultation_slots and calendar_events live in separate tables, so the DB
  // exclusion constraint on calendar_events alone can't catch a clash with an
  // existing client-portal consultation — check that here too.
  const conflictingConsultation = await sql`
    SELECT 1 FROM consultation_slots WHERE scheduled_at = ${scheduledAtISO} LIMIT 1
  `
  if (conflictingConsultation.length) {
    return errorResponse(origin, 409, 'Tento termín je již obsazen. Zvolte prosím jiný.', 'SLOT_TAKEN')
  }

  try {
    const projectRows = await sql`
      INSERT INTO projects (client_name, client_email, client_phone, service_type, description, status, source)
      VALUES (${data.clientName}, ${data.clientEmail}, ${data.clientPhone ?? null}, ${data.projectType}, ${data.message ?? null}, 'new', 'vizeon_web')
      RETURNING id
    `
    const projectId = (projectRows[0] as { id: string }).id

    const eventRows = await sql`
      INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, project_id)
      VALUES (${`Poptávka: ${data.clientName} (${data.projectType})`}, ${data.message ?? null}, ${scheduledAtISO}, ${endsAtISO}, 'manual', ${projectId})
      RETURNING id
    `
    const eventId = (eventRows[0] as { id: string }).id

    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail) {
      await sendBrandedEmail({
        to: adminEmail,
        subject: 'Nová poptávka z vizeon.cz – ZakazIQ',
        heading: 'Nová poptávka z webu',
        intro: 'Přes vizeon.cz dorazila nová poptávka a byla automaticky zařazena do přehledu zakázek.',
        fields: [
          { label: 'Klient', value: data.clientName },
          { label: 'Email', value: data.clientEmail },
          ...(data.clientPhone ? [{ label: 'Telefon', value: data.clientPhone }] : []),
          { label: 'Typ služby', value: data.projectType },
          { label: 'Navržený termín', value: formatPragueDateTime(scheduledAtISO) },
          ...(data.message ? [{ label: 'Zpráva', value: data.message }] : []),
        ],
      })
    }

    return NextResponse.json(
      { success: true, bookingId: projectId, eventId, message: 'Rezervace úspěšně vytvořena' },
      { headers: corsHeaders(origin) },
    )
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      return errorResponse(origin, 409, 'Tento termín je již obsazen. Zvolte prosím jiný.', 'SLOT_TAKEN')
    }
    console.error('[api/public/booking] DB chyba při vytváření zakázky/události:', err instanceof Error ? err.message : err)
    return errorResponse(origin, 500, 'Chyba serveru. Zkuste to prosím znovu.', 'SERVER_ERROR')
  }
}
