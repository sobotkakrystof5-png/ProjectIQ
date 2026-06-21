import { sql } from '@/lib/db'
import { SmartCalendar } from '@/components/SmartCalendar'
import type { RawConsultation, RawDeadline, RawCalendarEvent, RawLead } from '@/components/SmartCalendar'

export const revalidate = 0

export default async function CalendarPage() {
  const [consultationRows, deadlineRows, eventRows, leadRows] = await Promise.all([
    sql`
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
      ORDER BY cs.scheduled_at
    `,
    sql`
      SELECT id, client_name, deadline
      FROM projects
      WHERE deadline IS NOT NULL
      ORDER BY deadline
    `,
    sql`
      SELECT id, title, description, starts_at, ends_at, event_type
      FROM calendar_events
      ORDER BY starts_at
    `,
    sql`
      SELECT
        id, company_name, contact_name, next_action, next_action_type,
        (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
      FROM client_leads
      WHERE next_action_date IS NOT NULL
        AND next_action_time IS NOT NULL
        AND lead_status NOT IN ('converted', 'lost')
      ORDER BY next_action_date, next_action_time
    `,
  ])

  const consultations = (consultationRows as RawConsultation[]).map(r => ({
    ...r,
    scheduled_at: new Date(r.scheduled_at).toISOString(),
  }))

  const deadlines = (deadlineRows as { id: string; client_name: string; deadline: Date | string }[]).map(r => ({
    id: r.id,
    client_name: r.client_name,
    deadline: typeof r.deadline === 'string'
      ? r.deadline.slice(0, 10)
      : r.deadline.toISOString().slice(0, 10),
  })) satisfies RawDeadline[]

  const events = (eventRows as RawCalendarEvent[]).map(r => ({
    ...r,
    starts_at: new Date(r.starts_at).toISOString(),
    ends_at: new Date(r.ends_at).toISOString(),
  }))

  const leads = (leadRows as { id: string; company_name: string; contact_name: string | null; next_action: string | null; next_action_type: string | null; action_at: Date | string }[]).map(r => ({
    id: r.id,
    company_name: r.company_name,
    contact_name: r.contact_name,
    next_action: r.next_action,
    next_action_type: r.next_action_type,
    action_at: new Date(r.action_at).toISOString(),
  })) satisfies RawLead[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Smart Kalendář</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Konzultace, plánované hovory, deadliny a vlastní události na jednom místě
        </p>
      </div>

      <SmartCalendar
        consultations={consultations}
        deadlines={deadlines}
        events={events}
        leads={leads}
      />
    </div>
  )
}
