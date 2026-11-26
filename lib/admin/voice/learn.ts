import { fold, foldText, words } from './text'

/**
 * ZakazIQ Voice (R-150, VO08): učení z oprav po vložení — čisté funkce bez DB.
 *
 * Mac pošle, jak vložený úsek vypadá chvíli po vložení (`POST /feedback`).
 * Rozdíl po slovech (nejdelší společná posloupnost) dá dvojice „slyšel →
 * opravil" o 1–3 slovech; z nich se staví slovník (plán, oddíl 5):
 *
 * - jen interpunkce se nepočítá (slova se porovnávají bez ní), velká písmena ano,
 * - přepsáno víc než polovina slov = nový text, ne oprava → neučit,
 * - celý text smazaný = signál pro blokovanou frázi,
 * - velké písmeno na začátku věty je pravopis, ne pojem → nepočítá se.
 */

export const MAX_PAIR_WORDS = 3
/** Nad tolik změněných slov z vloženého textu je to přepsaný text, ne oprava. */
export const REWRITE_SHARE = 0.5
/** Strop tabulky rozdílu (slova × slova); delší úsek se bere jako přepsaný. */
const MAX_CELLS = 400_000

export interface CorrectionPair {
  heard: string
  fixed: string
}

export type FeedbackDiff =
  /** Opravy po slovech; `userEdits` = kolik slov se změnilo (jako `changedWords`). */
  | { kind: 'pairs'; pairs: CorrectionPair[]; userEdits: number }
  /** Beze změny (nebo jen interpunkce). */
  | { kind: 'same'; pairs: []; userEdits: 0 }
  /** Celý text smazaný — z toho se staví návrh blokované fráze. */
  | { kind: 'deleted'; pairs: []; userEdits: number }
  /** Víc než polovina slov jinak — nový text, neučí se. */
  | { kind: 'rewrite'; pairs: []; userEdits: number }

type Token = { word: string; start: number }

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

function tokens(text: string): Token[] {
  return [...text.matchAll(WORD_RE)].map((m) => ({ word: m[0], start: m.index ?? 0 }))
}

/** Slovo stojí na začátku věty (začátek textu, nebo za . ? ! …). */
function startsSentence(text: string, start: number): boolean {
  const before = text.slice(0, start).trimEnd()
  return before === '' || /[.?!…:]$/u.test(before)
}

const capitalized = (w: string) => w.charAt(0).toLocaleUpperCase('cs') + w.slice(1)

/** Jen velké písmeno na začátku věty („dobrý" → „Dobrý"). Pravopis, ne pojem. */
function isSentenceCase(heard: string, fixed: string, fixedAtSentenceStart: boolean): boolean {
  return fixedAtSentenceStart && heard !== fixed && capitalized(heard) === fixed
}

/**
 * Rozdíl vloženého a opraveného textu po slovech. Společný začátek a konec
 * se nejdřív odříznou (oprava bývá na jednom místě), na zbytek jde LCS.
 */
export function diffFeedback(inserted: string, edited: string): FeedbackDiff {
  const a = tokens(inserted)
  const b = tokens(edited)
  if (!a.length && !b.length) return { kind: 'same', pairs: [], userEdits: 0 }
  if (!b.length) return { kind: 'deleted', pairs: [], userEdits: a.length }

  let head = 0
  while (head < a.length && head < b.length && a[head].word === b[head].word) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail].word === b[b.length - 1 - tail].word) tail++
  const A = a.slice(head, a.length - tail)
  const B = b.slice(head, b.length - tail)
  if (!A.length && !B.length) return { kind: 'same', pairs: [], userEdits: 0 }

  const n = A.length
  const m = B.length
  if (n * m > MAX_CELLS) return { kind: 'rewrite', pairs: [], userEdits: Math.max(n, m) }

  // Tabulka LCS (od konce, ať jde zpětný průchod popředu).
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i].word === B[j].word ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const common = lcs[0][0]
  const userEdits = Math.max(n - common, m - common)
  if (userEdits / a.length > REWRITE_SHARE) return { kind: 'rewrite', pairs: [], userEdits }

  // Úseky mezi shodnými slovy: (co bylo, co je teď). Jen náhrada je oprava přepisu;
  // samotné přidání nebo smazání slova je úprava textu.
  const pairs: CorrectionPair[] = []
  let i = 0
  let j = 0
  let del: Token[] = []
  let ins: Token[] = []
  const flush = () => {
    if (del.length && ins.length && del.length <= MAX_PAIR_WORDS && ins.length <= MAX_PAIR_WORDS) {
      const heard = del.map((t) => t.word).join(' ')
      const fixed = ins.map((t) => t.word).join(' ')
      if (!isSentenceCase(heard, fixed, startsSentence(edited, ins[0].start))) pairs.push({ heard, fixed })
    }
    del = []
    ins = []
  }
  while (i < n || j < m) {
    if (i < n && j < m && A[i].word === B[j].word) {
      flush()
      i++
      j++
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ins.push(B[j++])
    } else {
      del.push(A[i++])
    }
  }
  flush()
  return { kind: 'pairs', pairs, userEdits }
}

// --- Co se z dvojice naučí -----------------------------------------------------

/** Levenshtein nad složeným tvarem (bez diakritiky, malými) → 0..1. */
export function similarity(a: string, b: string): number {
  const x = foldText(a)
  const y = foldText(b)
  if (!x.length && !y.length) return 1
  let prev = Array.from({ length: y.length + 1 }, (_, k) => k)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length)
}

export const TERM_SIMILARITY = 0.6

/**
 * Vypadá oprava jako jméno nebo pojem (ne jako styl)? Velké písmeno, číslice
 * uvnitř slova, nebo podobně znějící slovo („vizion" → „Vizeon"). Když se liší
 * jen diakritikou nebo velikostí písmen, smysl má jen oprava na velká písmena
 * („zakaziq" → „ZakazIQ") — „nevim" → „nevím" je pravopis, slovník ho neumí.
 */
export function looksLikeTerm(heard: string, fixed: string): boolean {
  const w = words(fixed)
  if (!w.length || fixed.trim().length < 2 || w.length > MAX_PAIR_WORDS || words(heard).length > MAX_PAIR_WORDS) return false
  const capitals = /\p{Lu}/u.test(fixed)
  if (foldText(heard) === foldText(fixed)) return capitals && heard !== fixed
  const digitInside = w.some((x) => /\p{L}/u.test(x) && /\p{N}/u.test(x))
  return capitals || digitInside || similarity(heard, fixed) >= TERM_SIMILARITY
}

export const termDedupeKey = (heard: string, fixed: string): string => `term:${foldText(heard)}→${fixed.trim()}`.slice(0, 300)
export const blockDedupeKey = (phrase: string): string => `block:${foldText(phrase)}`.slice(0, 300)
export const ruleDedupeKey = (text: string): string => `rule:${foldText(text)}`.slice(0, 300)

/** Varianta „jak to slyší" do slovníku: prázdná, když se liší jen velikostí písmen. */
export const heardVariant = (heard: string, fixed: string): string[] => (fold(heard) === fold(fixed) ? [] : [heard.trim()])
