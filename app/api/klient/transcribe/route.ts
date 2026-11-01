import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { getPortalContext } from '@/lib/portal/context'
import {
  MAX_AUDIO_BYTES,
  isAllowedAudioType,
  isTranscriptionConfigured,
  transcribeAudio,
} from '@/lib/transcribe'

// Přepis hlasu pro přihlášeného klienta (KP07). Nic neukládá, vrací jen text.
// Přepis stojí peníze: limity po IP i po členovi, počítá se každé volání.

export const maxDuration = 60

const IP_ENDPOINT = 'klient_transcribe'
const IP_WINDOW_MINUTES = 10
const IP_MAX = 8
const MEMBER_WINDOW_MINUTES = 24 * 60
const MEMBER_MAX = 20
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024

function fail(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isTranscriptionConfigured()) {
    return fail(503, 'Přepis hlasu teď není dostupný. Napište prosím text.', 'NOT_CONFIGURED')
  }

  const ctx = await getPortalContext()
  if (!ctx) return fail(401, 'Přihlaste se prosím znovu.', 'UNAUTHORIZED')

  const ip = getClientIp(req)
  if (await isApiRateLimited(IP_ENDPOINT, ip, IP_WINDOW_MINUTES, IP_MAX)) {
    return fail(429, 'Příliš mnoho nahrávek v krátkém čase. Zkuste to prosím za chvíli.', 'RATE_LIMITED')
  }
  const memberEndpoint = `${IP_ENDPOINT}:${ctx.memberId}`
  if (await isApiRateLimited(memberEndpoint, 'member', MEMBER_WINDOW_MINUTES, MEMBER_MAX)) {
    return fail(429, 'Dnes už jste poslali hodně nahrávek. Napište prosím text, nebo to zkuste zítra.', 'RATE_LIMITED')
  }
  await Promise.all([recordApiRequest(IP_ENDPOINT, ip), recordApiRequest(memberEndpoint, 'member')])

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

  const result = await transcribeAudio(audio)
  if ('error' in result) return fail(502, result.error, 'TRANSCRIBE_FAILED')
  return NextResponse.json({ success: true, text: result.text })
}
