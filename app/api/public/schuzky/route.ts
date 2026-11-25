import { NextRequest, NextResponse, after } from 'next/server'
import { getClientIp, verifyApiKey, verifyBearerApiKey } from '@/lib/api-auth'
import { readJsonLimited } from '@/lib/security/request-body'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { ingestMeetingNote, knownMeetingIds, normalizeParticipants, stripWisprMarkers } from '@/lib/admin/meeting-notes/store'
import { processMeetingNote } from '@/lib/admin/meeting-notes/process'
import { meetingIngestSchema, meetingKnownQuerySchema } from '@/types/meeting-notes'

/**
 * Příjem schůzek z Wispr Flow (R-144).
 *
 * Wispr Flow nemá API ani webhook, jen konektor pro Clauda. Most je
 * naplánovaná úloha Clauda (docs/admin/SCHUZKY-WISPR.md): přes konektor najde
 * nové schůzky, zeptá se `GET ?ids=…`, které tu ještě nejsou, a pošle je sem
 * i s doslovným přepisem. Zpracování (AI, klient, koncept v Gmailu) běží po
 * odpovědi přes `after()`, ať most nečeká.
 *
 * Klíč `MEETING_NOTES_API_KEY` v `Authorization: Bearer …` nebo `x-api-key`
 * (proxy naplánované úlohy umí přidat hlavičku podle hostitele). Bez nastavené
 * proměnné se odmítá všechno. Prohlížeč sem nechodí, CORS žádné.
 */

export const dynamic = 'force-dynamic'
// AI nad 40minutovou schůzkou trvá desítky sekund; běží v `after()` téhož volání.
export const maxDuration = 120

/** Hodina hovoru je kolem 50 tisíc znaků; strop přepisu je milion znaků (s diakritikou a JSON escapováním víc bajtů). */
const MAX_BODY_BYTES = 3 * 1024 * 1024
const ENDPOINT = 'meeting_notes'
const RATE_WINDOW_MINUTES = 1
const RATE_MAX_REQUESTS = 30
const ENV_KEY = 'MEETING_NOTES_API_KEY'

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

function authorized(req: NextRequest): boolean {
  return verifyBearerApiKey(req, ENV_KEY) || verifyApiKey(req, ENV_KEY)
}

async function gate(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req)
  if (await isApiRateLimited(ENDPOINT, ip, RATE_WINDOW_MINUTES, RATE_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.')
  }
  await recordApiRequest(ENDPOINT, ip)
  if (!authorized(req)) return errorResponse(401, 'Neplatný nebo chybějící API klíč')
  return null
}

function missingTable(err: unknown): boolean {
  return (err as { code?: string })?.code === '42P01'
}

/** `GET ?ids=a,b,c` → které z těch schůzek Wispr Flow už ZakazIQ má. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = await gate(req)
  if (blocked) return blocked

  const raw = (req.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const parsed = meetingKnownQuerySchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'Parametr ids: 1 až 100 id oddělených čárkou')

  try {
    const known = await knownMeetingIds('wispr', parsed.data)
    return NextResponse.json({ success: true, known })
  } catch (err) {
    if (missingTable(err)) return errorResponse(503, 'Databáze ještě nemá tabulku schůzek (migrace 134).')
    console.error('[schuzky] čtení selhalo:', (err as Error)?.message)
    return errorResponse(500, 'Čtení selhalo')
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = await gate(req)
  if (blocked) return blocked

  const read = await readJsonLimited(req, MAX_BODY_BYTES)
  if (!read.ok) {
    return read.reason === 'too-large'
      ? errorResponse(413, 'Tělo požadavku je příliš velké')
      : errorResponse(400, 'Neplatné JSON tělo požadavku')
  }

  const parsed = meetingIngestSchema.safeParse(read.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse(400, issue ? `${issue.path.join('.')}: ${issue.message}` : 'Neplatná data')
  }
  const m = parsed.data
  const transcript = stripWisprMarkers(m.transcript)
  if (transcript.trim() === '') return errorResponse(400, 'transcript: přepis je prázdný')

  let result
  try {
    result = await ingestMeetingNote({
      source: 'wispr',
      sourceId: m.id,
      title: m.title ?? null,
      startedAt: m.start ?? null,
      endedAt: m.end ?? null,
      shareLink: m.share_link ?? null,
      participants: normalizeParticipants(m.participants),
      sourceSummary: m.summary ?? null,
      transcript,
      declaredChars: m.transcript_chars ?? null,
    })
  } catch (err) {
    if (missingTable(err)) return errorResponse(503, 'Databáze ještě nemá tabulku schůzek (migrace 134).')
    console.error('[schuzky] uložení selhalo:', (err as Error)?.message)
    return errorResponse(500, 'Uložení selhalo')
  }

  if (result.changed) {
    const id = result.id
    after(async () => {
      await processMeetingNote(id).catch((err: unknown) => {
        console.error('[schuzky] zpracování selhalo:', err instanceof Error ? err.message : 'unknown')
      })
    })
  }

  // Kontrola úplnosti: most hlásí, kolik znaků měl přepis ve Wispr Flow.
  const complete = m.transcript_chars == null || Math.abs(transcript.length - m.transcript_chars) <= 50

  return NextResponse.json(
    { success: true, id: result.id, created: result.created, changed: result.changed, complete, chars: transcript.length },
    { status: result.created ? 201 : 200 },
  )
}
