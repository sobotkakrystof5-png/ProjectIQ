// Přepis hlasu klienta na text přes OpenAI. Bez SDK (jeden multipart POST),
// audio se nikam neukládá — jde jen přes server k přepisu a zahodí se.
//
// Název modelu je v env, protože OpenAI ohlásilo vyřazení starších přepisovacích
// modelů; výměna je změna jedné proměnné, ne kódu.

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
] as const

const DEFAULT_MODEL = 'gpt-4o-transcribe'
const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseAudioType(type: string): string {
  return type.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isAllowedAudioType(type: string): boolean {
  return (ALLOWED_AUDIO_TYPES as readonly string[]).includes(baseAudioType(type))
}

function extensionFor(type: string): string {
  switch (baseAudioType(type)) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a'
    case 'audio/ogg':
      return 'ogg'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
      return 'wav'
    default:
      return 'webm'
  }
}

export type TranscribeResult = { text: string } | { error: string }

export async function transcribeAudio(
  audio: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { error: 'Přepis hlasu teď není dostupný. Napište prosím text.' }

  const form = new FormData()
  form.append('file', audio, `nahravka.${extensionFor(audio.type)}`)
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_MODEL)
  form.append('language', 'cs')
  form.append('response_format', 'json')

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      // Tělo chyby může nést kus nahrávky nebo klíče — do logu jen stav.
      console.error('[transcribe] OpenAI vrátilo', res.status)
      return { error: 'Nahrávku se nepodařilo přepsat. Zkuste to prosím znovu, nebo napište text.' }
    }
    const data = (await res.json()) as { text?: unknown }
    const text = typeof data.text === 'string' ? data.text.trim() : ''
    if (!text) return { error: 'V nahrávce jsme nic nezachytili. Zkuste to prosím znovu.' }
    return { text }
  } catch (err) {
    console.error('[transcribe] přepis selhal:', err instanceof Error ? err.name : 'unknown')
    return { error: 'Nahrávku se nepodařilo přepsat. Zkuste to prosím znovu, nebo napište text.' }
  }
}
