import { stripControlChars } from '@/lib/security/html'
import { sourceNumberValues } from '@/lib/admin/voice/numbers'

/**
 * Kontrola návrhů ze schůzky (navrhovač nabídek N4, R-158). Čistý soubor bez
 * databáze: čtou ho server i testy.
 *
 * Model z přepisu schůzky navrhne vstupy nabídky (cenu jedné zakázky klienta,
 * web/e-shop, jazyky navíc, spěch) a rozpočet klienta, každý s citací. Model si
 * může vymyslet (B10), proto návrh projde, jen když:
 *  - citace v přepisu opravdu je (po sjednocení velikosti písmen, diakritiky
 *    ponechané, interpunkce a mezer),
 *  - částka zakázky je číslo, které v citaci zaznělo (i „60 tisíc"),
 *  - hodnota sedí na rozsah editoru.
 * Každé pole nejvýš jednou. Použije se až kliknutím (R-111).
 */

export const HINT_FIELDS = ['typical_job', 'kind', 'languages', 'rush', 'budget'] as const
export type HintField = (typeof HINT_FIELDS)[number]

export type RawHint = { field: HintField; value: string; quote: string }

export type MeetingHint =
  | { field: 'typical_job'; czk: number; quote: string }
  | { field: 'kind'; kind: 'web' | 'eshop'; quote: string }
  | { field: 'languages'; extra: number; quote: string }
  | { field: 'rush'; quote: string }
  | { field: 'budget'; text: string; quote: string }

const QUOTE_MIN = 4
const QUOTE_MAX = 300
const JOB_MIN = 100
const JOB_MAX = 10_000_000
const LANGUAGES_MAX = 3

/** Sjednocení pro hledání citace: malá písmena, bez interpunkce a vícenásobných mezer. */
export function foldForQuote(text: string): string {
  return stripControlChars(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Je citace v přepisu? Přepis má řádky „[3:07] Klient: …", ty sjednocení nevadí. */
export function quoteInTranscript(quote: string, foldedTranscript: string): boolean {
  const q = foldForQuote(quote)
  if (q.length < QUOTE_MIN) return false
  return ` ${foldedTranscript} `.includes(` ${q} `)
}

/** Zazněla v citaci částka `czk`? Počítá i „60 tisíc", „1,5 milionu" a „sto tisíc". */
export function quoteHasAmount(quote: string, czk: number): boolean {
  const values = sourceNumberValues(quote)
  if (values.has(czk)) return true
  const folded = foldForQuote(quote)
  if (/\btis/.test(folded) && values.has(czk / 1000)) return true
  if (/\bmili?on/.test(folded) && values.has(czk / 1_000_000)) return true
  return false
}

const clipQuote = (q: string): string => stripControlChars(q).replace(/\s+/g, ' ').trim().slice(0, QUOTE_MAX)

/** Převede a prověří návrhy od modelu. Co neprojde, zmizí. */
export function checkHints(raw: RawHint[], transcript: string): MeetingHint[] {
  const folded = foldForQuote(transcript)
  const seen = new Set<HintField>()
  const out: MeetingHint[] = []
  for (const h of raw) {
    if (!HINT_FIELDS.includes(h.field) || seen.has(h.field)) continue
    const quote = clipQuote(h.quote ?? '')
    if (!quoteInTranscript(quote, folded)) continue
    const value = stripControlChars(h.value ?? '').trim()

    let hint: MeetingHint | null = null
    if (h.field === 'typical_job') {
      const czk = Number(value.replace(/[^\d]/g, ''))
      if (Number.isInteger(czk) && czk >= JOB_MIN && czk <= JOB_MAX && quoteHasAmount(quote, czk)) {
        hint = { field: 'typical_job', czk, quote }
      }
    } else if (h.field === 'kind') {
      const v = value.toLowerCase().replace(/[^a-z]/g, '')
      if (v === 'web' || v === 'eshop') hint = { field: 'kind', kind: v, quote }
    } else if (h.field === 'languages') {
      const extra = Number(value)
      if (Number.isInteger(extra) && extra >= 1 && extra <= LANGUAGES_MAX) hint = { field: 'languages', extra, quote }
    } else if (h.field === 'rush') {
      if (/^(ano|yes|true)$/i.test(value)) hint = { field: 'rush', quote }
    } else if (h.field === 'budget') {
      const text = value.replace(/\s+/g, ' ').slice(0, 200)
      if (text.length >= 2) hint = { field: 'budget', text, quote }
    }
    if (hint) {
      seen.add(h.field)
      out.push(hint)
    }
  }
  return out
}
