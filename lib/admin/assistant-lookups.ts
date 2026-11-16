import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { loadCalendarWindow } from '@/lib/admin/calendar'
import { remainingSql } from '@/lib/admin/project-payments'
import { nameCandidates } from '@/lib/admin/assistant-resolve'
import { toLikePattern } from '@/lib/admin-search'
import { stripMarkers } from '@/lib/ai/markers'
import { redactSensitive } from '@/lib/project-activity'
import { addIsoDays, isoWeekday, pragueDayOf, pragueMinutesOf } from '@/lib/prague-time'
import { LEAD_STATUS_LABELS, STATUS_LABELS, type LeadStatus, type ProjectStatus } from '@/lib/types'
import type { Lookup } from '@/lib/ai/plan-format'

/**
 * Dotazy na data pro asistenta (A4, R-111) — **jen čtení**.
 *
 * Model si řekne o jeden z pěti pevných dotazů (`lookupSchema`), tady se
 * provede a výsledek se mu vrátí jako text v `<data>`. Žádný volný SQL,
 * žádné poznámky ani popisy (tam píší klienti) — jen jména, data, částky
 * a stavy. I tak jména pocházejí z webových formulářů, proto plán sestavený
 * nad daty nic neprovede sám (`propose.ts` → `untrustedContext`).
 */

/** Nejdelší rozsah kalendáře, který jde naráz přečíst. */
const CALENDAR_MAX_DAYS = 31
/** Pracovní doba pro „kdy mám volno" — admin žádnou nastavenou nemá. */
const WORK_FROM = 8 * 60
const WORK_TO = 18 * 60
/** Délky položek kalendáře, které konec nemají. */
const CONSULTATION_MINUTES = 60
const CALL_MINUTES = 30

const WEEKDAY_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'] as const

function clean(value: unknown): string {
  if (value === null || value === undefined) return ''
  return stripMarkers(redactSensitive(String(value).trim()).text).slice(0, 160)
}

function czk(amount: unknown): string {
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(amount) || 0)} Kč`
}

function hm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAY_SHORT[isoWeekday(iso) - 1]} ${d}. ${m}. ${y}`
}

type Busy = { day: string; from: number; to: number; label: string }

/** Všechno, co v kalendáři zabírá čas — tytéž zdroje jako obrazovka Kalendář. */
async function busyItems(from: string, to: string): Promise<{ items: Busy[]; deadlines: string[] }> {
  const data = await loadCalendarWindow({ from, to })
  const items: Busy[] = []
  const span = (startIso: string, minutes: number, label: string) => {
    const start = pragueMinutesOf(startIso)
    items.push({ day: pragueDayOf(startIso), from: start, to: Math.min(start + minutes, 24 * 60), label })
  }
  for (const e of data.events) {
    const start = pragueMinutesOf(e.starts_at)
    const sameDay = pragueDayOf(e.starts_at) === pragueDayOf(e.ends_at)
    const end = sameDay ? pragueMinutesOf(e.ends_at) : 24 * 60
    const what = e.event_type === 'block' ? 'blokace' : 'událost'
    items.push({ day: pragueDayOf(e.starts_at), from: start, to: end, label: `${clean(e.title)} (${what})` })
  }
  for (const c of data.consultations) span(c.scheduled_at, CONSULTATION_MINUTES, `Konzultace: ${clean(c.client_name)}`)
  for (const l of data.leads) span(l.action_at, CALL_MINUTES, `${clean(l.next_action) || 'Hovor'}: ${clean(l.company_name)}`)
  items.sort((a, b) => (a.day === b.day ? a.from - b.from : a.day < b.day ? -1 : 1))
  const deadlines = data.deadlines.map((d) => `${dayLabel(d.deadline)} termín zakázky ${clean(d.client_name)}`)
  return { items, deadlines }
}

async function calendarLookup(l: Extract<Lookup, { kind: 'calendar' }>): Promise<string> {
  let { from, to } = l
  if (to < from) [from, to] = [to, from]
  if (to > addIsoDays(from, CALENDAR_MAX_DAYS - 1)) to = addIsoDays(from, CALENDAR_MAX_DAYS - 1)
  const { items, deadlines } = await busyItems(from, to)
  const lines = items.slice(0, 40).map((b) => `- ${dayLabel(b.day)} ${hm(b.from)}–${hm(b.to)} ${b.label}`)
  return [
    `Kalendář ${from} až ${to}: ${items.length} ${items.length === 1 ? 'položka' : 'položek'}${items.length > 40 ? ' (ukazuji prvních 40)' : ''}.`,
    ...lines,
    ...(deadlines.length ? ['Termíny zakázek:', ...deadlines.slice(0, 10).map((d) => `- ${d}`)] : []),
  ].join('\n')
}

async function freeTimeLookup(l: Extract<Lookup, { kind: 'free_time' }>): Promise<string> {
  const need = l.durationMinutes ?? 60
  const { items } = await busyItems(l.date, l.date)
  const busy = items.filter((b) => b.day === l.date).sort((a, b) => a.from - b.from)
  const gaps: string[] = []
  let cursor = WORK_FROM
  for (const b of busy) {
    if (b.from - cursor >= need) gaps.push(`${hm(cursor)}–${hm(Math.min(b.from, WORK_TO))}`)
    cursor = Math.max(cursor, b.to)
    if (cursor >= WORK_TO) break
  }
  if (WORK_TO - cursor >= need) gaps.push(`${hm(cursor)}–${hm(WORK_TO)}`)
  return `Volno ${dayLabel(l.date)} (počítám pracovní dobu 8–18, aspoň ${need} min): ${gaps.length ? gaps.join(', ') : 'nic'}. Obsazeno: ${
    busy.length ? busy.map((b) => `${hm(b.from)}–${hm(b.to)}`).join(', ') : 'nic'
  }.`
}

