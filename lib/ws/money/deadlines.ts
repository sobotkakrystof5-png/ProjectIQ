/**
 * Daňové termíny — pevný roční kalendář, ne feed.
 *
 * Termíny se neškrábou z webu a neplní cronem: plynou ze zákona a jsou
 * každý rok stejné. Mění se jen tím, na jaký den v týdnu vyjdou.
 *
 * Zdaňovací období je rok `taxYear`, ale **podává se v roce následujícím** —
 * všechna data níže proto padnou do `taxYear + 1`.
 */

export type TaxFilingRoute = 'paper' | 'electronic' | 'advisor'

export type TaxAuthority = 'financni_sprava' | 'cssz' | 'zdravotni_pojistovna'

export const TAX_AUTHORITY_LABELS: Record<TaxAuthority, string> = {
  financni_sprava: 'Finanční úřad',
  cssz: 'ČSSZ',
  zdravotni_pojistovna: 'Zdravotní pojišťovna',
}

export const TAX_FILING_ROUTE_LABELS: Record<TaxFilingRoute, string> = {
  paper: 'Papírově',
  electronic: 'Elektronicky',
  advisor: 'S daňovým poradcem',
}

export interface TaxDeadline {
  id: string
  title: string
  description: string
  /** YYYY-MM-DD — už posunuto na nejbližší pracovní den */
  date: string
  /** Zákonné datum před posunem; shodné s `date`, když se neposouvalo */
  statutoryDate: string
  /** true = zákonné datum padlo na víkend nebo svátek a termín se posunul */
  shifted: boolean
  authority: TaxAuthority
  sourceUrl: string
}

// ─── Pracovní dny a české svátky ──────────────────────────────────────────────

/**
 * Velikonoční neděle podle anonymního gregoriánského algoritmu.
 *
 * Potřebná kvůli Velkému pátku a Velikonočnímu pondělí — oba jsou státní
 * svátky a oba můžou padnout na začátek dubna, tedy přímo na lhůtu pro
 * papírové přiznání.
 */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Pevné státní svátky ČR (měsíc, den) — pohyblivé velikonoční přidává `czechHolidays`. */
const FIXED_HOLIDAYS: [number, number][] = [
  [1, 1],   // Nový rok / Den obnovy samostatného českého státu
  [5, 1],   // Svátek práce
  [5, 8],   // Den vítězství
  [7, 5],   // Cyril a Metoděj
  [7, 6],   // Jan Hus
  [9, 28],  // Den české státnosti
  [10, 28], // Vznik samostatného Československa
  [11, 17], // Den boje za svobodu a demokracii
  [12, 24], [12, 25], [12, 26],
]

export function czechHolidays(year: number): Set<string> {
  const days = new Set(FIXED_HOLIDAYS.map(([m, d]) => iso(year, m, d)))

  const easter = Date.UTC(year, easterSunday(year).month - 1, easterSunday(year).day)
  const dayMs = 86_400_000
  for (const offset of [-2, 1]) {  // Velký pátek, Velikonoční pondělí
    const d = new Date(easter + offset * dayMs)
    days.add(iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))
  }

  return days
}

/**
 * Posune datum na nejbližší následující pracovní den.
 *
 * § 33 odst. 4 daňového řádu: padne-li poslední den lhůty na sobotu, neděli
 * nebo svátek, je posledním dnem lhůty nejblíže následující pracovní den.
 * Bez toho by blok hlásil termín na den, kdy podatelna nefunguje.
 */
export function nextBusinessDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  let cursor = new Date(Date.UTC(y, m - 1, d))
  let holidays = czechHolidays(cursor.getUTCFullYear())

  for (let guard = 0; guard < 14; guard++) {
    const current = iso(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())
    const dow = cursor.getUTCDay()

    if (dow !== 0 && dow !== 6 && !holidays.has(current)) return current

    cursor = new Date(cursor.getTime() + 86_400_000)
    // Posun přes Silvestr (např. 31. 12. → 1. 1.) mění sadu svátků.
    if (cursor.getUTCFullYear() !== y) holidays = czechHolidays(cursor.getUTCFullYear())
  }

  return isoDate
}

// ─── Termíny ──────────────────────────────────────────────────────────────────

