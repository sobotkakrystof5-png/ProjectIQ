import { addDays, isIsoDate, weekdayOf, weekStartOf } from './time'

// Příkaz v češtině pro ⌘K: „rezervace Tereza pátek 9:00" → rezervace pro
// Terezu na nejbližší pátek v 9:00. Žádná AI, jen pravidla — co parser
// nepozná, nechá v textu jako jméno zákazníka a uživatel to v panelu opraví.
//
// Pravidla:
// - příkaz musí obsahovat slovo rezervace / rezervovat / termín / objednat
//   (jinak jde o obyčejné hledání);
// - den: dnes, zítra, pozítří, název dne (i „v pátek", „příští středa"),
//   datum „12. 10.", „12.10.2026";
// - čas: „9:00", „14.30", „v 9", „9h";
// - služba: když text obsahuje název služby byznysu, vytáhne se zvlášť;
// - zbytek textu = jméno zákazníka (s původní velikostí písmen).

export type BookingCommand = {
  kind: 'booking'
  customer: string | null
  /** 'YYYY-MM-DD' v Praze. */
  date: string | null
  /** Minuta dne (9:00 = 540). */
  minutes: number | null
  service: string | null
}

const INTENT = new Set([
  'rezervace',
  'rezervaci',
  'rezervovat',
  'zarezervovat',
  'rezervuj',
  'zarezervuj',
  'termin',
  'objednat',
  'objednej',
  'objednavka',
])

const FILLER = new Set(['v', 've', 'na', 'od', 'u', 'pro', 's', 'se', 'a', 'o', 'cas'])

// Normalizované tvary (bez diakritiky, malými) → den v týdnu (po = 1).
const WEEKDAYS: Record<string, number> = {
  po: 1, pondeli: 1,
  ut: 2, utery: 2,
  st: 3, streda: 3, stredu: 3,
  ct: 4, ctvrtek: 4,
  pa: 5, patek: 5,
  so: 6, sobota: 6, sobotu: 6,
  ne: 7, nedele: 7, nedeli: 7,
}

const RELATIVE: Record<string, number> = { dnes: 0, zitra: 1, pozitri: 2 }
const NEXT_WEEK = new Set(['pristi', 'pristim', 'pristiho'])

export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Token = { raw: string; norm: string; used: boolean }

function tokenize(input: string): Token[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw: raw.replace(/[,;]+$/, ''), norm: normalize(raw.replace(/[,;]+$/, '')), used: false }))
    .filter((t) => t.raw.length > 0)
}

const validTime = (h: number, m: number) => h >= 0 && h <= 23 && m >= 0 && m <= 59

/** Den za `today` (včetně) v daný den týdne. */
function nextWeekday(today: string, weekday: number): string {
  const diff = (weekday - weekdayOf(today) + 7) % 7
  return addDays(today, diff)
}

function parseDayMonth(norm: string, today: string): string | null {
  const m =
    norm.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/) ?? norm.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const pad = (n: number) => String(n).padStart(2, '0')
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4))
  let iso = `${year}-${pad(month)}-${pad(day)}`
  if (!isIsoDate(iso)) return null
  // Bez roku a v minulosti → příští rok („3. 1." v prosinci).
  if (!m[3] && iso < today) {
    year += 1
    iso = `${year}-${pad(month)}-${pad(day)}`
    if (!isIsoDate(iso)) return null
  }
  return iso
}

function parseTime(norm: string): number | null {
  let m = norm.match(/^(\d{1,2}):(\d{2})(?:h)?$/)
  if (m && validTime(Number(m[1]), Number(m[2]))) return Number(m[1]) * 60 + Number(m[2])
  // „14.30" — jen když minuty nejsou měsíc (12.10 je datum)
  m = norm.match(/^(\d{1,2})\.(\d{2})$/)
  if (m && Number(m[2]) > 12 && validTime(Number(m[1]), Number(m[2]))) return Number(m[1]) * 60 + Number(m[2])
  m = norm.match(/^(\d{1,2})h$/)
  if (m && validTime(Number(m[1]), 0)) return Number(m[1]) * 60
  return null
}

export function parseCommand(
  input: string,
  options: { today: string; services?: readonly string[] },
): BookingCommand | null {
  const { today } = options
  const tokens = tokenize(input).slice(0, 20)
  const intent = tokens.find((t) => INTENT.has(t.norm))
  if (!intent) return null
  intent.used = true

  let date: string | null = null
  let minutes: number | null = null

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.used) continue
    const prev = tokens[i - 1]
    const next = tokens[i + 1]

    // „12. 10." jako dva tokeny
    if (!date && /^\d{1,2}\.$/.test(t.norm) && next && /^\d{1,2}\.(\d{4})?$/.test(next.norm)) {
      const parsed = parseDayMonth(`${t.norm}${next.norm}`, today)
      if (parsed) {
        date = parsed
        t.used = next.used = true
        continue
      }
    }

    if (!date) {
      const parsed = parseDayMonth(t.norm, today)
      if (parsed) {
        date = parsed
        t.used = true
        continue
      }
      if (t.norm in RELATIVE) {
        date = addDays(today, RELATIVE[t.norm])
        t.used = true
        continue
      }
      if (t.norm in WEEKDAYS) {
        const weekday = WEEKDAYS[t.norm]
        if (prev && NEXT_WEEK.has(prev.norm)) {
          date = addDays(weekStartOf(today), 7 + weekday - 1)
          prev.used = true
        } else {
          date = nextWeekday(today, weekday)
        }
        t.used = true
        continue
      }
    }

    if (minutes === null) {
      const parsed = parseTime(t.norm)
      if (parsed !== null) {
        minutes = parsed
        t.used = true
        continue
      }
      // „v 9", „od 14"
      if (/^\d{1,2}$/.test(t.norm) && prev && ['v', 've', 'od', 'o'].includes(prev.norm) && validTime(Number(t.norm), 0)) {
        minutes = Number(t.norm) * 60
        t.used = prev.used = true
        continue
      }
    }
  }

  let rest = tokens.filter((t) => !t.used && !FILLER.has(t.norm))

  // Služba podle názvů služeb byznysu (nejdelší shoda vyhrává).
  let service: string | null = null
  const services = [...(options.services ?? [])].sort((a, b) => b.length - a.length)
  for (const name of services) {
    const words = normalize(name).split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    for (let i = 0; i + words.length <= rest.length; i++) {
      if (words.every((w, j) => rest[i + j].norm === w)) {
        service = name
        rest = [...rest.slice(0, i), ...rest.slice(i + words.length)]
        break
      }
    }
    if (service) break
  }

  const customer = rest.map((t) => t.raw).join(' ').trim().slice(0, 80)
  return { kind: 'booking', customer: customer || null, date, minutes, service }
}
