import type { VoiceStyle } from './categories'
import {
  CLEANUP_FAIL_GUARD,
  CLEANUP_MAX_TERMS,
  CLEANUP_MIN_WORDS,
  type CleanupCaller,
  type CleanupExample,
} from './cleanup'
import { llmCostUsd, sttCostUsd } from './costs'
import { applyDictionary, buildSttPrompt, matchSnippet, type VoiceSnippet, type VoiceTerm } from './dictionary'
import {
  CLEANUP_GUARD,
  GUARD,
  MIN_SPEECH_MS,
  applyBlocklist,
  checkCleanup,
  collapseRepeats,
  echoesPrompt,
  filterSegments,
  isImplausiblyFast,
  stripWrappingQuotes,
  type BlockPhrase,
} from './guards'
import type { SttResult } from './stt'
import { applyLineCommands, changedWords, countWords, stripFillers, tidy } from './text'

/**
 * ZakazIQ Voice (R-150): cesta jednoho diktátu od nahrávky k textu (plán, oddíl 3).
 *
 *   G1 řeč? → přepis (záloha) → G12 ozvěna nápovědy → G2 segmenty → G3 opakování
 *   → G4 blokované fráze → G5 rychlost → zkratka? → slovník → „nový řádek",
 *   výplňová slova → G11 strop → čištění modelem → G6–G9 kontrola → text
 *
 * Co zahodilo nebo změnilo text, přidá kód do `guards`. Přepis i čištění se
 * předávají zvenku, takže celá cesta jde otestovat bez sítě. Když čištění
 * odmítne pojistka, selže, nestihne limit, je vypnuté nebo je vyčerpaný denní
 * strop, vrátí se přepis po slovníku se stavem `raw`.
 */

export interface CleanupConfig {
  enabled: boolean
  /** Denní strop nákladů v USD (D-V11, G11). 0 = čištění se nepoužije. */
  dailyCapUsd: number
  /** Kolik už dnes (pražský den) diktáty stály. */
  spentTodayUsd: number
  rules: string[]
  examples: CleanupExample[]
}

export interface PipelineConfig {
  terms: VoiceTerm[]
  snippets: VoiceSnippet[]
  blocklist: BlockPhrase[]
  cleanup: CleanupConfig
}

export interface PipelineInput {
  audio: Blob
  durationMs: number
  /** Řeč bez ticha podle Macu; null = Mac neměřil. */
  speechMs: number | null
  /** Styl čištění podle kategorie aplikace (`voice_settings.styles`). */
  style: VoiceStyle
}

export interface PipelineDeps {
  transcribe: (audio: Blob, prompt: string) => Promise<SttResult>
  cleanup: CleanupCaller
}

export type PipelineStatus = 'ok' | 'raw' | 'snippet' | 'empty' | 'blocked' | 'error'

export interface PipelineOutcome {
  status: PipelineStatus
  guards: string[]
  /** Přepis tak, jak přišel od poskytovatele. */
  rawText: string | null
  finalText: string
  words: number
  /** Slova, která změnilo čištění (i výplňová slova), bez náhrad slovníku. */
  wordsCorrected: number
  dictionaryFixes: number
  usedTermIds: string[]
  snippetId: string | null
  /** Žádný poskytovatel přepisu nemá klíč (route vrátí 503). */
  notConfigured: boolean
  sttProvider: string | null
  sttModel: string | null
  sttMs: number | null
  llmModel: string | null
  llmMs: number | null
  tokensIn: number | null
  tokensOut: number | null
  audioSeconds: number
  costUsd: number
  /** Čištění přeskočil denní strop (G11) — route upozorní do zvonku, jednou denně. */
  costCapHit: boolean
}

/** Krátký diktát (do 3 slov): jen velké písmeno a tečka podle stylu, bez modelu. */
export function finishShort(text: string, style: VoiceStyle): string {
  const t = tidy(text)
  if (!t) return t
  const withPeriod = (style === 'formal' || style === 'neutral') && countWords(t) >= 2 && /[\p{L}\p{N}]$/u.test(t)
  return withPeriod ? `${t}.` : t
}

export async function runPipeline(input: PipelineInput, config: PipelineConfig, deps: PipelineDeps): Promise<PipelineOutcome> {
  const out: PipelineOutcome = {
    status: 'empty',
    guards: [],
    rawText: null,
    finalText: '',
    words: 0,
    wordsCorrected: 0,
    dictionaryFixes: 0,
    usedTermIds: [],
    snippetId: null,
    notConfigured: false,
    sttProvider: null,
    sttModel: null,
    sttMs: null,
    llmModel: null,
    llmMs: null,
    tokensIn: null,
    tokensOut: null,
    audioSeconds: Math.round(input.durationMs / 10) / 100,
    costUsd: 0,
    costCapHit: false,
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

  // „nový řádek" a výplňová slova — bez modelu, vždy (i když čištění neproběhne).
  const base = stripFillers(applyLineCommands(dict.text).text).text
  if (!countWords(base)) return out

  const finish = (status: PipelineStatus, text: string) => {
    out.status = status
    out.finalText = text
    out.words = countWords(text)
    out.wordsCorrected = changedWords(dict.text, text)
    return out
  }
  const raw = (guard: string) => {
    out.guards.push(guard)
    return finish('raw', tidy(base))
  }

  // Krátký diktát („ano", „pošli to") čištění nepotřebuje.
  if (countWords(base) < CLEANUP_MIN_WORDS) return finish('ok', finishShort(base, input.style))

  const cleanup = config.cleanup
  if (!cleanup.enabled) return raw(CLEANUP_GUARD.off)

  // G11: denní strop nákladů. Přepis už je zaplacený, čištění se přeskočí.
  if (cleanup.spentTodayUsd + out.costUsd >= cleanup.dailyCapUsd) {
    out.costCapHit = true
    return raw(CLEANUP_GUARD.costCap)
  }

  const res = await deps.cleanup({
    text: base,
    style: input.style,
    terms: config.terms.slice(0, CLEANUP_MAX_TERMS).map((t) => t.term),
    rules: cleanup.rules,
    examples: cleanup.examples,
  })
  out.llmModel = res.model
  out.llmMs = res.ms
  out.tokensIn = res.tokensIn
  out.tokensOut = res.tokensOut
  out.costUsd += llmCostUsd(res.model, res.tokensIn, res.tokensOut)
  if (!res.ok) return raw(CLEANUP_FAIL_GUARD[res.reason])

  // G6–G9: výstup musí sedět na přepis, jinak se vloží přepis.
  const candidate = stripWrappingQuotes(res.text, base)
  const verdict = checkCleanup(base, candidate, config.terms.map((t) => t.term), { strict: input.style === 'exact' })
  if (!verdict.ok) return raw(verdict.code)
  return finish('ok', tidy(candidate))
}
