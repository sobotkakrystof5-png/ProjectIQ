import { addIsoDays, isoToPragueDateAndTime, isoWeekday as jsWeekday } from '@/lib/prague-time'
import type { Action } from '@/lib/ai/suggestion-schema'

/**
 * Pojem o čase pro asistenta (R-113).
 *
 * Dřív model dostal jen „Dnes je čtvrtek 2026-11-19." — nevěděl, kolik je
 * hodin, takže „za hodinu", „dnes odpoledne" nebo „ve tři" počítal naslepo
 * a klidně zapsal termín, který už proběhl. Teď dostane přesné „teď"
 * v pražském čase a převodní tabulku dnů na dva týdny (den v týdnu → datum),
 * aby „příští středu" nepočítal z hlavy.
 *
 * `pastActions` je pojistka nad tím: termín nebo další krok v minulosti se
 * neprovede sám — buď je to omyl („ve tři" řečené v pět), nebo zpětný zápis,
 * a ten ať člověk potvrdí klepnutím.
 *
 * Soubor je čistý (bez databáze), čas dostává zvenku, aby šel testovat.
 */

const WEEKDAYS = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'] as const
const WEEKDAYS_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'] as const

export type PragueNow = { date: string; time: string }

/** Den v týdnu 1 = pondělí … 7 = neděle (`lib/prague-time` vrací JS styl 0 = neděle). */
function isoWeekday(iso: string): number {
  return ((jsWeekday(iso) + 6) % 7) + 1
}

/** Pražské „teď" z okamžiku, čas jako HH:MM. */
export function pragueNow(instant: Date = new Date()): PragueNow {
  const { date, time } = isoToPragueDateAndTime(instant.toISOString())
  return { date, time: time.slice(0, 5) }
}

function czDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}. ${m}. ${y}`
}

/** Část dne podle hodiny — model podle ní pozná, co „dnes" ještě jde. */
function partOfDay(time: string): string {
  const hour = Number(time.slice(0, 2))
  if (hour < 5) return 'noc'
  if (hour < 9) return 'ráno'
  if (hour < 12) return 'dopoledne'
  if (hour < 13) return 'poledne'
  if (hour < 18) return 'odpoledne'
  if (hour < 22) return 'večer'
  return 'noc'
}

/**
 * „Za hodinu" a spol. spočítané předem, zaokrouhlené nahoru na 5 minut.
 * Model počítá s časem nespolehlivě (živě: „za hodinu" v 19:50 → 20:45),
 * takže dostane hotová čísla.
 */
export function relativeTimes(now: PragueNow): string {
  const [h, m] = now.time.split(':').map(Number)
  const base = h * 60 + m
  const steps: [string, number][] = [
    ['za 15 minut', 15],
    ['za půl hodiny', 30],
    ['za hodinu', 60],
    ['za dvě hodiny', 120],
    ['za tři hodiny', 180],
  ]
  return steps
    .map(([label, add]) => {
      const total = Math.ceil((base + add) / 5) * 5
      const dayShift = Math.floor(total / 1440)
      const minutes = total % 1440
      const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      return `${label} = ${dayShift > 0 ? `${addIsoDays(now.date, dayShift)} ` : ''}${hhmm}`
    })
    .join(' · ')
}

/**
 * Blok `<cas>` do zprávy pro model: kolik je teď, jaký je den a tabulka
 * dnů na 14 dní dopředu i s tím, kde začíná příští týden.
 */
export function timeContext(now: PragueNow): string {
  const weekday = isoWeekday(now.date) // 1 = pondělí
  const days: string[] = []
  for (let i = 0; i < 14; i++) {
    const iso = addIsoDays(now.date, i)
    const label = i === 0 ? 'dnes' : i === 1 ? 'zítra' : i === 2 ? 'pozítří' : WEEKDAYS_SHORT[isoWeekday(iso) - 1]
    days.push(`${label} ${WEEKDAYS_SHORT[isoWeekday(iso) - 1]} ${iso}`)
  }
  const nextMonday = addIsoDays(now.date, 8 - weekday)
  return [
    '<cas>',
    `Teď je ${WEEKDAYS[weekday - 1]} ${czDate(now.date)}, ${now.time} (${partOfDay(now.time)}, pražský čas). Dnešní datum: ${now.date}.`,
    `Tento týden končí neděli ${addIsoDays(nextMonday, -1)}; příští týden začíná pondělím ${nextMonday}.`,
    `Dny: ${days.join(' · ')}`,
    `Od teď: ${relativeTimes(now)}`,
    '</cas>',
  ].join('\n')
}

/** Je den + čas před „teď"? Bez času se počítá konec dne (dnešek tedy ještě ne). */
function isPast(date: string | null, time: string | null, now: PragueNow): boolean {
  if (!date) return false
  if (date !== now.date) return date < now.date
  return time !== null && time < now.time
}

/**
 * Akce plánu, které míří do minulosti, česky pro člověka. Termín
 * v minulosti není chyba (zpětný zápis), ale nesmí proběhnout sám.
 */
export function pastActions(actions: Action[], now: PragueNow): string[] {
  const out: string[] = []
  for (const a of actions) {
    if (a.kind === 'schedule_event' && isPast(a.date, a.time, now)) {
      out.push(`Termín ${czDate(a.date!)} v ${a.time} už proběhl.`)
    } else if (a.kind === 'move_event' && a.date && isPast(a.date, a.time, now)) {
      out.push(`Nový čas termínu (${czDate(a.date)}${a.time ? ` v ${a.time}` : ''}) už proběhl.`)
    } else if (a.kind === 'update_contact' && isPast(a.nextActionDate, a.nextActionTime, now)) {
      out.push(`Další krok ${czDate(a.nextActionDate!)}${a.nextActionTime ? ` v ${a.nextActionTime}` : ''} už proběhl.`)
    }
  }
  return out
}
