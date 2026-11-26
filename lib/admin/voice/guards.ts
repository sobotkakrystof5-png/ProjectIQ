import {
  SELF_CORRECTION,
  countWordsCollapsingNumbers,
  isAfternoon,
  digitNumbers,
  digitParts,
  isNumberWord,
  numberTokens,
  sourceNumberValues,
  spokenNumbers,
} from './numbers'
import { countWords, fold, foldText, isFiller, words } from './text'

/**
 * ZakazIQ Voice (R-148): pojistky proti halucinacím přepisu (plán, oddíl 4).
 *
 * Whisper si na tichu, šumu nebo dozvuku vymýšlí věty z titulků („Titulky
 * vytvořil…", „Děkuji za pozornost"), zacyklí se, nebo vrátí nápovědu
 * slovníku jako přepis (G12, zjištěno ve VO00). Všechno tady jsou čisté
 * funkce; co zasáhlo, se ukládá jako kód do `voice_dictations.guards`, ne text.
 * Pojistky čištění modelem (G6–G9) jsou v `checkCleanup` na konci souboru,
 * G10 (časový limit) v cleanup.ts a G11 (denní strop) v pipeline.ts.
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
 * nutné, jinak by se „1000" slilo na „10". Čísla se neslučují nikdy: „sedm
 * sedm sedm" je začátek telefonního čísla, ne smyčka přepisu (VO07).
 */
