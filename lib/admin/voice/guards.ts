import { countWords, foldText, words } from './text'

/**
 * ZakazIQ Voice (R-148): pojistky proti halucinacím přepisu (plán, oddíl 4).
 *
 * Whisper si na tichu, šumu nebo dozvuku vymýšlí věty z titulků („Titulky
 * vytvořil…", „Děkuji za pozornost"), zacyklí se, nebo vrátí nápovědu
 * slovníku jako přepis (G12, zjištěno ve VO00). Všechno tady jsou čisté
 * funkce; co zasáhlo, se ukládá jako kód do `voice_dictations.guards`, ne text.
 * Pojistky čištění modelem (G6–G11) přidá VO07.
 */

/** G1: kratší řeč než tohle se nepřepisuje. */
export const MIN_SPEECH_MS = 300

/** G2: prahy segmentu podle referenční implementace Whisperu. */
export const SEGMENT_NO_SPEECH_PROB = 0.6
export const SEGMENT_AVG_LOGPROB = -1
export const SEGMENT_COMPRESSION_RATIO = 2.4

/** G4: „alone" fráze se zahodí jen u nahrávky kratší než tohle. */
export const ALONE_MAX_SPEECH_MS = 4000

/** G5: víc slov za sekundu nahrávky člověk nevysloví (480 slov za minutu). */
export const MAX_WORDS_PER_SECOND = 8
/** G5 se nepoužije u velmi krátkých výsledků, ty by šly snadno přes práh náhodou. */
export const FAST_MIN_WORDS = 7

/** G12: ozvěnu nápovědy bereme vážně až od tolika slov. */
export const ECHO_MIN_WORDS = 3

/** Kódy pojistek tak, jak se ukládají do `guards`. */
export const GUARD = {
  noSpeech: 'no_speech',
  promptEcho: 'prompt_echo',
  segments: 'segments',
  repeat: 'repeat',
  blocklist: 'blocklist',
  tooFast: 'too_fast',
  sttFallback: 'stt_fallback',
  sttFailed: 'stt_failed',
  sttNotConfigured: 'stt_not_configured',
} as const

export interface SttSegment {
  text: string
  noSpeechProb?: number
  avgLogprob?: number
  compressionRatio?: number
}

/** G2: segment, který Whisper sám považuje za ticho, nebo se v něm točí dokola, se zahodí. */
export function filterSegments(segments: SttSegment[]): { text: string; dropped: number } {
  let dropped = 0
  const kept: string[] = []
  for (const s of segments) {
    const silent = (s.noSpeechProb ?? 0) > SEGMENT_NO_SPEECH_PROB && (s.avgLogprob ?? 0) < SEGMENT_AVG_LOGPROB
    const looping = (s.compressionRatio ?? 0) > SEGMENT_COMPRESSION_RATIO
    if (silent || looping) dropped++
    else kept.push(s.text.trim())
  }
  return { text: kept.filter(Boolean).join(' '), dropped }
}

/**
 * G3: fráze opakovaná třikrát a víckrát za sebou se sloučí („děkuji děkuji
 * děkuji"). Dvakrát se v řeči opakuje běžně, to zůstane. Hranice slov jsou
 * nutné, jinak by se „1000" slilo na „10".
 */
export function collapseRepeats(text: string): { text: string; collapsed: boolean } {
  let collapsed = false
  let out = `${text.trim()} `
  for (let n = 6; n >= 1; n--) {
    const unit = `((?:[\\p{L}\\p{N}'’-]+(?![\\p{L}\\p{N}])[\\s,.;:!?…]*){${n}})`
    const re = new RegExp(`(?<![\\p{L}\\p{N}'’-])${unit}(?:\\1){2,}`, 'giu')
    out = out.replace(re, (_m, g1: string) => {
      collapsed = true
      return g1
    })
  }
  return { text: out.replace(/\s+/g, ' ').trim(), collapsed }
}

export interface BlockPhrase {
  text: string
  /** always = vždy pryč · alone = jen když je to celý přepis krátké nahrávky */
  mode: 'always' | 'alone'
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Fráze jako regulární výraz: mezi slovy libovolná mezera a interpunkce. */
const phrasePattern = (phrase: string): string => words(phrase).map(escapeRe).join('[\\s,.;:!?…-]+')

/** G4: blokované fráze. `always` vezme i zbytek věty („Titulky vytvořil JohnyX."). */
export function applyBlocklist(text: string, phrases: BlockPhrase[], speechMs: number): { text: string; hits: string[] } {
  const hits: string[] = []
  let out = text
  for (const p of phrases) {
    if (!words(p.text).length) continue
    if (p.mode === 'always') {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${phrasePattern(p.text)}[^.!?\\n]*[.!?]?`, 'giu')
      const next = out.replace(re, '')
      if (next !== out) {
        hits.push(p.text)
        out = next
      }
    } else if (speechMs < ALONE_MAX_SPEECH_MS && foldText(out) === foldText(p.text)) {
      hits.push(p.text)
      out = ''
    }
  }
  return { text: out.replace(/\s+/g, ' ').trim(), hits }
}

/**
 * G5: víc slov, než se dá za dobu nahrávky vyslovit. Počítá se z celé délky
 * nahrávky, ne z odhadu řeči z Macu — ten může řeč podhodnotit a skutečný
 * diktát by se zahodil.
 */
export function isImplausiblyFast(wordCount: number, durationMs: number): boolean {
  if (wordCount < FAST_MIN_WORDS) return false
  if (durationMs <= 0) return true
  return wordCount / (durationMs / 1000) > MAX_WORDS_PER_SECOND
}

/**
 * G12: přepis je jen ozvěna nápovědy. Ve VO00 vrátil přepis na tichu celou
 * nápovědu („ZakazIQ, Prvotka, VIZEON, …"). Ozvěna = přepis obsahuje úvod
 * nápovědy, nebo má aspoň ECHO_MIN_WORDS slov a všechna jsou z nápovědy ve
 * stejném pořadí. Skutečná věta má i jiná slova („pro", „a", „pošle").
 */
export function echoesPrompt(text: string, prompt: string): boolean {
  if (!prompt.trim()) return false
  const said = foldText(text).split(' ').filter(Boolean)
  if (!said.length) return false
  const lead = foldText(STT_PROMPT_LEAD)
  if (lead && ` ${said.join(' ')} `.includes(` ${lead} `)) return true
  if (said.length < ECHO_MIN_WORDS) return false
  // Jen výrazy ze slovníku, bez úvodu — „v" z úvodu by jinak udělalo z „V ZakazIQ Prvotka" ozvěnu.
  const folded = foldText(prompt)
  const terms = lead && folded.startsWith(`${lead} `) ? folded.slice(lead.length + 1) : folded
  const hint = terms.split(' ').filter(Boolean)
  let i = 0
  for (const w of said) {
    while (i < hint.length && hint[i] !== w) i++
    if (i === hint.length) return false
    i++
  }
  return true
}

/** Úvod nápovědy pro přepis (`dictionary.ts` ho používá ve `buildSttPrompt`). */
export const STT_PROMPT_LEAD = 'Diktát v češtině. Výrazy:'

export { countWords }
