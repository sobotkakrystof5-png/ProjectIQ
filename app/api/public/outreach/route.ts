import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerApiKey, getClientIp } from '@/lib/api-auth'
import { readJsonLimited } from '@/lib/security/request-body'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { createNotification } from '@/lib/notifications'
import { ingestOutreachLeads, type OutreachEvent } from '@/lib/admin/outreach'
import { outreachPayloadSchema } from '@/types/outreach'

/**
 * Příjem snímků z Growth OS (R-112). Volá ho vizeon-autopilot ze serveru
 * (GitHub Actions / Cloudflare) s klíčem `GROWTH_OS_API_KEY`; prohlížeč sem
 * nechodí, takže žádné CORS.
 *
 * v1: 100 firem na dávku má i se shrnutím hovoru pod 256 kB.
 * v2 (R-120): ke snímku jdou všechny hovory i s přepisem a e-maily s textem.
 * Growth OS proto dělí dávky podle velikosti (pod 900 kB); hodinová
 * synchronizace posílá hovory bez přepisu, přepis jde hned po hovoru.
 */
const MAX_BODY_BYTES = 1024 * 1024
const ENDPOINT = 'growth_os_outreach'
const RATE_LIMIT_WINDOW_MINUTES = 1
// Jednorázové dotažení historie posílá desítky dávek za sebou.
const RATE_LIMIT_MAX_REQUESTS = 60
/** Víc jednotlivých oznámení na dávku by zahltilo zvonek. */
const MAX_NOTIFICATIONS = 5

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

function notificationFor(event: OutreachEvent): { title: string; body: string } {
  switch (event.kind) {
    case 'odpovedel':
      return { title: `${event.company} odpověděl na e-mail`, body: 'Ozvěte se mu, dokud je to čerstvé.' }
    case 'otevrel-ukazku':
      return { title: `${event.company} otevřel ukázku`, body: 'Teď je dobrá chvíle zavolat.' }
    case 'do-fronty':
      return { title: `Hovor od asistenta: ${event.company}`, body: event.reason }
  }
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

  const parsed = outreachPayloadSchema.safeParse(read.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse(400, issue ? `${issue.path.join('.')}: ${issue.message}` : 'Neplatná data')
  }

  let result
  try {
    result = await ingestOutreachLeads(parsed.data.leads, parsed.data.version)
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return errorResponse(503, 'Databáze ještě nemá tabulku pro hovory od asistenta (migrace 114).')
    }
    console.error('[outreach] Uložení selhalo:', (err as Error)?.message)
    return errorResponse(500, 'Uložení selhalo')
  }

  const events = result.events
  for (const event of events.slice(0, MAX_NOTIFICATIONS)) {
    const { title, body } = notificationFor(event)
    const link = event.leadId ? `/dashboard/ai-asistent/kontakt/${event.leadId}` : '/dashboard/ai-asistent?pohled=kontakty'
    await createNotification({ type: 'outreach_lead', title, body, link })
  }
  if (events.length > MAX_NOTIFICATIONS) {
    await createNotification({
      type: 'outreach_lead',
      title: `Dalších ${events.length - MAX_NOTIFICATIONS} firem od asistenta čeká na vás`,
      link: '/dashboard/ai-asistent?pohled=kontakty',
    })
  }

  return NextResponse.json(
    { success: true, received: result.received, saved: result.saved, calls: result.calls, emails: result.emails },
    { status: 200 },
  )
}