export function collapseRepeats(text: string): { text: string; collapsed: boolean } {
  let collapsed = false
  let out = `${text.trim()} `
  for (let n = 6; n >= 1; n--) {
    const unit = `((?:[\\p{L}\\p{N}'’-]+(?![\\p{L}\\p{N}])[\\s,.;:!?…]*){${n}})`
    const re = new RegExp(`(?<![\\p{L}\\p{N}'’-])${unit}(?:\\1){2,}`, 'giu')
    out = out.replace(re, (match: string, g1: string) => {
      if (words(g1).every((w) => /^\p{N}+$/u.test(w) || isNumberWord(fold(w)))) return match
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

// --- Kontrola čištění modelem (G6–G9, VO07) --------------------------------------

/** Kódy pojistek čištění tak, jak se ukládají do `guards`. */
export const CLEANUP_GUARD = {
  /** G6: výstup začíná nebo mluví jako asistent („Jasně, tady je…"). */
  assistant: 'cleanup_assistant',
  /** G7: výstup je výrazně kratší nebo delší než přepis. */
  length: 'cleanup_length',
  /** G8: ve výstupu jsou slova, která v přepisu nezazněla (věta navíc, pozdrav, podpis). */
  novel: 'cleanup_novel',
  /** G8: otočený zápor („nechci" → „chci", „není" → „je"). */
  negation: 'cleanup_negation',
  /** G9: číslo, které v přepisu nebylo, nebo zmizelo. */
  numbers: 'cleanup_numbers',
  /** Výstup nedodržel tvar (`<text>`, zbytky značek). */
  format: 'cleanup_format',
  /** G10: čištění nestihlo časový limit. */
  timeout: 'cleanup_timeout',
  /** Model odmítl, API vrátilo chybu nebo výstup uťal strop tokenů. */
  error: 'cleanup_error',
  /** Model odpověď odmítl (stop_reason refusal). */
  refusal: 'cleanup_refusal',
  /** Výstup uťal strop tokenů — nejspíš model psal něco jiného než opis. */
  truncated: 'cleanup_truncated',
  /** Bez klíče k Claude se nečistí. */
  notConfigured: 'cleanup_not_configured',
  /** Čištění je v nastavení vypnuté. */
  off: 'cleanup_off',
  /** G11: denní strop nákladů je vyčerpaný. */
  costCap: 'cost_cap',
} as const

/** G7: kratší diktát smí čištění zkrátit víc (samoopravy „v pondělí, teda v úterý"). */
export const CLEANUP_SHORT_WORDS = 12
export const CLEANUP_MIN_RATIO_SHORT = 0.25
export const CLEANUP_MIN_RATIO = 0.5
export const CLEANUP_MAX_RATIO = 1.35
export const CLEANUP_MAX_EXTRA = 4

/** G6: začátek, kterým odpovídá asistent, ne člověk, který diktuje (porovnává se bez diakritiky). */
const ASSISTANT_OPENERS = [
  'jiste', 'samozrejme', 'rozumim', 'zde je', 'tady je', 'tady mate', 'zde mate', 'upraveny text', 'opraveny text',
  'text po uprave', 'vysledek', 'rad', 'rada', 'mohu', 'muzu vam', 'bohuzel', 'omlouvam se', 'jasne', 'dobre', 'ok',
  'prepis', 'here is', 'here s', 'sure', 'certainly', 'of course', 'i can', 'i cannot', 'i m sorry', 'sorry', 'as an ai',
]

/** G6: věty asistenta kdekoli ve výstupu. */
const ASSISTANT_PHRASES = [
  'upraveny text', 'opraveny text', 'upravena verze', 'upraveny prepis', 'jako jazykovy model', 'jako ai',
  'nemohu splnit', 'nemuzu splnit', 'nemohu vyhovet', 'nemohu pomoci', 'muzu jeste s necim', 'mohu jeste s necim',
  'here is the', 'as an ai', 'i cannot',
]

/** G8: pozdrav a podpis, které model přidává do e-mailů sám od sebe. */
const ADDED_COURTESY = [
  's pozdravem', 's pozdravy', 's uctou', 'dobry den', 'hezky den', 'mejte se', 'dekuji predem', 'predem dekuji',
  'best regards', 'kind regards',
]

/** Krátká slova, která čištění smí doplnit (předložky, spojky); do nových slov se nepočítají. */
const FUNCTION_WORDS = new Set([
  'a', 'i', 'v', 've', 'k', 'ke', 's', 'se', 'z', 'ze', 'o', 'u', 'na', 'do', 'za', 'po', 'od', 'pro', 'pri', 'je',
  'to', 'ale', 'nebo', 'jak', 'co',
])

/** Značky, které čištění píše místo slov („korun" → „Kč", „procent" → „%"). */
const FORMAT_WORDS = new Set(['kc', 'czk', 'eur', 'usd', 'h', 'hod', 'min', 'tj', 'atd', 'apod', 'napr', 'cca', 'ks', 'km', 'kg', 'mil', 'tis'])

/**
 * Jiný tvar téhož slova (pád, hovorový tvar: „cenu" → „ceny", „velkej" →
 * „velký"): společný začátek aspoň 3 písmena a nejvýš o 2 kratší než kratší
 * z obou slov, délka se liší nejvýš o 3.
 */
function sameStem(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3 || Math.abs(a.length - b.length) > 3) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 3 && i >= Math.min(a.length, b.length) - 2
}

const WORD_WITH_POS = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Slovo začíná větu (začátek textu, po tečce, otazníku, vykřičníku, dvojtečce, zalomení nebo uvozovce). */
function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index)
  return !before.trim() || /[.!?:…„“"(]\s*$/.test(before) || /\n\s*$/.test(before)
}

/** Dvojice, kde zápor nejde poznat podle předpony „ne-". */
const NEGATION_PAIRS: [string, string][] = [
  ['je', 'neni'],
  ['ano', 'ne'],
  ['jo', 'ne'],
]

/**
 * Výstup má slovo bez záporu, které přepis měl se záporem („nechci" → „chci"),
 * nebo naopak („chci" → „nechci"). Slovo, které se v přepisu vyskytuje v obou
 * podobách, se nepočítá. „nějaký" → „jaký" tím vrátí přepis taky — chyba na
 * bezpečnou stranu.
 */
function flipsNegation(src: string[], out: string[]): boolean {
  const s = new Set(src)
  const o = new Set(out)
  for (const w of o) {
    if (s.has(w)) continue
    if (w.length >= 2 && s.has(`ne${w}`)) return true
    if (w.startsWith('ne') && w.length > 4 && s.has(w.slice(2))) return true
  }
  for (const [pos, neg] of NEGATION_PAIRS) {
    if (s.has(neg) && !s.has(pos) && o.has(pos) && !o.has(neg)) return true
    if (s.has(pos) && !s.has(neg) && o.has(neg) && !o.has(pos)) return true
  }
  return false
}

const hasPhrase = (folded: string, phrase: string) => ` ${folded} `.includes(` ${phrase} `)
const startsWithPhrase = (folded: string, phrase: string) => folded === phrase || folded.startsWith(`${phrase} `)

export type CleanupVerdict = { ok: true } | { ok: false; code: (typeof CLEANUP_GUARD)[keyof typeof CLEANUP_GUARD] }

export interface CleanupCheckOptions {
  /** Styl „Přesně" (prompt pro AI): model smí jen interpunkci, nových slov se toleruje méně. */
  strict?: boolean
}

/**
 * Kontrola výstupu čištění proti přepisu (G6–G9). Model nemá poslední slovo:
 * když výstup začne odpovídat, něco přidá, vynechá nebo změní číslo, vloží se
 * přepis bez čištění. Pravidla jsou schválně na bezpečnou stranu — falešné
 * odmítnutí znamená jen neučesaný text, falešné přijetí vymyšlený text.
 *
 * `source` je text, který šel do čištění (po slovníku a výplňových slovech),
 * `allowedTerms` výrazy ze slovníku, které smí výstup obsahovat, i když v
 * přepisu nejsou.
 */
export function checkCleanup(
  source: string,
  output: string,
  allowedTerms: string[],
  options: CleanupCheckOptions = {},
): CleanupVerdict {
  const src = foldText(source)
  const out = foldText(output)

  if (/<\/?\s*(text|prepis|přepis)\s*>/i.test(output)) return { ok: false, code: CLEANUP_GUARD.format }
  // Markdown, který v přepisu nebyl (tučně, nadpis, odrážky, blok kódu) — vložil by se jako hvězdičky.
  const markdown = /```|\*\*|__|^\s{0,3}#{1,6}\s|^\s*[-*•]\s/m
  if (markdown.test(output) && !markdown.test(source)) return { ok: false, code: CLEANUP_GUARD.format }

  // G7 nejdřív prázdnota: prázdný výstup u neprázdného přepisu je vynechání všeho.
  const srcN = countWordsCollapsingNumbers(source)
  const outN = countWordsCollapsingNumbers(output)
  if (!outN) return srcN ? { ok: false, code: CLEANUP_GUARD.length } : { ok: true }

  // G6: odpověď asistenta.
  for (const op of ASSISTANT_OPENERS) {
    if (startsWithPhrase(out, op) && !startsWithPhrase(src, op)) return { ok: false, code: CLEANUP_GUARD.assistant }
  }
  for (const phrase of ASSISTANT_PHRASES) {
    if (hasPhrase(out, phrase) && !hasPhrase(src, phrase)) return { ok: false, code: CLEANUP_GUARD.assistant }
  }

  // G7: délka.
  const minRatio = srcN <= CLEANUP_SHORT_WORDS ? CLEANUP_MIN_RATIO_SHORT : CLEANUP_MIN_RATIO
  if (outN < srcN * minRatio || outN > srcN * CLEANUP_MAX_RATIO + CLEANUP_MAX_EXTRA) {
    return { ok: false, code: CLEANUP_GUARD.length }
  }

  // G8: pozdrav nebo podpis navíc.
  for (const phrase of ADDED_COURTESY) {
    if (hasPhrase(out, phrase) && !hasPhrase(src, phrase)) return { ok: false, code: CLEANUP_GUARD.novel }
  }

  // G8: nová slova. Každé slovo přepisu „platí" jednou, takže zopakovaná věta
  // se počítá jako nová. Slova ze slovníku a jiné tvary téhož slova jsou v pořádku.
  const srcWords = src.split(' ').filter(Boolean)
  const remaining = new Map<string, number>()
  for (const w of srcWords) remaining.set(w, (remaining.get(w) ?? 0) + 1)
  const terms = new Set(allowedTerms.flatMap((t) => foldText(t).split(' ')).filter(Boolean))
  let novel = 0
  let run = 0
  let content = 0
  for (const m of output.matchAll(WORD_WITH_POS)) {
    const original = m[0]
    const w = fold(original)
    if (/^\p{N}+$/u.test(w) || isNumberWord(w)) {
      run = 0
      continue
    }
    if (FUNCTION_WORDS.has(w)) continue
    content++
    const left = remaining.get(w) ?? 0
    if (left > 0) {
      remaining.set(w, left - 1)
      run = 0
      continue
    }
    if (terms.has(w) || FORMAT_WORDS.has(w) || isFiller(w)) {
      run = 0
      continue
    }
    // Jméno, které v přepisu nezaznělo („Novákovi" → „Svobodovi"), je vždy chyba.
    const capitalized = original.charAt(0) !== original.charAt(0).toLocaleLowerCase('cs')
    if (capitalized && !startsSentence(output, m.index ?? 0)) return { ok: false, code: CLEANUP_GUARD.novel }
    // Jiný tvar slova, které v přepisu je („velkej" → „velký"), ale jen poprvé.
    if (!remaining.has(w) && srcWords.some((s) => sameStem(s, w))) {
      remaining.set(w, 0)
      run = 0
      continue
    }
    novel++
    run++
    // Tři nová slova za sebou = vložená věta.
    if (run >= 3) return { ok: false, code: CLEANUP_GUARD.novel }
  }
  const allowance = options.strict ? Math.max(1, Math.ceil(content * 0.1)) : Math.max(3, Math.ceil(content * 0.2))
  if (novel > allowance) return { ok: false, code: CLEANUP_GUARD.novel }

  // G8: otočený zápor. Jedno slovo se vejde do tolerance, ale obrátí význam.
  if (flipsNegation(srcWords, out.split(' ').filter(Boolean))) return { ok: false, code: CLEANUP_GUARD.negation }

  // G9: každé číslo ve výstupu zaznělo v přepisu (číslicemi nebo slovy).
  const allowed = sourceNumberValues(source)
  for (const t of numberTokens(output)) {
    if (allowed.has(t.value)) continue
    // „15:00", „9.00" — minuty nula.
    if (/^0{2}$/.test(t.raw) && /[:.]$/.test(output.slice(0, t.index))) continue
    // „25.11" (datum bez mezer) nebo „25 000" rozdělené: stačí, když zazněly části.
    const parts = (t.raw.match(/\d+/g) ?? []).map(Number)
    if (parts.length > 1 && parts.every((p) => allowed.has(p))) continue
    return { ok: false, code: CLEANUP_GUARD.numbers }
  }
  for (const v of spokenNumbers(output)) {
    if (!allowed.has(v)) return { ok: false, code: CLEANUP_GUARD.numbers }
  }

  // G9 obráceně: číslo z přepisu nesmí zmizet — leda si ho mluvčí sám opravil.
  if (!SELF_CORRECTION.test(source)) {
    const outValues = new Set([...digitNumbers(output), ...digitParts(output), ...spokenNumbers(output)])
    const outDigits = output.replace(/\D/g, '')
    const afternoon = isAfternoon(source)
    for (const v of [...digitNumbers(source), ...spokenNumbers(source, { primaryOnly: true })]) {
      if (outValues.has(v)) continue
      // „ve tři odpoledne" → „v 15:00".
      if (afternoon && Number.isInteger(v) && v >= 1 && v <= 11 && outValues.has(v + 12)) continue
      const digitsOfV = String(v).replace(/\D/g, '')
      if (digitsOfV && outDigits.includes(digitsOfV)) continue
      return { ok: false, code: CLEANUP_GUARD.numbers }
    }
  }
  return { ok: true }
}

/** Uvozovky kolem celého výstupu, které v přepisu nebyly, pryč (model je občas přidá). */
export function stripWrappingQuotes(output: string, source: string): string {
  const t = output.trim()
  const quoted = /^["„“'»«][\s\S]*["“”'»«]$/u.test(t)
  const srcQuoted = /^["„“'»«]/u.test(source.trim())
  return quoted && !srcQuoted ? t.slice(1, -1).trim() : t
}