async function byName(hint: string, find: (pattern: string) => Promise<Record<string, unknown>[]>) {
  for (const candidate of nameCandidates(hint)) {
    const pattern = toLikePattern(candidate)
    if (!pattern) continue
    const rows = await find(pattern)
    if (rows.length) return rows
  }
  return []
}

async function projectLookup(l: Extract<Lookup, { kind: 'project' }>): Promise<string> {
  const rows = await byName(l.hint, async (pattern) => {
    const [found] = await adminDb.batch([
      {
        text: `
          SELECT p.client_name, p.service_type, p.status, p.price::float AS price, p.paid,
                 p.deadline::text AS deadline, ${remainingSql('p')}::float AS remaining
          FROM projects p
          WHERE p.client_name ILIKE $1 ESCAPE '\\'
          ORDER BY p.created_at DESC LIMIT 5
        `,
        params: [pattern],
      },
    ])
    return found as Record<string, unknown>[]
  })
  if (!rows.length) return `Zakázka „${clean(l.hint)}": nic nenalezeno.`
  return [
    `Zakázky „${clean(l.hint)}" (${rows.length}):`,
    ...rows.map((r) => {
      const status = STATUS_LABELS[r.status as ProjectStatus] ?? clean(r.status)
      const money = r.paid ? 'zaplaceno' : `zbývá doplatit ${czk(r.remaining)}`
      return `- ${clean(r.client_name)}${r.service_type ? `, ${clean(r.service_type)}` : ''} — ${status}, cena ${
        r.price ? czk(r.price) : 'nezadaná'
      }, ${money}${r.deadline ? `, termín ${r.deadline}` : ''}`
    }),
  ].join('\n')
}

async function contactLookup(l: Extract<Lookup, { kind: 'contact' }>): Promise<string> {
  const rows = await byName(
    l.hint,
    (pattern) => adminDb`
      SELECT company_name, contact_name, phone, email, lead_status,
             next_action, next_action_date::text AS next_action_date, next_action_time::text AS next_action_time
      FROM client_leads
      WHERE company_name ILIKE ${pattern} ESCAPE '\\' OR contact_name ILIKE ${pattern} ESCAPE '\\'
      ORDER BY created_at DESC LIMIT 5
    `,
  )
  if (!rows.length) return `Kontakt „${clean(l.hint)}": v Hovorech nic nenalezeno.`
  return [
    `Kontakty „${clean(l.hint)}" (${rows.length}):`,
    ...rows.map((r) => {
      const parts = [
        clean(r.company_name),
        r.contact_name ? clean(r.contact_name) : null,
        r.phone ? `tel. ${clean(r.phone)}` : null,
        r.email ? clean(r.email) : null,
        LEAD_STATUS_LABELS[r.lead_status as LeadStatus] ?? null,
        r.next_action_date
          ? `další krok ${r.next_action_date}${r.next_action_time ? ` ${String(r.next_action_time).slice(0, 5)}` : ''}${
              r.next_action ? ` (${clean(r.next_action)})` : ''
            }`
          : null,
      ]
      return `- ${parts.filter(Boolean).join(', ')}`
    }),
  ].join('\n')
}

async function unpaidLookup(): Promise<string> {
  const [invoices, projects] = await adminDb.batch([
    {
      text: `
        SELECT invoice_number, client_name, amount::float AS amount, currency, due_on::text AS due_on
        FROM invoices
        WHERE paid_on IS NULL AND cancelled_at IS NULL
        ORDER BY due_on NULLS LAST LIMIT 20
      `,
      params: [],
    },
    {
      text: `
        SELECT p.client_name, p.status, ${remainingSql('p')}::float AS remaining
        FROM projects p
        WHERE p.paid = false AND p.status <> 'new' AND ${remainingSql('p')} > 0
        ORDER BY remaining DESC LIMIT 15
      `,
      params: [],
    },
  ])
  const inv = invoices as Record<string, unknown>[]
  const proj = projects as Record<string, unknown>[]
  return [
    `Nezaplacené faktury (${inv.length}):`,
    ...inv.map(
      (r) =>
        `- ${clean(r.invoice_number)} ${clean(r.client_name)}: ${
          r.currency === 'CZK' || !r.currency ? czk(r.amount) : `${r.amount} ${clean(r.currency)}`
        }${r.due_on ? `, splatnost ${r.due_on}` : ''}`,
    ),
    `Zakázky s nedoplacenou částkou (${proj.length}):`,
    ...proj.map((r) => `- ${clean(r.client_name)} (${STATUS_LABELS[r.status as ProjectStatus] ?? clean(r.status)}): ${czk(r.remaining)}`),
  ].join('\n')
}

async function runOne(lookup: Lookup): Promise<string> {
  switch (lookup.kind) {
    case 'calendar':
      return calendarLookup(lookup)
    case 'free_time':
      return freeTimeLookup(lookup)
    case 'project':
      return projectLookup(lookup)
    case 'contact':
      return contactLookup(lookup)
    case 'unpaid':
      return unpaidLookup()
  }
}

/** Provede dotazy a vrátí je jako jeden blok `<data>`. Chyba jednoho dotazu nezastaví ostatní. */
export async function runLookups(lookups: Lookup[]): Promise<string> {
  const parts: string[] = []
  for (const lookup of lookups) {
    try {
      parts.push(await runOne(lookup))
    } catch (err) {
      console.error('[asistent] dotaz na data selhal:', lookup.kind, err instanceof Error ? err.name : 'unknown')
      parts.push(`Dotaz „${lookup.kind}" se nepodařil.`)
    }
  }
  return `<data>\n${parts.join('\n\n')}\n</data>`
}
