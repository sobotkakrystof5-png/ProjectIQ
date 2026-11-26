import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { isMissingVoiceSchema, resolveDevice, touchDevice, type ResolvedVoiceDevice } from './devices'
import { isVoiceKeyConfigured, voiceBearerFrom } from './keys'

/**
 * ZakazIQ Voice (R-150): společné ověření pro `/api/public/voice/*` (plán, oddíl 7).
 *
 * Volá je jen aplikace na Macu, ne prohlížeč: bez CORS, bez cookie a požadavek
 * s hlavičkou `Origin` dostane 403 (klíč nesmí skončit v JavaScriptu stránky).
 * Limit po IP se počítá u každého volání včetně neúspěšných (hádání klíčů),
 * limit po zařízení až po ověření. Chyba neprozradí, jestli zařízení existuje.
 */

export type VoiceScope = 'dictate' | 'config' | 'stats' | 'feedback' | 'write'

/** D-V11: 400 diktátů za hodinu na zařízení. */
/** `feedback` = oprava po vložení (nejvýš jedna na diktát), `write` = slovník a nastavení z okna na Macu (VO08). */
export const PER_DEVICE_HOURLY: Record<VoiceScope, number> = { dictate: 400, config: 240, stats: 240, feedback: 400, write: 120 }
const IP_ENDPOINT = 'voice_ip'
export const IP_HOURLY = 1200

const NO_STORE = { 'Cache-Control': 'no-store' }

export function voiceFail(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status, headers: NO_STORE })
}

export function voiceOk(body: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { headers: NO_STORE })
}

export async function authorizeVoiceDevice(
  req: NextRequest,
  scope: VoiceScope,
): Promise<{ ok: true; device: ResolvedVoiceDevice } | { ok: false; res: NextResponse }> {
  if (req.headers.get('origin')) return { ok: false, res: voiceFail(403, 'ORIGIN_NOT_ALLOWED') }
  if (!isVoiceKeyConfigured()) return { ok: false, res: voiceFail(503, 'NOT_CONFIGURED') }

  const ip = getClientIp(req)
  if (await isApiRateLimited(IP_ENDPOINT, ip, 60, IP_HOURLY)) return { ok: false, res: voiceFail(429, 'RATE_LIMITED') }
  await recordApiRequest(IP_ENDPOINT, ip)

  const key = voiceBearerFrom(req.headers.get('authorization'))
  let device: ResolvedVoiceDevice | null = null
  try {
    device = key ? await resolveDevice(key) : null
  } catch (err) {
    if (isMissingVoiceSchema(err)) return { ok: false, res: voiceFail(503, 'NOT_CONFIGURED') }
    throw err
  }
  if (!device) return { ok: false, res: voiceFail(401, 'UNAUTHORIZED') }

  const endpoint = `voice_${scope}:${device.id}`
  if (await isApiRateLimited(endpoint, 'device', 60, PER_DEVICE_HOURLY[scope])) {
    return { ok: false, res: voiceFail(429, 'RATE_LIMITED') }
  }
  await recordApiRequest(endpoint, 'device')
  await touchDevice(device.id)
  return { ok: true, device }
}

/** Nejdelší nahrávka (D-V11: 10 minut, upozornění v 9:30) s rezervou na zaokrouhlení. */
export const MAX_DURATION_MS = 605_000

/** Údaje o diktátu, které posílá Mac spolu s nahrávkou (pole `meta`). */
export const dictationMetaSchema = z
  .object({
    id: z.string().uuid(),
    startedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().min(0).max(MAX_DURATION_MS),
    speechMs: z.number().int().min(0).max(MAX_DURATION_MS).nullable(),
    mode: z.enum(['hold', 'hands_free']),
    cancelled: z.boolean().optional(),
    app: z.object({
      bundleId: z.string().trim().max(200).nullable(),
      name: z.string().trim().max(120).nullable(),
      // Jen nápověda pro kategorii u prohlížeče. Neukládá se (může nést předmět e-mailu).
      titleHint: z.string().max(200).nullable().optional(),
    }),
  })
  .strict()

export type DictationMetaInput = z.infer<typeof dictationMetaSchema>

/** Diktát z budoucnosti nebo starší než 30 dní (fronta offline) se nepřijme. */
export function startedAtPlausible(iso: string, now = Date.now()): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t <= now + 5 * 60_000 && t >= now - 30 * 86_400_000
}

/** Typy zvuku, které Mac posílá: AAC v kontejneru MP4 (m4a) a WAV. */
export const AUDIO_TYPES = new Set(['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/wave'])

/**
 * Obsah souboru odpovídá deklarovanému typu? m4a má na bajtech 4–7 `ftyp`,
 * WAV začíná `RIFF` a na bajtech 8–11 má `WAVE`. Jiný soubor s podvrženým
 * typem k poskytovateli přepisu nejde.
 */
export function audioBytesMatch(type: string, head: Uint8Array): boolean {
  const base = type.split(';')[0]?.trim().toLowerCase() ?? ''
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to))
  if (base === 'audio/wav' || base === 'audio/x-wav' || base === 'audio/wave') {
    return head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
  }
  return head.length >= 8 && ascii(4, 8) === 'ftyp'
}

/** Oprava po vložení (VO08): id diktátu a jak vložený úsek vypadá teď. */
export const feedbackSchema = z
  .object({
    id: z.string().uuid(),
    editedText: z.string().max(20_000),
  })
  .strict()

/** Strop těla `/feedback`: 20 000 znaků textu (až 4 bajty na znak) a obálka JSON. */
export const FEEDBACK_MAX_BYTES = 84 * 1024
/** Strop těla `/terms` a `/settings`. */
export const WRITE_MAX_BYTES = 16 * 1024
