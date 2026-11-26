import { sttCostUsd } from './costs'
import { applyDictionary, buildSttPrompt, matchSnippet, type VoiceSnippet, type VoiceTerm } from './dictionary'
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
import { countWords, tidy } from './text'

/**
 * ZakazIQ Voice (R-148): cesta jednoho diktátu od nahrávky k textu (plán, oddíl 3).
 *
 *   G1 řeč? → přepis (záloha) → G12 ozvěna nápovědy → G2 segmenty → G3 opakování
 *   → G4 blokované fráze → G5 rychlost → zkratka? → slovník → [čištění, VO07] → text
 *
 * Co zahodilo nebo změnilo text, přidá kód do `guards`. Přepis se předává
 * zvenku, takže celá cesta jde otestovat bez sítě. Čištění modelem a jeho
 * kontrola (G6–G11) přijdou ve VO07 na vyznačené místo.
 */

export interface PipelineConfig {
  terms: VoiceTerm[]
  snippets: VoiceSnippet[]
  blocklist: BlockPhrase[]
}

export interface PipelineInput {
  audio: Blob
  durationMs: number
  /** Řeč bez ticha podle Macu; null = Mac neměřil. */
  speechMs: number | null
}

export interface PipelineDeps {
  transcribe: (audio: Blob, prompt: string) => Promise<SttResult>
}

export type PipelineStatus = 'ok' | 'snippet' | 'empty' | 'blocked' | 'error'

export interface PipelineOutcome {
  status: PipelineStatus
  guards: string[]
  /** Přepis tak, jak přišel od poskytovatele. */
  rawText: string | null
  finalText: string
  words: number
  dictionaryFixes: number
  usedTermIds: string[]
  snippetId: string | null
  /** Žádný poskytovatel přepisu nemá klíč (route vrátí 503). */
  notConfigured: boolean
  sttProvider: string | null
  sttModel: string | null
  sttMs: number | null
  audioSeconds: number
  costUsd: number
}

export async function runPipeline(input: PipelineInput, config: PipelineConfig, deps: PipelineDeps): Promise<PipelineOutcome> {
  const out: PipelineOutcome = {
    status: 'empty',
    guards: [],
    rawText: null,
    finalText: '',
    words: 0,
    dictionaryFixes: 0,
    usedTermIds: [],
    snippetId: null,
    notConfigured: false,
    sttProvider: null,
    sttModel: null,
    sttMs: null,
    audioSeconds: Math.round(input.durationMs / 10) / 100,
    costUsd: 0,
  }

  // G1: bez řeči se nic nepřepisuje — na tichu si Whisper vymýšlí.
  if (input.speechMs !== null && input.speechMs < MIN_SPEECH_MS) {
    out.guards.push(GUARD.noSpeech)
    return out
  }

  const prompt = buildSttPrompt(config.terms)
  const stt = await deps.transcribe(input.audio, prompt)
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
  if (stt.durationSec !== null) out.audioSeconds = Math.round(stt.durationSec * 100) / 100
  out.costUsd = sttCostUsd(stt.provider, stt.model, out.audioSeconds)
  out.rawText = stt.text
  if (stt.fallback) out.guards.push(GUARD.sttFallback)

  let text = stt.text

  // G12: přepis je jen ozvěna nápovědy slovníku.
  if (echoesPrompt(text, prompt)) {
    out.guards.push(GUARD.promptEcho)
    text = ''
  }

  // G2: segmenty, které Whisper sám považuje za ticho nebo smyčku.
  if (text && stt.segments) {
    const filtered = filterSegments(stt.segments)
    if (filtered.dropped > 0) {
      out.guards.push(GUARD.segments)
      text = filtered.text
    }
  }

  // G3: opakování.
  const repeats = collapseRepeats(text)
  if (repeats.collapsed) out.guards.push(GUARD.repeat)
  text = repeats.text

  // G4: blokované fráze.
  const blocked = applyBlocklist(text, config.blocklist, input.speechMs ?? input.durationMs)
  if (blocked.hits.length) out.guards.push(GUARD.blocklist)
  text = blocked.text

  // G5: víc slov, než se dá vyslovit.
  if (isImplausiblyFast(countWords(text), input.durationMs)) {
    out.guards.push(GUARD.tooFast)
    text = ''
  }

  if (!countWords(text)) {
    // Prázdný přepis bez zásahu pojistky = nic se neřeklo; zásah = vymyšlený text.
    out.status = out.guards.some((g) => g !== GUARD.sttFallback) ? 'blocked' : 'empty'
    return out
  }

  // Zkratka: celý diktát je spouštěcí fráze.
  const snippet = matchSnippet(text, config.snippets)
  if (snippet) {
    out.status = 'snippet'
    out.snippetId = snippet.id
    out.finalText = snippet.expansion
    out.words = countWords(snippet.expansion)
    return out
  }

  // Slovník — bez modelu, vždy.
  const dict = applyDictionary(text, config.terms)
  out.dictionaryFixes = dict.fixes
  out.usedTermIds = dict.usedIds

  // Místo pro čištění modelem a kontrolu výstupu (VO07).

  out.status = 'ok'
  out.finalText = tidy(dict.text)
  out.words = countWords(out.finalText)
  return out
}