/** Lhůta pro podání přiznání podle způsobu podání — zákonné datum, před posunem. */
const RETURN_STATUTORY_MONTH: Record<TaxFilingRoute, number> = {
  paper: 4,        // 3 měsíce po konci zdaňovacího období
  electronic: 5,   // 4 měsíce — prodloužení za elektronické podání
  advisor: 7,      // 6 měsíců — plná moc poradce uplatněná včas
}

const SOURCES = {
  financni_sprava: 'https://financnisprava.gov.cz/cs/dane/danovy-kalendar',
  cssz: 'https://www.cssz.gov.cz/prehled-o-prijmech-a-vydajich-osvc',
  zdravotni_pojistovna: 'https://www.vzp.cz/platci/informace/osvc/prehled-o-prijmech-a-vydajich',
} as const

function build(
  id: string,
  statutory: string,
  fields: Omit<TaxDeadline, 'id' | 'date' | 'statutoryDate' | 'shifted' | 'sourceUrl'> & { authority: TaxAuthority },
): TaxDeadline {
  const date = nextBusinessDay(statutory)
  return {
    id,
    ...fields,
    date,
    statutoryDate: statutory,
    shifted: date !== statutory,
    sourceUrl: SOURCES[fields.authority],
  }
}

/**
 * Termíny za zdaňovací období `taxYear`, podávané v roce `taxYear + 1`.
 *
 * Přehledy pro ČSSZ i zdravotní pojišťovnu se odvozují od lhůty přiznání
 * (**měsíc po ní**), ne z pevného data — volba způsobu podání je proto
 * posune všechny tři najednou. Zadrátovat „2. května" by při elektronickém
 * podání lhalo o měsíc.
 */
export function getTaxDeadlines(taxYear: number, route: TaxFilingRoute = 'electronic'): TaxDeadline[] {
  const filingYear = taxYear + 1
  const returnMonth = RETURN_STATUTORY_MONTH[route]
  const returnStatutory = iso(filingYear, returnMonth, 1)
  const routeLabel = TAX_FILING_ROUTE_LABELS[route].toLowerCase()

  // Měsíc po lhůtě přiznání. Všechny lhůty padají na 1. dne v měsíci,
  // takže posun o měsíc je prosté +1 bez přetečení do dalšího roku.
  const overviewStatutory = iso(filingYear, returnMonth + 1, 1)

  return [
    build('income_tax_return', returnStatutory, {
      title: `Přiznání k dani z příjmů za ${taxYear}`,
      description: `Podání ${routeLabel}. Ve stejný den je splatný i doplatek daně.`,
      authority: 'financni_sprava',
    }),
    build('social_overview', overviewStatutory, {
      title: `Přehled o příjmech a výdajích OSVČ — ČSSZ za ${taxYear}`,
      description: 'Do jednoho měsíce po uplynutí lhůty pro podání přiznání. Podává se i při vedlejší činnosti, i když sociální nevyjde.',
      authority: 'cssz',
    }),
    build('health_overview', overviewStatutory, {
      title: `Přehled o příjmech a výdajích OSVČ — zdravotní pojišťovna za ${taxYear}`,
      description: 'Do jednoho měsíce po dni, kdy mělo být podáno přiznání. Nedoplatek pojistného je splatný do 8 dnů od podání přehledu.',
      authority: 'zdravotni_pojistovna',
    }),
  ]
}

/**
 * Kolik dní zbývá do termínu. Záporné číslo = termín už je po lhůtě.
 * Obě data jsou `YYYY-MM-DD` v Praze, takže se počítá v celých dnech
 * a odpadá timezone aritmetika.
 */
export function daysUntil(deadlineIso: string, todayIso: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(deadlineIso) - toUtc(todayIso)) / 86_400_000)
}

/**
 * Nejbližší nesplněné termíny napříč roky.
 *
 * Bere období `taxYear` i to předchozí — v lednu až dubnu je aktuální
 * termín ten za loňský rok, a ten by z kalendáře jinak zmizel dřív,
 * než se stihne splnit.
 */
export function getUpcomingTaxDeadlines(
  todayIso: string,
  route: TaxFilingRoute = 'electronic',
): TaxDeadline[] {
  const year = Number(todayIso.slice(0, 4))

  return [...getTaxDeadlines(year - 2, route), ...getTaxDeadlines(year - 1, route), ...getTaxDeadlines(year, route)]
    .filter(d => daysUntil(d.date, todayIso) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
}
