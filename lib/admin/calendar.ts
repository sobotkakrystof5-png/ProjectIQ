import 'server-only'
import { batchTolerant, q } from '@/lib/admin/db'
import { availabilityQuery, mapAvailability, type RawAvailability } from '@/lib/admin/availability'
import { addIsoDays, pragueWallClockToISO } from '@/lib/prague-time'
import type { DayRange } from '@/lib/admin/calendar-window'
import type { LeadStatus, ConsultationChannel, CalendarEventType } from '@/lib/types'

/**
 * Data kalendáře `/dashboard/calendar` (AD06 dávka, AD08 časové okno).
 *
 * Všechny čtyři dotazy jedou jedním požadavkem a všechny jsou omezené na
 * zobrazené okno. Dřív stahovaly celou historii: každá konzultace, každá
 * událost a každý deadline od začátku provozu šly do prohlížeče, i když
 * kalendář kreslil jeden měsíc.
 */

export type RawConsultation = {
  id: string
  scheduled_at: string
  channel: ConsultationChannel
  client_wish: string
  meeting_link: string | null
  client_email: string | null
  client_name: string
  project_id: string
  /** Délka v minutách (KP14, migrace 123). Starší rezervace hodina. */
  duration_minutes?: number | null
  /** Odkud rezervace přišla: 'odkaz' (/p), 'prostor' (/klient). */
  booked_via?: string | null
  /** Stav Google Meetu u rezervace z volna. */
  meet_status?: string | null
}

export type RawDeadline = {
  id: string
  client_name: string
  /** 'YYYY-MM-DD' */
  deadline: string
}

export type RawCalendarEvent = {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  event_type: CalendarEventType
  /** Zakázka termínu — kvůli párování s rezervacemi (AD10). */
  project_id: string | null
  /**
   * Kontakt zrcadlený v Hovorech (dvojice z migrace 051). Bez něj by z detailu
   * události nešlo zavolat, i když telefon v databázi je — okno „Přidat do
   * kalendáře" ho od AD10 ukládá.
   */
  contact_name: string | null
  /**
   * Jen jméno člověka, bez náhradního názvu firmy. Předvyplňuje se do úpravy,
   * jinak by se název události při uložení zapsal jako jméno kontaktu.
   */
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  /** Schůzka s Google Meet (R-112, migrace 115). Bez migrace null. */
  meet_url?: string | null
  invite_status?: string | null
  invite_sent_at?: string | null
  /** Kam jdou pozvánka a připomínky (R-137, migrace 128). Bez migrace null. */
  invite_to?: string | null
  meeting_phone?: string | null
  reminders_on?: string | null
  /** Co se s pozvánkou stalo podle webhooku Resendu (R-146, migrace 135). Bez migrace null. */
  invite_delivery?: string | null
  invite_delivery_at?: string | null
  invite_bounce_type?: string | null
}

export type RawLead = {
  id: string
  company_name: string
  contact_name: string | null
  next_action: string | null
  next_action_type: string | null
  phone: string | null
  email: string | null
  lead_status: LeadStatus
  estimated_value: number | null
  notes: string | null
  /** ISO okamžik (pražské datum + čas) */
  action_at: string
}

export type CalendarData = {
  consultations: RawConsultation[]
  deadlines: RawDeadline[]
  events: RawCalendarEvent[]
  leads: RawLead[]
  /** Volno pro klienty (KP14). Bez migrace 123 prázdné. */
  availability: RawAvailability[]
}

export type { RawAvailability }

/** Chybějící tabulka nebo funkce (migrace ještě neproběhla) se snese, jiná chyba ne. */
const notMissingSchema = (err: unknown) => {
  const code = (err as { code?: string })?.code
  return code !== '42P01' && code !== '42883'
}

const iso = (instant: Date | string): string =>
  typeof instant === 'string' ? instant : instant.toISOString()

const dayOnly = (value: Date | string): string =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)

const dayParts = (day: string): [number, number, number] => {
  const [y, m, d] = day.split('-').map(Number)
  return [y, m, d]
}

