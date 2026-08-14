import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyApiKey, getClientIp } from '@/lib/api-auth'
import { vizeonBookingSchema, altenoBookingSchema } from '@/types/booking'
import { pragueWallClockToISO, formatPragueDateTime } from '@/lib/prague-time'
import { sendBrandedEmail } from '@/lib/email'
import { createNotification, type NotificationType } from '@/lib/notifications'
import { BUSINESSES, type Business } from '@/lib/business'

// Veřejný booking endpoint je pro VIZEON i ALTENO identický — liší se jen
// doménou, API klíčem a byznysem, do kterého poptávka spadne. Sdílená
// implementace zajišťuje, že se obě větve nerozejdou (rate limit, CORS,
// ošetření kolize termínu).

const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

interface BookingEndpointConfig {
  business: Business
  /** Název endpointu v tabulce api_requests (rate limit je per byznys) */
  endpoint: string
  allowedOrigins: string[]
  apiKeyEnvVar: string
  notificationType: NotificationType
}

const ENDPOINTS: Record<Business, BookingEndpointConfig> = {
  vizeon: {
    business: 'vizeon',
    endpoint: 'vizeon_booking',
    allowedOrigins: ['https://vizeon.cz', 'http://localhost:3000'],
    apiKeyEnvVar: 'VIZEON_API_KEY',
    notificationType: 'vizeon_booking',
  },
  alteno: {
    business: 'alteno',
    endpoint: 'alteno_booking',
    allowedOrigins: ['https://alteno.cz', 'http://localhost:3000'],
    apiKeyEnvVar: 'ALTENO_API_KEY',
    notificationType: 'alteno_booking',
  },
}

function corsHeaders(cfg: BookingEndpointConfig, origin: string | null): HeadersInit {
  if (!origin || !cfg.allowedOrigins.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  }
}

function errorResponse(
  cfg: BookingEndpointConfig,
  origin: string | null,
  status: number,
  error: string,
  code: string,
): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status, headers: corsHeaders(cfg, origin) })
}

async function isRateLimited(endpoint: string, ip: string): Promise<boolean> {
  const rows = await sql`
    SELECT count(*)::int AS count FROM api_requests
    WHERE endpoint = ${endpoint} AND ip = ${ip}
      AND created_at > now() - interval '1 minute' * ${RATE_LIMIT_WINDOW_MINUTES}
  `
  return (rows[0] as { count: number }).count >= RATE_LIMIT_MAX_REQUESTS
}

async function recordRequest(endpoint: string, ip: string): Promise<void> {
  await sql`INSERT INTO api_requests (endpoint, ip) VALUES (${endpoint}, ${ip})`
  await sql`DELETE FROM api_requests WHERE created_at < now() - interval '1 day'`
}

export function bookingOptionsHandler(business: Business) {
  const cfg = ENDPOINTS[business]
  return async function OPTIONS(req: NextRequest): Promise<NextResponse> {
    return new NextResponse(null, { status: 204, headers: corsHeaders(cfg, req.headers.get('origin')) })
  }
}

export function bookingPostHandler(business: Business) {
  const cfg = ENDPOINTS[business]
  const brand = BUSINESSES[business]
  const schema = business === 'alteno' ? altenoBookingSchema : vizeonBookingSchema

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const origin = req.headers.get('origin')
    const ip = getClientIp(req)

    if (await isRateLimited(cfg.endpoint, ip)) {
      return errorResponse(cfg, origin, 429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
    }
    await recordRequest(cfg.endpoint, ip)

    if (!verifyApiKey(req, cfg.apiKeyEnvVar)) {
      return errorResponse(cfg, origin, 401, 'Neplatný API klíč', 'UNAUTHORIZED')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse(cfg, origin, 400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(cfg, origin, 400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
    }
    const data = parsed.data

    const [year, month, day] = data.date.split('-').map(Number)
    const [hour, minute] = data.time.split(':').map(Number)
    const scheduledAtISO = pragueWallClockToISO(year, month, day, hour, minute)
    const endsAtISO = new Date(new Date(scheduledAtISO).getTime() + 60 * 60 * 1000).toISOString()

    try {
      const projectRows = await sql`
        INSERT INTO projects (client_name, client_email, client_phone, service_type, description, status, source, business)
        VALUES (${data.clientName}, ${data.clientEmail}, ${data.clientPhone ?? null}, ${data.projectType}, ${data.message ?? null}, 'new', ${brand.source}, ${business})
        RETURNING id
      `
      const projectId = (projectRows[0] as { id: string }).id

      const eventRows = await sql`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, project_id, business)
        VALUES (${`Poptávka: ${data.clientName} (${data.projectType})`}, ${data.message ?? null}, ${scheduledAtISO}, ${endsAtISO}, 'manual', ${projectId}, ${business})
        RETURNING id
      `
      const eventId = (eventRows[0] as { id: string }).id

      const adminEmail = process.env.ADMIN_EMAIL
      if (adminEmail) {
        await sendBrandedEmail({
          to: adminEmail,
          subject: `Nová poptávka z ${brand.domain} – ZakazIQ`,
          heading: 'Nová poptávka z webu',
          intro: `Přes ${brand.domain} dorazila nová poptávka a byla automaticky zařazena do přehledu zakázek.`,
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

      void createNotification({
        type: cfg.notificationType,
        title: `Nová poptávka z ${brand.domain} — ${data.clientName}`,
        body: `${data.projectType} · ${formatPragueDateTime(scheduledAtISO)}${data.message ? ' — ' + data.message : ''}`,
        link: brand.inboxPath,
      })

      return NextResponse.json(
        { success: true, bookingId: projectId, eventId, message: 'Rezervace úspěšně vytvořena' },
        { headers: corsHeaders(cfg, origin) },
      )
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23P01') {
        return errorResponse(cfg, origin, 409, 'Tento termín je již obsazen. Zvolte prosím jiný.', 'SLOT_TAKEN')
      }
      console.error(`[api/public/booking:${business}] DB chyba při vytváření zakázky/události:`, err instanceof Error ? err.message : err)
      return errorResponse(cfg, origin, 500, 'Chyba serveru. Zkuste to prosím znovu.', 'SERVER_ERROR')
    }
  }
}
