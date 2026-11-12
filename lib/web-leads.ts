import { NextRequest, NextResponse, after } from 'next/server'
import { sql } from '@/lib/db'
import { adminDb } from '@/lib/admin/db'
import type { TableParams } from '@/lib/admin-table'
import { verifyApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { bookingSchemaFor } from '@/types/booking'
import { webLeadSchemaFor, type WebLeadPayload } from '@/types/web-lead'
import { pragueWallClockToISO, formatPragueDateTime } from '@/lib/prague-time'
import { sendBrandedEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import {
  LEAD_ORIGINS, LEAD_ORIGIN_KEYS, LEADS_INBOX_PATH, bookingRateLimitKey, leadRateLimitKey, adminEmail,
  toLeadOrigin, type LeadOrigin,
} from '@/lib/lead-origins'
import type { WebLead } from '@/components/LeadCard'

// Příjem poptávek z webů klientů (AD02, R-088). Dvě cesty, oba pro všechny
// zdroje stejné:
//   1. objednávka s termínem   → bookingPostHandler(origin)
//   2. kontaktní formulář      → webLeadPostHandler(origin)
// Co se u zdroje liší, je jen v LEAD_ORIGINS. Přidat další web = nový soubor
// routy s jedním řádkem, žádná nová logika.
//
// Poptávka padne do jednoho inboxu (/dashboard/poptavky) jako nepotvrzená
// zakázka — `lead_pending` v databázi (migrace 102). `lead_pending` je
// generovaný sloupec, do INSERTu nikdy nepatří.

const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

function allowedOrigins(origin: LeadOrigin): string[] {
  const domain = LEAD_ORIGINS[origin].domain
  return [...(domain ? [`https://${domain}`] : []), 'http://localhost:3000']
}

function corsHeaders(origin: LeadOrigin, requestOrigin: string | null): HeadersInit {
  if (!requestOrigin || !allowedOrigins(origin).includes(requestOrigin)) return {}
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  }
}

function errorResponse(
  origin: LeadOrigin,
  requestOrigin: string | null,
  status: number,
  error: string,
  code: string,
): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status, headers: corsHeaders(origin, requestOrigin) })
}

export function bookingOptionsHandler(origin: LeadOrigin) {
  return async function OPTIONS(req: NextRequest): Promise<NextResponse> {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin, req.headers.get('origin')) })
  }
}

