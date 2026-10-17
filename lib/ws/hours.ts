// Otevírací doba a směny (S13): převod mezi řádky ws.opening_hours a týdnem
// v Nastavení. Bez DB a bez 'server-only' — používá ji i formulář v prohlížeči.
//
// Řádek = jeden úsek dne (weekday 1 = pondělí … 7 = neděle). Víc úseků v jednom
// dni = přestávka. Den bez úseku = zavřeno.

export const WEEKDAY_NAMES = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'] as const
export const WEEKDAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const

/** Nejvýš tolik úseků na den (dopoledne, odpoledne, večer). */
export const MAX_RANGES_PER_DAY = 3

export type HoursRange = { opens: string; closes: string }
export type HoursRow = { weekday: number; opens: string; closes: string }
/** Týden po dnech: index 0 = pondělí. */
export type Week = HoursRange[][]

const CLOCK_RE = /^([01]?\d|2[0-4]):([0-5]\d)(?::00)?$/

/** '9:30' / '09:30:00' → 570; '24:00' → 1440; nesmysl → null. */
export function clockToMinutes(value: string): number | null {
  const m = CLOCK_RE.exec(value.trim())
  if (!m) return null
  const minutes = Number(m[1]) * 60 + Number(m[2])
  return minutes > 1440 ? null : minutes
}

/** 570 → '09:30'. */
export function minutesToClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Řádky z DB (staff_id už vyfiltrované) → týden se seřazenými úseky. */
export function rowsToWeek(rows: { weekday: number; opens: string; closes: string }[]): Week {
  const week: Week = Array.from({ length: 7 }, () => [])
  for (const r of rows) {
    if (r.weekday < 1 || r.weekday > 7) continue
    week[r.weekday - 1].push({ opens: r.opens.slice(0, 5), closes: r.closes.slice(0, 5) })
  }
  for (const day of week) day.sort((a, b) => (clockToMinutes(a.opens) ?? 0) - (clockToMinutes(b.opens) ?? 0))
  return week
}

export type WeekCheck = { ok: true; rows: HoursRow[] } | { ok: false; error: string }

/** Kontrola týdne z formuláře; vrací řádky pro DB, nebo českou hlášku s názvem dne. */
export function weekToRows(week: Week): WeekCheck {
  if (week.length !== 7) return { ok: false, error: 'Týden musí mít sedm dní.' }
  const rows: HoursRow[] = []
  for (let i = 0; i < 7; i++) {
    const day = WEEKDAY_NAMES[i]
    if (week[i].length > MAX_RANGES_PER_DAY) return { ok: false, error: `${day}: nejvýš ${MAX_RANGES_PER_DAY} úseky za den.` }
    const ranges = week[i].map((r) => ({ opens: clockToMinutes(r.opens), closes: clockToMinutes(r.closes) }))
    for (const r of ranges) {
      if (r.opens === null || r.closes === null) return { ok: false, error: `${day}: vyplňte čas od a do.` }
      if (r.closes <= r.opens) return { ok: false, error: `${day}: konec musí být později než začátek.` }
    }
    const sorted = (ranges as { opens: number; closes: number }[]).slice().sort((a, b) => a.opens - b.opens)
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j].opens < sorted[j - 1].closes) return { ok: false, error: `${day}: časy se překrývají. Přestávka musí být mezi nimi.` }
    }
    for (const r of sorted) rows.push({ weekday: i + 1, opens: minutesToClock(r.opens), closes: minutesToClock(r.closes) })
  }
  return { ok: true, rows }
}

const dayText = (ranges: HoursRange[]) => ranges.map((r) => `${r.opens.replace(/^0/, '')}–${r.closes.replace(/^0/, '')}`).join(', ')

/** Krátký popis týdne: „Po–Pá 9:00–17:00 · So 9:00–12:00“. Prázdný týden → null. */
export function summarizeWeek(week: Week): string | null {
  const parts: string[] = []
  let i = 0
  while (i < 7) {
    if (!week[i].length) { i++; continue }
    const text = dayText(week[i])
    let j = i
    while (j + 1 < 7 && week[j + 1].length && dayText(week[j + 1]) === text) j++
    parts.push(`${j > i ? `${WEEKDAY_SHORT[i]}–${WEEKDAY_SHORT[j]}` : WEEKDAY_SHORT[i]} ${text}`)
    i = j + 1
  }
  return parts.length ? parts.join(' · ') : null
}
