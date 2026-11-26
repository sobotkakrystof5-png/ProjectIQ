import { STT_PROMPT_LEAD } from './guards'
import { fold, foldText, words } from './text'

/**
 * ZakazIQ Voice (R-150): slovník a zkratky.
 *
 * Slovník dělá tři věci, všechny bez jazykového modelu:
 * 1. nápověda pro přepis řeči (Whisper dostane seznam jmen a výrazů),
 * 2. náhrada podle „jak to přepis slyší“ („zakáz ajkjů“ → „ZakazIQ“),
 * 3. srovnání velkých písmen u výrazů, které je mají (zakaziq → ZakazIQ).
 * Zkratka (snippet) nahradí celý diktát připraveným textem.
 */

export interface VoiceTerm {
  id: string
  term: string
  heardAs: string[]
}

export interface VoiceSnippet {
  id: string
  trigger: string
  expansion: string
}

/**
 * Nápověda pro Whisper má u Groq strop 224 tokenů (ověřeno 2026-11-25). Čeština
 * s diakritikou a jmény vychází zhruba na 2–3 znaky na token, takže 450 znaků je
 * pod stropem s rezervou (plán počítal se 600, to by strop mohlo přetéct).
 */
export const STT_PROMPT_MAX_CHARS = 450

/**
 * Whisper bere nápovědu jako „předchozí text“, ne jako pokyn. Krátká věta se
 * seznamem výrazů funguje líp než holý seznam. Pořadí = důležitost (nejvíc
 * používané první), co se nevejde, odpadne.
 */
export function buildSttPrompt(terms: VoiceTerm[]): string {
  const head = `${STT_PROMPT_LEAD} `
  let out = head
  for (const t of terms) {
    const next = `${out === head ? '' : ', '}${t.term}`
    if (out.length + next.length + 1 > STT_PROMPT_MAX_CHARS) break
    out += next
  }
  return out === head ? '' : `${out}.`
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Česká písmena s diakritikou podle základního písmene (porovnání bez diakritiky). */
const VARIANTS: Record<string, string> = {
  a: 'aáä', c: 'cč', d: 'dď', e: 'eéěë', i: 'ií', n: 'nň', o: 'oóö', r: 'rř', s: 'sš', t: 'tť', u: 'uúůü', y: 'yý', z: 'zž',
}

/** Slovo jako regulární výraz, který sedí i bez diakritiky („zakaz" najde „zákaz" a naopak). */
const loose = (word: string): string =>
  [...word]
    .map((ch) => {
      const variants = VARIANTS[fold(ch)]
      return variants ? `[${variants}]` : escapeRe(ch)
    })
    .join('')
const boundary = (inner: string) => `(?<![\\p{L}\\p{N}])${inner}(?![\\p{L}\\p{N}])`
const hasCapitals = (term: string) => term !== term.toLocaleLowerCase('cs')

/**
 * Nahradí slyšené varianty správným tvarem. Vrací počet náhrad a id výrazů,
 * které se použily (kvůli řazení nápovědy podle používání).
 */
export function applyDictionary(text: string, terms: VoiceTerm[]): { text: string; fixes: number; usedIds: string[] } {
  let out = text
  let fixes = 0
  const used = new Set<string>()
  // Delší varianty dřív, aby „zakáz ajkjů“ nevyhrálo nad „zakáz ajkjů workspace“.
  const variants = terms
    .flatMap((t) => t.heardAs.map((h) => ({ id: t.id, heard: h.trim(), term: t.term })))
    .filter((v) => v.heard && fold(v.heard) !== fold(v.term))
    .sort((a, b) => b.heard.length - a.heard.length)

  for (const v of variants) {
    const parts = words(v.heard).map(loose)
    if (!parts.length) continue
    const re = new RegExp(boundary(parts.join('[\\s-]+')), 'giu')
    out = out.replace(re, () => {
      fixes++
      used.add(v.id)
      return v.term
    })
  }

  // Výraz s velkými písmeny napsaný jinak („zakaziq“, „Zakaziq“) → správný tvar.
  for (const t of terms) {
    if (!hasCapitals(t.term)) continue
    const parts = words(t.term).map(loose)
    if (!parts.length) continue
    const re = new RegExp(boundary(parts.join('[\\s-]+')), 'giu')
    out = out.replace(re, (match) => {
      if (match === t.term) return match
      fixes++
      used.add(t.id)
      return t.term
    })
  }
  return { text: out, fixes, usedIds: [...used] }
}

/** Celý diktát je spouštěcí fráze zkratky („můj podpis“) → její text. */
export function matchSnippet(text: string, snippets: VoiceSnippet[]): VoiceSnippet | null {
  const said = foldText(text)
  if (!said) return null
  return snippets.find((s) => foldText(s.trigger) === said) ?? null
}

/** Všechny výrazy, které smí čištění napsat, i když v přepisu nejsou. */
export function allowedTermsOf(terms: VoiceTerm[], snippets: VoiceSnippet[]): string[] {
  return [...terms.map((t) => t.term), ...snippets.map((s) => s.trigger)]
}