export function bookingPostHandler(origin: LeadOrigin) {
  const cfg = LEAD_ORIGINS[origin]
  const keyEnv = LEAD_ORIGIN_KEYS[origin].booking
  if (!cfg.source || !keyEnv) {
    throw new Error(`Zdroj ${origin} nemá nastavený booking endpoint (lib/lead-origins.ts)`)
  }
  const schema = bookingSchemaFor(cfg.source)
  const endpoint = bookingRateLimitKey(origin)

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const requestOrigin = req.headers.get('origin')
    const ip = getClientIp(req)

    if (await isApiRateLimited(endpoint, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
      return errorResponse(origin, requestOrigin, 429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
    }
    await recordApiRequest(endpoint, ip)

    if (!verifyApiKey(req, keyEnv)) {
      return errorResponse(origin, requestOrigin, 401, 'Neplatný API klíč', 'UNAUTHORIZED')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse(origin, requestOrigin, 400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(origin, requestOrigin, 400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
    }
    const data = parsed.data

    const [year, month, day] = data.date.split('-').map(Number)
    const [hour, minute] = data.time.split(':').map(Number)
    const scheduledAtISO = pragueWallClockToISO(year, month, day, hour, minute)
    const endsAtISO = new Date(new Date(scheduledAtISO).getTime() + 60 * 60 * 1000).toISOString()

    try {
      const projectRows = await sql`
        INSERT INTO projects (client_name, client_email, client_phone, service_type, description, status, source, lead_origin)
        VALUES (${data.clientName}, ${data.clientEmail}, ${data.clientPhone ?? null}, ${data.projectType}, ${data.message ?? null}, 'new', ${cfg.source}, ${origin})
        RETURNING id
      `
      const projectId = (projectRows[0] as { id: string }).id

      const eventRows = await sql`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, project_id, lead_origin)
        VALUES (${`Poptávka: ${data.clientName} (${data.projectType})`}, ${data.message ?? null}, ${scheduledAtISO}, ${endsAtISO}, 'manual', ${projectId}, ${origin})
        RETURNING id
      `
      const eventId = (eventRows[0] as { id: string }).id

      // Web klienta na nic z toho nečeká (AD08): Gmail SMTP trvá stovky
      // milisekund až sekundy a poptávka je přitom už uložená. `after()`
      // pustí e-mail i oznámení až po odeslání odpovědi — a na rozdíl od
      // plovoucí `void` promise je zaručeně dokončí.
      const to = adminEmail()
      after(async () => {
        if (to) {
          await sendBrandedEmail({
            to,
            subject: `Nová poptávka z ${cfg.domain} – ZakazIQ`,
            heading: 'Nová poptávka z webu',
            intro: `Přes ${cfg.domain} dorazila nová poptávka a byla automaticky zařazena do přehledu poptávek.`,
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

        await createNotification({
          type: 'web_lead',
          title: `Nová poptávka z ${cfg.domain} — ${data.clientName}`,
          body: `${data.projectType} · ${formatPragueDateTime(scheduledAtISO)}${data.message ? ' — ' + data.message : ''}`,
          link: LEADS_INBOX_PATH,
        })
      })

      return NextResponse.json(
        { success: true, bookingId: projectId, eventId, message: 'Rezervace úspěšně vytvořena' },
        { headers: corsHeaders(origin, requestOrigin) },
      )
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23P01') {
        return errorResponse(origin, requestOrigin, 409, 'Tento termín je již obsazen. Zvolte prosím jiný.', 'SLOT_TAKEN')
      }
      console.error(`[api/public/booking:${origin}] DB chyba při vytváření zakázky/události:`, err instanceof Error ? err.message : err)
      return errorResponse(origin, requestOrigin, 500, 'Chyba serveru. Zkuste to prosím znovu.', 'SERVER_ERROR')
    }
  }
}

function buildDescription(data: WebLeadPayload): string | null {
  const parts: string[] = []
  if (data.message) parts.push(data.message)
  if (data.companyUrl) parts.push(`Web: ${data.companyUrl}`)
  if (data.toolsUsed && data.toolsUsed.length > 0) parts.push(`Používané nástroje: ${data.toolsUsed.join(', ')}`)
  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Kontaktní formulář z webu: jen kontaktní údaje, bez termínu. Ukládá se jako
 * nepotvrzená poptávka nad `projects` (stejně jako objednávka), jen bez
 * záznamu v kalendáři. Vlastní podpisový klíč per zdroj, oddělený od klíče pro
 * booking — kdyby jeden unikl, nepustí poptávky za ostatní weby.
 *
 * Web si potvrzovací i notifikační e-mail posílá sám (Resend), proto tenhle
 * handler žádný e-mail neodesílá — jen zapíše do databáze a založí oznámení.
 */
export function webLeadPostHandler(origin: LeadOrigin) {
  const cfg = LEAD_ORIGINS[origin]
  const secretEnv = LEAD_ORIGIN_KEYS[origin].lead
  if (!cfg.source || !secretEnv) {
    throw new Error(`Zdroj ${origin} nemá nastavený endpoint pro kontaktní poptávky (lib/lead-origins.ts)`)
  }
  const schema = webLeadSchemaFor(origin)
  const endpoint = leadRateLimitKey(origin)
  const signatureHeader = `x-${origin}-lead-signature`

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIp(req)
    const fail = (status: number, error: string, code: string) =>
      NextResponse.json({ success: false, error, code }, { status })

    if (await isApiRateLimited(endpoint, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
      return fail(429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
    }
    await recordApiRequest(endpoint, ip)

    // Klíč se nikdy neloguje — ani v chybové odpovědi, ani v konzoli.
    if (!verifyApiKey(req, secretEnv, signatureHeader)) {
      return fail(401, 'Neplatný nebo chybějící podpis', 'UNAUTHORIZED')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return fail(400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
    }
    const data = parsed.data

    const rows = await sql`
      INSERT INTO projects (client_name, client_email, client_phone, service_type, description, status, source, lead_origin)
      VALUES (
        ${data.name}, ${data.email}, ${data.phone ?? null},
        ${data.automationGoal ?? cfg.defaultServiceType},
        ${buildDescription(data)}, 'new', ${cfg.source}, ${origin}
      )
      RETURNING id
    `
    const projectId = (rows[0] as { id: string }).id

    // Nekritický vedlejší efekt — createNotification si chyby chytá sama a
    // nikdy nesmí shodit odpověď webu. `after()` ho pustí po odpovědi, ale
    // na rozdíl od plovoucí `void` promise ho zaručeně dokončí (AD08).
    after(() => createNotification({
      type: 'web_lead',
      title: `Nová poptávka z ${cfg.domain} — ${data.name}`,
      body: data.automationGoal ?? data.message ?? undefined,
      link: LEADS_INBOX_PATH,
    }))

    return NextResponse.json({ success: true, id: projectId }, { status: 201 })
  }
}

/**
 * Jeden inbox nepotvrzených poptávek ze všech webů (/dashboard/poptavky).
 * Dřív to byly dva dotazy nad dvěma funkcemi; dnes stačí `lead_pending`.
 */
/**
 * Čekající poptávky pro inbox `/dashboard/poptavky` (AD07).
 *
 * Filtr zdroje i stránkování řeší databáze; dřív se stáhly všechny čekající
 * poptávky a filtrovalo se v prohlížeči. Počty u pilulek jdou stejným
 * požadavkem, aby nezávisely na otevřené stránce.
 */
export async function loadPendingLeads(
  params: TableParams,
  origin: LeadOrigin | 'vse' = 'vse',
): Promise<{ rows: WebLead[]; total: number; counts: Record<string, number>; all: number }> {
  const filter = origin === 'vse' ? '' : 'AND p.lead_origin = $3'
  const [rows, counts] = await adminDb.batch([
    {
      text: `
        SELECT
          p.id, p.client_name, p.client_email, p.client_phone, p.service_type, p.description,
          p.created_at, p.lead_origin,
          ce.starts_at AS consultation_at
        FROM projects p
        LEFT JOIN calendar_events ce ON ce.project_id = p.id
        WHERE p.lead_pending ${filter}
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2
      `,
      params: origin === 'vse' ? [params.limit, params.offset] : [params.limit, params.offset, origin],
    },
    {
      text: `SELECT lead_origin, count(*)::int AS pocet FROM projects WHERE lead_pending GROUP BY lead_origin`,
      params: [],
    },
  ])

  const byOrigin: Record<string, number> = {}
  let all = 0
  for (const row of counts) {
    const key = toLeadOrigin(row.lead_origin as string | null)
    byOrigin[key] = (byOrigin[key] ?? 0) + Number(row.pocet)
    all += Number(row.pocet)
  }

  return {
    rows: rows as unknown as WebLead[],
    total: origin === 'vse' ? all : (byOrigin[origin] ?? 0),
    counts: byOrigin,
    all,
  }
}
