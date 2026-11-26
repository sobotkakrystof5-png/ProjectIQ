import type { SttSegment } from './guards'

/**
 * ZakazIQ Voice (R-150): přepis řeči na text (D-V3).
 *
 * Hlavní poskytovatel `VOICE_STT_PROVIDER` (`groq` výchozí, nebo `openai`),
 * když selže nebo nemá klíč, zkusí se druhý. Groq vrací segmenty s jistotou
 * (`verbose_json`), na kterých stojí pojistka G2; OpenAI vrací jen text.
 *
 * Audio se nikam neukládá: jde přes server k poskytovateli a zahodí se.
 * Tělo chyby poskytovatele se neloguje (může nést kus nahrávky).
 */

export type SttProvider = 'groq' | 'openai'

export interface SttAttempt {
  provider: SttProvider
  model: string
  ok: boolean
  /** Poskytovatel nemá klíč, nevolal se. */
  skipped: boolean
  /** HTTP stav, 0 = síť, časový limit nebo přeskočeno. */
  status: number
  ms: number
}

export interface SttOk {
  ok: true
  provider: SttProvider
  model: string
  text: string
  /** Jen Groq. */
  segments: SttSegment[] | null
  /** Délka zvuku podle poskytovatele (Groq), jinak null. */
  durationSec: number | null
  ms: number
  /** Selhal hlavní a text je ze zálohy. */
  fallback: boolean
  attempts: SttAttempt[]
}

export interface SttFail {
  ok: false
  /** Žádný poskytovatel nemá klíč. */
  notConfigured: boolean
  ms: number
  attempts: SttAttempt[]
}

export type SttResult = SttOk | SttFail

const URLS: Record<SttProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
}

/** Výchozí modely — jediné místo (plán, oddíl 11). */
export const DEFAULT_STT_MODEL: Record<SttProvider, string> = {
  groq: 'whisper-large-v3-turbo',
  openai: 'gpt-4o-transcribe',
}

/** G10: časový limit přepisu. */
export const STT_TIMEOUT_MS = 20_000

const env = (name: string): string => process.env[name]?.trim() ?? ''

function keyFor(provider: SttProvider): string {
  return provider === 'groq' ? env('GROQ_API_KEY') : env('OPENAI_API_KEY')
}

export function sttModel(provider: SttProvider): string {
  return provider === 'groq'
    ? env('VOICE_GROQ_STT_MODEL') || DEFAULT_STT_MODEL.groq
    : env('VOICE_OPENAI_STT_MODEL') || env('OPENAI_TRANSCRIBE_MODEL') || DEFAULT_STT_MODEL.openai
}

/** Pořadí pokusů: hlavní, pak záloha. Bez klíče se poskytovatel přeskočí. */
export function sttOrder(): SttProvider[] {
  const primary: SttProvider = env('VOICE_STT_PROVIDER') === 'openai' ? 'openai' : 'groq'
  const backup: SttProvider = primary === 'groq' ? 'openai' : 'groq'
  return [primary, backup]
}

export const isSttConfigured = (): boolean => Boolean(keyFor('groq') || keyFor('openai'))

function fileName(type: string): string {
  const base = type.split(';')[0]?.trim().toLowerCase()
  return base === 'audio/wav' || base === 'audio/x-wav' ? 'diktat.wav' : 'diktat.m4a'
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

type Verbose = {
  text?: unknown
  duration?: unknown
  segments?: { text?: unknown; no_speech_prob?: unknown; avg_logprob?: unknown; compression_ratio?: unknown }[]
}

async function callProvider(
  provider: SttProvider,
  audio: Blob,
  prompt: string,
  fetchImpl: typeof fetch,
): Promise<{ attempt: SttAttempt; data?: Verbose }> {
  const model = sttModel(provider)
  const key = keyFor(provider)
  if (!key) return { attempt: { provider, model, ok: false, skipped: true, status: 0, ms: 0 } }

  const form = new FormData()
  form.append('file', audio, fileName(audio.type))
  form.append('model', model)
  form.append('language', 'cs')
  form.append('temperature', '0')
  form.append('response_format', provider === 'groq' ? 'verbose_json' : 'json')
  if (prompt) form.append('prompt', prompt)

  const started = Date.now()
  try {
    const res = await fetchImpl(URLS[provider], {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      console.error('[voice/stt]', provider, 'vrátil', res.status)
      return { attempt: { provider, model, ok: false, skipped: false, status: res.status, ms } }
    }
    const data = (await res.json()) as Verbose
    return { attempt: { provider, model, ok: true, skipped: false, status: res.status, ms }, data }
  } catch (err) {
    console.error('[voice/stt]', provider, 'selhal:', err instanceof Error ? err.name : 'unknown')
    return { attempt: { provider, model, ok: false, skipped: false, status: 0, ms: Date.now() - started } }
  }
}

export async function transcribeVoice(audio: Blob, prompt: string, fetchImpl: typeof fetch = fetch): Promise<SttResult> {
  const started = Date.now()
  const attempts: SttAttempt[] = []
  for (const provider of sttOrder()) {
    const { attempt, data } = await callProvider(provider, audio, prompt, fetchImpl)
    attempts.push(attempt)
    if (!attempt.ok || !data) continue
    const text = typeof data.text === 'string' ? data.text.trim() : ''
    const segments =
      provider === 'groq' && Array.isArray(data.segments)
        ? data.segments.map((s) => ({
            text: typeof s.text === 'string' ? s.text : '',
            noSpeechProb: num(s.no_speech_prob),
            avgLogprob: num(s.avg_logprob),
            compressionRatio: num(s.compression_ratio),
          }))
        : null
    return {
      ok: true,
      provider,
      model: attempt.model,
      text,
      segments,
      durationSec: num(data.duration) ?? null,
      ms: Date.now() - started,
      fallback: attempts.some((a) => !a.ok && !a.skipped),
      attempts,
    }
  }
  return {
    ok: false,
    notConfigured: attempts.every((a) => a.skipped),
    ms: Date.now() - started,
    attempts,
  }
}
