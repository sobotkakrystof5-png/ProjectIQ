import { z } from 'zod'
import { sttCostUsd } from './costs'
import { applyDictionary, buildSttPrompt, type VoiceTerm } from './dictionary'
import {
  GUARD,
  MIN_SPEECH_MS,
  applyBlocklist,
  collapseRepeats,
  echoesPrompt,
  filterSegments,
  isImplausiblyFast,
  type BlockPhrase,
} from './guards'
import type { SttResult } from './stt'
import { countWords, stripFillers, tidy } from './text'

/**
 * ZakazIQ Voice — schůzky (R-151): jedna promluva jedné strany → text.
 *
 * Stejné pojistky proti vymyšlenému textu jako u diktátu (G1–G5, G12) a slovník,
 * ale bez zkratek, „nového řádku" a bez čištění modelem: přepis schůzky má
 * zůstat, jak zazněl (jen bez „ehm"). Přepis se předává zvenku, takže jde
 * testovat bez sítě.
 */

export type MeetingTurnStatus = 'ok' | 'empty' | 'blocked' | 'error'

export interface MeetingTurnConfig {
  terms: VoiceTerm[]
  blocklist: BlockPhrase[]
}

export interface MeetingTurnInput {
  audio: Blob
  durationMs: number
  speechMs: number | null
}

export interface MeetingTurnOutcome {
  status: MeetingTurnStatus
  text: string
  guards: string[]
  notConfigured: boolean
  sttProvider: string | null
  sttModel: string | null
  sttMs: number | null
  costUsd: number
}

export async function processMeetingTurn(
  input: MeetingTurnInput,
  config: MeetingTurnConfig,
  transcribe: (audio: Blob, prompt: string) => Promise<SttResult>,
): Promise<MeetingTurnOutcome> {
  const out: MeetingTurnOutcome = {
    status: 'empty',
    text: '',
    guards: [],
    notConfigured: false,
    sttProvider: null,
    sttModel: null,
    sttMs: null,
    costUsd: 0,
  }

  // G1: bez řeči se nic nepřepisuje.
  if (input.speechMs !== null && input.speechMs < MIN_SPEECH_MS) {
    out.guards.push(GUARD.noSpeech)
    return out
  }

  const prompt = buildSttPrompt(config.terms)
  const stt = await transcribe(input.audio, prompt)
  if (!stt.ok) {
    out.status = 'error'
    out.notConfigured = stt.notConfigured
    out.sttMs = stt.ms
    out.guards.push(stt.notConfigured ? GUARD.sttNotConfigured : GUARD.sttFailed)
    return out
  }
  out.sttProvider = stt.provider
  out.sttModel = stt.model
  out.sttMs = stt.ms
  const seconds = stt.durationSec ?? input.durationMs / 1000
  out.costUsd = sttCostUsd(stt.provider, stt.model, Math.round(seconds * 100) / 100)
  if (stt.fallback) out.guards.push(GUARD.sttFallback)

  let text = stt.text
  if (echoesPrompt(text, prompt)) {
    out.guards.push(GUARD.promptEcho)
    text = ''
  }
  if (text && stt.segments) {
    const filtered = filterSegments(stt.segments)
    if (filtered.dropped > 0) {
      out.guards.push(GUARD.segments)
      text = filtered.text
    }
  }
  const repeats = collapseRepeats(text)
  if (repeats.collapsed) out.guards.push(GUARD.repeat)
  text = repeats.text

  const blocked = applyBlocklist(text, config.blocklist, input.speechMs ?? input.durationMs)
  if (blocked.hits.length) out.guards.push(GUARD.blocklist)
  text = blocked.text

  if (isImplausiblyFast(countWords(text), input.durationMs)) {
    out.guards.push(GUARD.tooFast)
    text = ''
  }

  const fixed = stripFillers(applyDictionary(text, config.terms).text).text
  const final = tidy(fixed)
  if (!countWords(final)) {
    out.status = out.guards.some((g) => g !== GUARD.sttFallback) ? 'blocked' : 'empty'
    return out
  }
  out.status = 'ok'
  out.text = final
  return out
}

// --- Vstupy z Macu -------------------------------------------------------------

/** Nejdelší schůzka 2 hodiny (+ rezerva na zaokrouhlení a doběh). */
export const MEETING_MAX_MS = 7_500_000
/** Nejdelší promluva (Mac dělí delší na kusy po 45 s). */
export const TURN_MAX_MS = 120_000
/**
 * Strop nahrávky jedné promluvy: 2 minuty m4a při 32 kbit/s je kolem 480 kB, Mac posílá
 * do 60 s (~240 kB). Víc by s ukradeným klíčem znamenalo platit přepis delší, než promluva smí být.
 */
export const TURN_MAX_AUDIO_BYTES = 768 * 1024

export const meetingCreateSchema = z
  .object({
    id: z.string().uuid(),
    startedAt: z.iso.datetime({ offset: true }),
    title: z.string().trim().min(1).max(160).nullable().optional(),
    app: z
      .object({
        bundleId: z.string().trim().max(200).nullable(),
        name: z.string().trim().max(120).nullable(),
      })
      .strict(),
  })
  .strict()

export const meetingTurnMetaSchema = z
  .object({
    track: z.enum(['me', 'other']),
    idx: z.number().int().min(0).max(100_000),
    startMs: z.number().int().min(0).max(MEETING_MAX_MS),
    durationMs: z.number().int().min(1).max(TURN_MAX_MS),
    speechMs: z.number().int().min(0).max(TURN_MAX_MS).nullable(),
  })
  .strict()

export const meetingFinishSchema = z
  .object({
    endedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().min(0).max(MEETING_MAX_MS),
  })
  .strict()

export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>
export type MeetingTurnMeta = z.infer<typeof meetingTurnMetaSchema>