export async function loadCalendarWindow(range: DayRange): Promise<CalendarData> {
  // Hranice okna jsou pražské kalendářní dny. Pro `timestamptz` sloupce se
  // převedou na okamžiky už tady (správně i přes přechod zimní/letní čas),
  // aby šlo porovnávat `starts_at >= $1` — tím se použije index z migrace
  // 103. `AT TIME ZONE … ::date` v podmínce by ho zahodilo.
  const from = range.from
  const toExclusive = addIsoDays(range.to, 1)
  const fromInstant = pragueWallClockToISO(...dayParts(from), 0, 0)
  const toInstant = pragueWallClockToISO(...dayParts(toExclusive), 0, 0)

  const [consultationRows, deadlineRows, eventRows, leadRows, availabilityRows, deliveryRows] = await batchTolerant([
    q`
      SELECT
        cs.id,
        cs.scheduled_at,
        cs.channel,
        cs.client_wish,
        cs.meeting_link,
        cs.client_email,
        p.client_name,
        p.id AS project_id,
        (to_jsonb(cs) ->> 'duration_minutes')::int AS duration_minutes,
        to_jsonb(cs) ->> 'booked_via' AS booked_via,
        to_jsonb(cs) ->> 'meet_status' AS meet_status
      FROM consultation_slots cs
      JOIN projects p ON cs.project_id = p.id
      WHERE cs.scheduled_at >= ${fromInstant} AND cs.scheduled_at < ${toInstant}
      ORDER BY cs.scheduled_at
    `,
    q`
      SELECT id, client_name, deadline
      FROM projects
      WHERE deadline >= ${from}::date AND deadline < ${toExclusive}::date
      ORDER BY deadline
    `,
    q`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.ends_at, e.event_type, e.project_id,
        COALESCE(NULLIF(l.contact_name, ''), NULLIF(l.company_name, '')) AS contact_name,
        NULLIF(l.contact_name, '') AS contact_person,
        l.phone AS contact_phone,
        l.email AS contact_email,
        to_jsonb(e) ->> 'meet_url' AS meet_url,
        to_jsonb(e) ->> 'invite_status' AS invite_status,
        to_jsonb(e) ->> 'invite_sent_at' AS invite_sent_at,
        to_jsonb(e) ->> 'invite_to' AS invite_to,
        to_jsonb(e) ->> 'meeting_phone' AS meeting_phone,
        to_jsonb(e) ->> 'reminders_on' AS reminders_on
      FROM calendar_events e
      -- Dvojice z obou stran: události založené z kalendáře do 2026-11-18
      -- mají prázdné lead_id a kontakt na ně ukazuje jen přes calendar_event_id.
      LEFT JOIN LATERAL (
        SELECT cl.contact_name, cl.company_name, cl.phone, cl.email
        FROM client_leads cl
        WHERE cl.id = e.lead_id OR cl.calendar_event_id = e.id
        ORDER BY (cl.id = e.lead_id) DESC NULLS LAST
        LIMIT 1
      ) l ON true
      WHERE e.starts_at >= ${fromInstant} AND e.starts_at < ${toInstant}
      ORDER BY e.starts_at
    `,
    q`
      SELECT
        id, company_name, contact_name, next_action, next_action_type,
        phone, email, lead_status, estimated_value, notes,
        (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
      FROM client_leads
      WHERE next_action_date IS NOT NULL
        AND next_action_time IS NOT NULL
        AND next_action_date >= ${from}::date
        AND next_action_date < ${toExclusive}::date
        AND lead_status NOT IN ('converted', 'lost')
        AND calendar_event_id IS NULL
      ORDER BY next_action_date, next_action_time
    `,
    availabilityQuery(from, range.to),
    // Doručení pozvánek zvlášť: bez migrace 135 tabulka chybí a tenhle dotaz
    // vrátí prázdno, zbytek kalendáře se načte normálně. Id e-mailu přes
    // to_jsonb, ať to nespadne ani bez migrace 115.
    q`
      SELECT e.id::text AS event_id, d.status, d.event_at, d.bounce_type
      FROM calendar_events e
      JOIN email_deliveries d ON d.provider_id = to_jsonb(e) ->> 'invite_provider_id'
      WHERE e.starts_at >= ${fromInstant} AND e.starts_at < ${toInstant}
    `,
  ], notMissingSchema)

  const deliveries = new Map(
    (deliveryRows as { event_id: string; status: string; event_at: Date | string; bounce_type: string | null }[]).map(
      (d) => [d.event_id, d],
    ),
  )

  const consultations = (consultationRows as unknown as RawConsultation[]).map((r) => ({
    ...r,
    scheduled_at: iso(r.scheduled_at),
  }))

  // Rezervace z portálu má od AD10 svou kalendářní událost (migrace 105),
  // aby byla vidět i v Hovorech. V kalendáři se ale kreslí **jednou** —
  // zůstává karta konzultace, protože ví o kanálu, odkazu na schůzku i
  // zakázce. Páruje se podle zakázky a okamžiku, ne podle nového sloupce:
  // obrazovka tak funguje i na databázi, kde migrace 105 ještě neproběhla.
  const slotKeys = new Set(
    consultations.map((c) => `${c.project_id}@${new Date(c.scheduled_at).getTime()}`),
  )

  return {
    consultations,
    deadlines: (deadlineRows as unknown as RawDeadline[]).map((r) => ({
      id: r.id,
      client_name: r.client_name,
      deadline: dayOnly(r.deadline),
    })),
    events: (eventRows as unknown as RawCalendarEvent[])
      .map((r) => {
        const delivery = deliveries.get(String(r.id))
        return {
          ...r,
          starts_at: iso(r.starts_at),
          ends_at: iso(r.ends_at),
          invite_delivery: delivery?.status ?? null,
          invite_delivery_at: delivery ? iso(delivery.event_at) : null,
          invite_bounce_type: delivery?.bounce_type ?? null,
        }
      })
      .filter((r) => !slotKeys.has(`${r.project_id}@${new Date(r.starts_at).getTime()}`)),
    leads: (leadRows as unknown as (Omit<RawLead, 'estimated_value'> & { estimated_value: string | number | null })[]).map((r) => ({
      ...r,
      // numeric přijde z Neonu jako string — do prohlížeče posíláme číslo
      estimated_value: r.estimated_value == null ? null : Number(r.estimated_value),
      action_at: iso(r.action_at),
    })),
    availability: mapAvailability(availabilityRows),
  }
}
