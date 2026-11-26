import { NextRequest, NextResponse } from 'next/server'
import { readFormDataLimited } from '@/lib/security/request-body'
import { categoryFor } from '@/lib/admin/voice/categories'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import {
  AUDIO_TYPES,
  audioBytesMatch,
  authorizeVoiceDevice,
  dictationMetaSchema,
  startedAtPlausible,
  voiceFail,
  voiceOk,
} from '@/lib/admin/voice/http'
import { cleanupWithClaude } from '@/lib/admin/voice/cleanup'
import { runPipeline } from '@/lib/admin/voice/pipeline'
import {
  findDictation,
  forgetFailedDictation,
  loadPipelineContext,
  notifyCostCapOnce,
  saveCancelled,
  saveDictation,
  type DictationMeta,
} from '@/lib/admin/voice/store'
import { transcribeVoice } from '@/lib/admin/voice/stt'

// ZakazIQ Voice (R-150): diktát z Macu → text (plán, oddíly 3, 4 a 7).
//
// Multipart: `audio` (m4a nebo wav, nejvýš 4 MB) a `meta` (JSON). Server
// přepíše, projde pojistkami G1–G5 a G12, opraví slova ze slovníku, učeše
// text modelem a zkontroluje ho (G6–G11) a vrátí text; zvuk nikam neukládá
// a text nepíše do logu. Stejné `id` podruhé vrátí
// uložený výsledek bez nového přepisu (fronta na Macu bez sítě).

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 4 * 1024 * 1024
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024

export async function POST(req: NextRequest): Promise<NextResponse> {
  const started = Date.now()
  const auth = await authorizeVoiceDevice(req, 'dictate')
  if (!auth.ok) return auth.res

  const form = await readFormDataLimited(req, MAX_BODY_BYTES)
  if (!form.ok) return form.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')

  let metaJson: unknown = null
  const rawMeta = form.form.get('meta')
  if (typeof rawMeta !== 'string' || rawMeta.length > 4096) return voiceFail(400, 'INVALID_META')
  try {
    metaJson = JSON.parse(rawMeta)
  } catch {
    return voiceFail(400, 'INVALID_META')
  }
  const parsed = dictationMetaSchema.safeParse(metaJson)
  if (!parsed.success || !startedAtPlausible(parsed.data.startedAt)) return voiceFail(400, 'INVALID_META')
  const m = parsed.data

  const meta: DictationMeta = {
    id: m.id,
    deviceId: auth.device.id,
    startedAt: m.startedAt,
    durationMs: m.durationMs,
    speechMs: m.speechMs,
    mode: m.mode,
    appBundleId: m.app.bundleId || null,
    appName: m.app.name || null,
    category: categoryFor(m.app.bundleId, m.app.titleHint ?? null),
  }

  try {
    const existing = await findDictation(m.id, auth.device.id)
    if (existing?.status === 'error') {
      // Přepis minule selhal (502) a fronta na Macu to zkouší znovu — starý
      // pokus se zahodí a diktát se zpracuje, jinak by se nikdy nepřepsal.
      await forgetFailedDictation(m.id, auth.device.id)
    } else if (existing) {
      return voiceOk({ id: m.id, status: existing.status, text: existing.finalText ?? '', words: existing.words, guards: existing.guards })
    }

    if (m.cancelled) {
      await saveCancelled(meta)
      return voiceOk({ id: m.id, status: 'cancelled', text: '', words: 0, guards: [] })
    }

    const audio = form.form.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) return voiceFail(400, 'INVALID_AUDIO')
    if (audio.size > MAX_AUDIO_BYTES) return voiceFail(413, 'TOO_LARGE')
    const type = audio.type.split(';')[0]?.trim().toLowerCase() ?? ''
    const head = new Uint8Array(await audio.slice(0, 16).arrayBuffer())
    if (!AUDIO_TYPES.has(type) || !audioBytesMatch(type, head)) return voiceFail(415, 'UNSUPPORTED_TYPE')

    const { config, settings } = await loadPipelineContext()
    const outcome = await runPipeline(
      { audio, durationMs: m.durationMs, speechMs: m.speechMs, style: settings.styles[meta.category] },
      config,
      { transcribe: (a, prompt) => transcribeVoice(a, prompt), cleanup: cleanupWithClaude },
    )
    await saveDictation(meta, outcome, Date.now() - started, settings.storeText)
    if (outcome.costCapHit) {
      // Upozornění nesmí shodit diktát, text už je uložený.
      await notifyCostCapOnce(settings.dailyCostCapUsd).catch((err: unknown) =>
        console.error('[voice/dictate] upozornění na strop selhalo:', err instanceof Error ? err.name : 'unknown'),
      )
    }

    if (outcome.status === 'error') {
      return outcome.notConfigured ? voiceFail(503, 'NOT_CONFIGURED') : voiceFail(502, 'STT_FAILED')
    }
    return voiceOk({ id: m.id, status: outcome.status, text: outcome.finalText, words: outcome.words, guards: outcome.guards })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    // Jen název chyby: zpráva by mohla nést kus textu z dotazu.
    console.error('[voice/dictate] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
