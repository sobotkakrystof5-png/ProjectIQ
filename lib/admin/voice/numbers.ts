import { fold, words } from './text'

/**
 * ZakazIQ Voice (R-150, VO07): čísla v diktátu pro pojistku G9.
 *
 * Čištění smí napsat číslo číslicemi („dvacet pět tisíc korun" → „25 000 Kč",
 * „dvacátého pátého listopadu" → „25. 11."), ale nesmí si číslo vymyslet ani
 * změnit. Proto se z přepisu vyrobí množina čísel, která v něm zazněla
 * (číslicemi i slovy), a každé číslo ve výstupu v ní musí být. Co se nepozná
 * („tři čtvrtě na pět"), vrátí přepis bez čištění — chyba na bezpečnou stranu.
 */

const UNITS: Record<string, number> = {
  nula: 0, nuly: 0, nulou: 0,
  jedna: 1, jeden: 1, jedno: 1, jednu: 1, jedne: 1, jednoho: 1, jednomu: 1, jednom: 1, jednim: 1,
  dva: 2, dve: 2, dvou: 2, dvema: 2,
  tri: 3, trech: 3, trem: 3, tremi: 3,
  ctyri: 4, ctyr: 4, ctyrech: 4, ctyrem: 4, ctyrmi: 4,
  pet: 5, peti: 5,
  sest: 6, sesti: 6,
  sedm: 7, sedmi: 7,
  osm: 8, osmi: 8,
  devet: 9, deviti: 9,
}

const TEENS: Record<string, number> = {
  deset: 10, jedenact: 11, dvanact: 12, trinact: 13, ctrnact: 14, patnact: 15,
  sestnact: 16, sedmnact: 17, osmnact: 18, devatenact: 19,
}

const TENS: Record<string, number> = {
  dvacet: 20, tricet: 30, ctyricet: 40, padesat: 50, sedesat: 60, sedmdesat: 70, osmdesat: 80, devadesat: 90,
}

const HUNDRED = new Set(['sto', 'sta', 'set', 'ste', 'stech', 'stum', 'stovka', 'stovky'])
const THOUSAND = new Set(['tisic', 'tisice', 'tisicu', 'tisici', 'tisicem'])
const MILLION = new Set(['milion', 'miliony', 'milionu', 'milionem', 'mega'])

/** Pády číslovek („pěti", „deseti", „dvaceti"). */
function cardinal(w: string): { kind: 'unit' | 'teen' | 'ten'; value: number } | null {
  if (w in UNITS) return { kind: 'unit', value: UNITS[w] }
  const base = w.endsWith('i') ? w.slice(0, -1) : w
  if (w in TEENS) return { kind: 'teen', value: TEENS[w] }
  if (base in TEENS) return { kind: 'teen', value: TEENS[base] }
  if (w in TENS) return { kind: 'ten', value: TENS[w] }
  if (base in TENS) return { kind: 'ten', value: TENS[base] }
  return null
}

const ORDINAL_STEMS: [string, number][] = [
  ['devatenact', 19], ['osmnact', 18], ['sedmnact', 17], ['sestnact', 16], ['patnact', 15], ['ctrnact', 14],
  ['trinact', 13], ['dvanact', 12], ['jedenact', 11], ['dvacat', 20], ['tricat', 30], ['desat', 10],
  ['devat', 9], ['osm', 8], ['sedm', 7], ['sest', 6], ['pat', 5], ['ctvrt', 4], ['tret', 3], ['druh', 2], ['prvn', 1],
]
const ORDINAL_ENDINGS = new Set(['y', 'eho', 'emu', 'em', 'ym', 'ych', 'ymi', 'a', 'e', 'ou', 'i', 'iho', 'imu', 'im', 'ich', 'imi'])

function ordinal(w: string): number | null {
  for (const [stem, value] of ORDINAL_STEMS) {
    if (w.startsWith(stem) && ORDINAL_ENDINGS.has(w.slice(stem.length))) return value
  }
  return null
}

const MONTHS: Record<string, number> = {}
for (const [n, forms] of [
  [1, 'leden ledna lednu'], [2, 'unor unora unoru'], [3, 'brezen brezna breznu'], [4, 'duben dubna dubnu'],
  [5, 'kveten kvetna kvetnu'], [6, 'cerven cervna cervnu'], [7, 'cervenec cervence cervenci'],
  [8, 'srpen srpna srpnu'], [9, 'zari'], [10, 'rijen rijna rijnu'], [11, 'listopad listopadu'],
  [12, 'prosinec prosince prosinci'],
] as const) {
  for (const f of forms.split(' ')) MONTHS[f] = n
}

const AFTERNOON = new Set(['odpoledne', 'vecer', 'odpoledni', 'vecerni', 'pm'])

/** V přepisu zaznělo „odpoledne" nebo „večer" — hodiny 1–11 smí být napsané jako 13–23. */
export const isAfternoon = (text: string): boolean => words(text).some((w) => AFTERNOON.has(fold(w)))

/** Slova, po kterých si mluvčí opravuje řečené („v deset, teda v jedenáct"). */
export const SELF_CORRECTION = /(?<![\p{L}])(teda|tedy|vlastně|vlastne|pardon|oprava|promiň|promin|spíš|spis|respektive|nebo ne)(?![\p{L}])/iu

/** Číslo ve tvaru z textu (čárka i tečka jako desetinná, mezera jako oddělovač tisíců) → hodnota. */
export const toValue = (raw: string): number => Number(raw.replace(/[\s ]/g, '').replace(',', '.'))

