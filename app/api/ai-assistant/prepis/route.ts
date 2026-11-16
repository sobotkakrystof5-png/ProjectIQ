import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import {
  MAX_AUDIO_BYTES,
  PROMPT_MAX_CHARS,
  isAllowedAudioType,
  isTranscriptionConfigured,
  transcribeAudio,
} from '@/lib/transcribe'

/**
 * Přepis hlasu pro asistenta v adminu (R-111).
 *
 * Nahrávka jde přes server k přepisu a zahodí se — nikam se neukládá,
 * vrací se jen text. Ten pak jde stejnou cestou jako napsaná věta
 * (`proposeSuggestion`), takže hlas nemá žádná jiná práva než klávesnice.
 *
 * K přepisu se přidá nápověda se jmény posledních klientů a firem: model
 * přepisu je jinak zapisuje foneticky a asistent je pak v databázi nenajde.
 * Ta jména tím odcházejí poskytovateli přepisu — stejně jako v samotné
 * nahrávce, kde je člověk vysloví (zpracovatel je uvedený v ochraně údajů).
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const RATE_KEY = 'ai-prepis'
const RATE_WINDOW_MINUTES = 10
const RATE_MAX = 30
const DAY_KEY = 'ai-prepis-den'
const DAY_WINDOW_MINUTES = 24 * 60
const DAY_MAX = 200
const ACTOR = 'admin'
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status })
}

/**
 * Nahrávku posílá jen panel adminu. Multipart je „jednoduchý" požadavek,
 * který umí odeslat i formulář na cizí stránce — bez kontroly by šlo
 * přihlášenému adminovi utrácet za přepis (stejná ochrana jako PDF předání).
 */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

/** Jména z posledního půlroku, nejnovější první. Chyba databáze přepis nezastaví. */
async function namesHint(): Promise<string> {
  try {
    const rows = await adminDb`
      SELECT name FROM (
        SELECT client_name AS name, created_at FROM projects
        WHERE created_at > now() - interval '180 days'
        UNION ALL
        SELECT company_name, created_at FROM client_leads
        WHERE created_at > now() - interval '180 days'
        UNION ALL
        SELECT contact_name, created_at FROM client_leads
        WHERE created_at > now() - interval '180 days' AND contact_name IS NOT NULL
      ) n
      WHERE name IS NOT NULL AND length(trim(name)) BETWEEN 2 AND 60
      GROUP BY name ORDER BY max(created_at) DESC LIMIT 60
    `
    const names = rows.map((r) => String(r.name).trim()).filter(Boolean)
    if (names.length === 0) return ''
    return `Pokyny pro správu zakázek a kalendáře. Jména: ${names.join(', ')}.`.slice(0, PROMPT_MAX_CHARS)
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return fail(401, 'Přihlaste se prosím znovu.')
  if (!sameOrigin(req)) return fail(403, 'Neplatný požadavek.')
  if (!isTranscriptionConfigured()) return fail(503, 'Přepis hlasu teď není dostupný. Napište to prosím.')

  if (
    (await isApiRateLimited(RATE_KEY, ACTOR, RATE_WINDOW_MINUTES, RATE_MAX)) ||
    (await isApiRateLimited(DAY_KEY, ACTOR, DAY_WINDOW_MINUTES, DAY_MAX))
  ) {
    return fail(429, 'Moc nahrávek za sebou. Zkuste to za chvíli.')
  }

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'Nahrávka je moc dlouhá. Zkuste kratší.')

  let audio: FormDataEntryValue | null
  try {
    audio = (await req.formData()).get('audio')
  } catch {
    return fail(400, 'Nahrávka se nepodařila. Zkuste to znovu.')
  }
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, 'Nahrávka je prázdná.')
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, 'Nahrávka je moc dlouhá. Zkuste kratší.')
  if (!isAllowedAudioType(audio.type)) return fail(415, 'Tenhle formát nahrávky neumím přepsat.')

  // Počítá se i neúspěšný pokus — platí se za každé volání poskytovatele.
  await Promise.all([recordApiRequest(RATE_KEY, ACTOR), recordApiRequest(DAY_KEY, ACTOR)])

  const result = await transcribeAudio(audio, fetch, await namesHint())
  if ('error' in result) return fail(502, result.error)
  return NextResponse.json({ ok: true, text: result.text })
}
