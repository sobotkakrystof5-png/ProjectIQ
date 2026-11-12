/**
 * Normalizace kontaktních údajů (AD09).
 *
 * Jeden člověk napsaný osmi způsoby je osm řádků, dokud se telefon a e-mail
 * nepřevedou na jeden tvar. Telefon jde do E.164 (`+420777123456`), e-mail na
 * malá písmena. Stejný tvar hlídá i databáze: CHECK na `contacts.phone` je
 * opsaný ze `ws.customers` (migrace 067).
 *
 * Soubor je **čistý a bez importů** — čte ho i `scripts/admin-contacts-backfill.mjs`,
 * který běží v Node bez překladu (type stripping), takže tu nesmí být alias `@/`
 * ani nic, co by potřebovalo bundler.
 */

/** Tvar, který uznává databáze i Workspace: `+` a 7–15 číslic. */
export const E164 = /^\+[1-9][0-9]{6,14}$/

/** Čím lidi uvozují klapku. Za první shodou už telefon nepokračuje. */
const EXTENSION = /\s*(klapka|klapku|kl\.|linka|linku|ext\.?|#|,|;|\/)/i

/** Tituly, které nejsou součástí jména (pro porovnávání, ne pro zobrazení). */
const TITLES = new Set(['ing', 'mgr', 'bc', 'mudr', 'judr', 'rndr', 'phdr', 'mba', 'msc', 'dis', 'phd', 'ph', 'd'])

/**
 * Telefon v E.164, nebo `null`, když to telefon není.
 *
 * Řeší zápisy, které se v datech opravdu vyskytují: mezery a pomlčky,
 * `00420`, staré československé `0042`, vedoucí nulu (`0777…`), devět číslic
 * bez předvolby a klapku za číslem.
 */
export function normalizePhone(raw: string | null | undefined, defaultPrefix: string = '+420'): string | null {
  if (raw === null || raw === undefined) return null
  let text = String(raw).trim()
  if (text === '') return null

  // Klapka se odřízne i v zápisu „777123456x12" — jinak by z ní vznikly další
  // číslice telefonu a číslo by sice prošlo regulárním výrazem, ale patřilo
  // by někomu jinému.
  const cut = text.search(EXTENSION)
  if (cut > 0) text = text.slice(0, cut)
  text = text.replace(/(\d)\s*[xX]\s*\d+\s*$/, '$1')

  const hasPlus = /^\s*\+/.test(text)
  const digits = text.replace(/\D/g, '')
  if (digits === '') return null

  const prefixDigits = defaultPrefix.replace(/\D/g, '')
  let candidate: string | null = null

  if (hasPlus) candidate = '+' + digits
  else if (digits.startsWith('00')) candidate = '+' + digits.slice(2)
  else if (digits.length === 9) candidate = defaultPrefix + digits
  else if (digits.length === 10 && digits.startsWith('0')) candidate = defaultPrefix + digits.slice(1)
  else if (digits.startsWith(prefixDigits) && digits.length === prefixDigits.length + 9) candidate = '+' + digits
  else if (digits.length >= 11) candidate = '+' + digits
  else return null

  // `0042` bylo Československo; dnes jsou to dvě země. Devět číslic za `+42`
  // je české číslo, jinak se nehádá a tvar se nechá, jak přišel.
  if (/^\+42[^01]/.test(candidate) && candidate.length === 12) {
    candidate = defaultPrefix + candidate.slice(3)
  }

  return E164.test(candidate) ? candidate : null
}

/** E-mail malými písmeny bez obalu, nebo `null`, když to e-mail není. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw)
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase()
  if (text === '') return null
  // Záměrně nejpřísnější možná shoda není cílem: jde o to nezanést do
  // kontaktů jméno („Jan Novák") ani poznámku místo adresy.
  return /^[^\s@,;]+@[^\s@.,;]+(\.[^\s@.,;]+)+$/.test(text) ? text : null
}

/**
 * Klíč jména na porovnávání: bez diakritiky, bez titulů, bez interpunkce,
 * malými písmeny. Nikdy se nezobrazuje — zobrazuje se `display_name`.
 */
export function nameKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const words = String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/\.+$/, ''))
    .filter((word) => word !== '' && !TITLES.has(word))
  return words.join(' ')
}

/** IČO: jen číslice. Osmimístné se doplní nulami, jinak se vrátí, jak je. */
export function normalizeIco(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits === '') return null
  return digits.length < 8 ? digits.padStart(8, '0') : digits
}

/** DIČ: velkými písmeny bez mezer (`cz 123` → `CZ123`). */
export function normalizeDic(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).replace(/\s+/g, '').toUpperCase()
  return text === '' ? null : text
}

/** Text na uložení: prázdný řetězec je v databázi `NULL`, ne `''`. */
export function trimOrNull(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  return text === '' ? null : text
}