/** Číslo z číslic; tisíce oddělené mezerou jsou jedno číslo („25 000"). */
const NUMBER_RE = /\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g

export interface NumberToken {
  raw: string
  value: number
  index: number
}

export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = []
  for (const m of text.matchAll(NUMBER_RE)) {
    const value = toValue(m[0])
    if (Number.isFinite(value)) out.push({ raw: m[0], value, index: m.index ?? 0 })
  }
  return out
}

export const digitNumbers = (text: string): number[] => numberTokens(text).map((t) => t.value)

/** Části čísel z číslic zvlášť („25 000" → 25 a 0, „15:30" → 15 a 30). */
export function digitParts(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]))
}

/** Slovo je číslovka nebo měsíc (do nových slov se nepočítá, hlídá ho G9). */
export function isNumberWord(folded: string): boolean {
  return Boolean(cardinal(folded)) || HUNDRED.has(folded) || THOUSAND.has(folded) || MILLION.has(folded) ||
    folded === 'pul' || ordinal(folded) !== null || folded in MONTHS
}

/**
 * Čísla vyslovená slovy. Skládá „dva tisíce dvacet šest" na 2026, „dvacet pět"
 * na 25, „pět set" na 500 a „jeden a půl" na 1,5. Řada samostatných číslic
 * („sedm sedm sedm jedna dva tři") dá i jejich spojení (777123), protože tak se
 * diktují telefonní čísla; `primaryOnly` spojení vynechá (čísla, která musí
 * ve výstupu zůstat).
 */
export function spokenNumbers(text: string, options: { primaryOnly?: boolean } = {}): number[] {
  const tokens = words(text).map(fold)
  const out: number[] = []
  let total = 0
  let current = 0
  let inSeq = false
  let digits: number[] = []

  const flushDigits = () => {
    if (digits.length >= 2 && !options.primaryOnly) {
      // Každý souvislý úsek řady (777, 123, 777123…), výstup ho smí rozdělit libovolně.
      for (let i = 0; i < digits.length; i++) {
        for (let j = i + 2; j <= digits.length; j++) out.push(Number(digits.slice(i, j).join('')))
      }
    }
    digits = []
  }
  const flush = () => {
    if (inSeq) out.push(total + current)
    total = 0
    current = 0
    inSeq = false
  }

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    const c = cardinal(w)
    if (c) {
      if (c.kind === 'unit') digits.push(c.value)
      else flushDigits()
      const fits =
        (c.kind === 'unit' && current % 10 === 0) || (c.kind !== 'unit' && current % 100 === 0)
      if (inSeq && !fits) flush()
      current += c.value
      inSeq = true
      continue
    }
    flushDigits()
    if (HUNDRED.has(w)) {
      current = (inSeq && current ? current : 1) * 100
      inSeq = true
      continue
    }
    if (THOUSAND.has(w) || MILLION.has(w)) {
      const mult = THOUSAND.has(w) ? 1000 : 1_000_000
      total += (inSeq && current ? current : 1) * mult
      current = 0
      inSeq = true
      continue
    }
    if (w === 'pul') {
      if (inSeq && tokens[i - 1] === 'a') current += 0.5
      else {
        flush()
        out.push(0.5)
      }
      continue
    }
    // „sto a dvacet", „jeden a půl": spojka uprostřed čísla řadu nepřeruší.
    if (w === 'a' && inSeq) {
      const next = tokens[i + 1]
      if (next && (cardinal(next) || next === 'pul')) continue
    }
    flush()
  }
  flushDigits()
  flush()
  return out
}

/** Pořadová čísla a měsíce („dvacátého pátého listopadu" → 25, 20, 5, 11). */
function datesAndOrdinals(text: string): number[] {
  const tokens = words(text).map(fold)
  const out: number[] = []
  let prevTen: number | null = null
  for (const w of tokens) {
    if (w in MONTHS) out.push(MONTHS[w])
    const o = ordinal(w)
    if (o === null) {
      prevTen = null
      continue
    }
    out.push(o)
    if (prevTen !== null && o < 10) out.push(prevTen + o)
    prevTen = o === 20 || o === 30 ? o : null
  }
  return out
}

/** Všechna čísla, která v přepisu zazněla — výstup čištění smí použít jen tato. */
export function sourceNumberValues(text: string): Set<number> {
  const values = new Set<number>([...digitNumbers(text), ...digitParts(text), ...spokenNumbers(text), ...datesAndOrdinals(text)])
  // „ve tři odpoledne" → 15:00.
  if (isAfternoon(text)) {
    for (const v of [...values]) if (Number.isInteger(v) && v >= 1 && v <= 11) values.add(v + 12)
  }
  return values
}

/**
 * Počet slov, ve kterém je číslo jedno slovo — vyslovené („dva tisíce dvacet
 * šest") i napsané s mezerou mezi tisíci („25 000"). Délka textu se tak
 * nezmění jen tím, že čištění napíše číslo číslicemi (G7).
 */
export function countWordsCollapsingNumbers(text: string): number {
  let n = 0
  let inNumber = false
  for (const w of words(text.replace(/\d{1,3}(?:[  ]\d{3})+(?:,\d+)?/g, '0')).map(fold)) {
    const isNum = Boolean(cardinal(w)) || HUNDRED.has(w) || THOUSAND.has(w) || MILLION.has(w)
    if (isNum && inNumber) continue
    inNumber = isNum
    n++
  }
  return n
}
