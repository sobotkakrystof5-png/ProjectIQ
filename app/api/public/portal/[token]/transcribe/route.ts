import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import {
  MAX_AUDIO_BYTES,
  isAllowedAudioType,
  isTranscriptionConfigured,
  transcribeAudio,
} from '@/lib/transcribe'

// Přepis hlasové zprávy klienta z portálu /p/[token]. Nic neukládá — vrací jen
// text, který klient před odesláním zkontroluje. Přepis stojí peníze, proto
// limity po IP i po projektu.

export const maxDuration = 60

const tokenSchema = z.string().uuid()
const IP_ENDPOINT = 'portal_transcribe'
const IP_WINDOW_MINUTES = 10
const IP_MAX = 6
const PROJECT_WINDOW_MINUTES = 24 * 60
const PROJECT_MAX = 15
// Multipart obálka k nahrávce.
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024

function fail(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!isTranscriptionConfigured()) {
    return fail(503, 'Přepis hlasu teď není dostupný. Napište prosím text.', 'NOT_CONFIGURED')
  }

  const ip = getClientIp(req)
  if (await isApiRateLimited(IP_ENDPOINT, ip, IP_WINDOW_MINUTES, IP_MAX)) {
    return fail(429, 'Příliš mnoho nahrávek v krátkém čase. Zkuste to prosím za chvíli.', 'RATE_LIMITED')
  }

  const { token } = await ctx.params
  if (!tokenSchema.safeParse(token).success) return fail(404, 'Projekt nenalezen.', 'NOT_FOUND')

  const rows = await sql`SELECT id FROM projects WHERE public_token = ${token} LIMIT 1`
  const projectId = (rows[0] as { id: string } | undefined)?.id
  if (!projectId) return fail(404, 'Projekt nenalezen.', 'NOT_FOUND')

  const projectEndpoint = `${IP_ENDPOINT}:${projectId}`
  if (await isApiRateLimited(projectEndpoint, 'project', PROJECT_WINDOW_MINUTES, PROJECT_MAX)) {
    return fail(429, 'Dnes už jste poslali hodně nahrávek. Napište prosím text, nebo to zkuste zítra.', 'RATE_LIMITED')
  }

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(413, 'Nahrávka je příliš dlouhá. Zkuste kratší.', 'TOO_LARGE')
  }

  let audio: FormDataEntryValue | null
  try {
    audio = (await req.formData()).get('audio')
  } catch {
    return fail(400, 'Neplatná nahrávka.', 'INVALID_BODY')
  }
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, 'Neplatná nahrávka.', 'INVALID_BODY')
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, 'Nahrávka je příliš dlouhá. Zkuste kratší.', 'TOO_LARGE')
  if (!isAllowedAudioType(audio.type)) return fail(415, 'Tenhle formát nahrávky neumíme přepsat.', 'UNSUPPORTED_TYPE')

  // Počítá se i neúspěšný pokus — platí se za každé volání poskytovatele.
  await Promise.all([recordApiRequest(IP_ENDPOINT, ip), recordApiRequest(projectEndpoint, 'project')])

  const result = await transcribeAudio(audio)
  if ('error' in result) return fail(502, result.error, 'TRANSCRIBE_FAILED')
  return NextResponse.json({ success: true, text: result.text })
}
