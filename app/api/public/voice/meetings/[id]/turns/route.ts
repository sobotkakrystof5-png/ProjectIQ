import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { AUDIO_TYPES, audioBytesMatch, authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { TURN_MAX_AUDIO_BYTES, meetingTurnMetaSchema, processMeetingTurn } from '@/lib/admin/voice/meeting-turn'
import { findTurn, meetingOwnedBy, saveTurn } from '@/lib/admin/voice/meetings'
import { loadPipelineContext } from '@/lib/admin/voice/store'
import { transcribeVoice } from '@/lib/admin/voice/stt'
import { readFormDataLimited } from '@/lib/security/request-body'

// ZakazIQ Voice — schůzky (R-151): jedna promluva jedné strany (multipart
// `meta` + `audio`). Server přepíše, projde pojistkami a uloží text; zvuk
// zahodí a text nepíše do logu. Stejná promluva podruhé vrátí uložený výsledek
// (fronta na Macu), neúspěšný starší pokus se zpracuje znovu.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()
const MAX_BODY_BYTES = TURN_MAX_AUDIO_BYTES + 16 * 1024

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'meeting')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')

  const form = await readFormDataLimited(req, MAX_BODY_BYTES)
  if (!form.ok) return form.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const rawMeta = form.form.get('meta')
  if (typeof rawMeta !== 'string' || rawMeta.length > 1024) return voiceFail(400, 'INVALID_META')
  let metaJson: unknown
  try {
    metaJson = JSON.parse(rawMeta)
  } catch {
    return voiceFail(400, 'INVALID_META')
  }
  const meta = meetingTurnMetaSchema.safeParse(metaJson)
  if (!meta.success) return voiceFail(400, 'INVALID_META')

  try {
    if (!(await meetingOwnedBy(id.data, auth.device.id))) return voiceFail(404, 'NOT_FOUND')
    const existing = await findTurn(id.data, meta.data.track, meta.data.idx)
    if (existing && existing.status !== 'error') return voiceOk({ status: existing.status, text: existing.text ?? '' })

    const audio = form.form.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) return voiceFail(400, 'INVALID_AUDIO')
    if (audio.size > TURN_MAX_AUDIO_BYTES) return voiceFail(413, 'TOO_LARGE')
    const type = audio.type.split(';')[0]?.trim().toLowerCase() ?? ''
    const head = new Uint8Array(await audio.slice(0, 16).arrayBuffer())
    if (!AUDIO_TYPES.has(type) || !audioBytesMatch(type, head)) return voiceFail(415, 'UNSUPPORTED_TYPE')

    const { config } = await loadPipelineContext()
    const out = await processMeetingTurn(
      { audio, durationMs: meta.data.durationMs, speechMs: meta.data.speechMs },
      { terms: config.terms, blocklist: config.blocklist },
      (a, prompt) => transcribeVoice(a, prompt),
    )
    await saveTurn(id.data, meta.data, out)
    if (out.status === 'error') return out.notConfigured ? voiceFail(503, 'NOT_CONFIGURED') : voiceFail(502, 'STT_FAILED')
    return voiceOk({ status: out.status, text: out.text })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/turns] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
