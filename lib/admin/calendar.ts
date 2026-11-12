import 'server-only'
import { adminDb, q } from '@/lib/admin/db'
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
  contact_phone: string | null
  contact_email: string | null
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

  const [consultationRows, deadlineRows, eventRows, leadRows] = await adminDb.batch([
    q`
      SELECT
        cs.id,
        cs.scheduled_at,
        cs.channel,
        cs.client_wish,
        cs.meeting_link,
        cs.client_email,
        p.client_name,
        p.id AS project_id
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
        l.phone AS contact_phone,
        l.email AS contact_email
      FROM calendar_events e
      LEFT JOIN client_leads l ON l.id = e.lead_id
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
  ])

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
      .map((r) => ({
        ...r,
        starts_at: iso(r.starts_at),
        ends_at: iso(r.ends_at),
      }))
      .filter((r) => !slotKeys.has(`${r.project_id}@${new Date(r.starts_at).getTime()}`)),
    leads: (leadRows as unknown as (Omit<RawLead, 'estimated_value'> & { estimated_value: string | number | null })[]).map((r) => ({
      ...r,
      // numeric přijde z Neonu jako string — do prohlížeče posíláme číslo
      estimated_value: r.estimated_value == null ? null : Number(r.estimated_value),
      action_at: iso(r.action_at),
    })),
  }
}
