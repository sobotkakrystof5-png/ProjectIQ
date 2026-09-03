'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { CalendarEventType } from '@/lib/types'

type CalendarEventPayload = {
  title: string
  description: string | null
  starts_at: string // ISO string
  ends_at: string   // ISO string
  event_type: CalendarEventType
}

export async function createCalendarEvent(payload: CalendarEventPayload) {
  await requireAuth()

  if (!payload.title.trim()) throw new Error('Název je povinný.')
  if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
    throw new Error('Čas konce musí být po čase začátku.')
  }

  let eventId: string
  try {
    const rows = await sql`
      INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type)
      VALUES (
        ${payload.title.trim()},
        ${payload.description?.trim() || null},
        ${payload.starts_at},
        ${payload.ends_at},
        ${payload.event_type}
      )
      RETURNING id
    `
    eventId = (rows[0] as { id: string }).id
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }

  // Zrcadlí termín i do Hovor (VIZEON) — propojeno přes lead_id/calendar_event_id.
  const leadRows = await sql`
    INSERT INTO client_leads (company_name, next_action, next_action_date, next_action_time, next_action_type, calendar_event_id)
    VALUES (
      ${payload.title.trim()},
      ${payload.description?.trim() || (payload.event_type === 'block' ? 'Blokace v kalendáři' : 'Termín z kalendáře')},
      (${payload.starts_at}::timestamptz AT TIME ZONE 'Europe/Prague')::date,
      (${payload.starts_at}::timestamptz AT TIME ZONE 'Europe/Prague')::time,
      'other',
      ${eventId}
    )
    RETURNING id
  `
  await sql`UPDATE calendar_events SET lead_id = ${(leadRows[0] as { id: string }).id} WHERE id = ${eventId}`

  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/calls')
}

export async function deleteCalendarEvent(id: string) {
  await requireAuth()
  await sql`DELETE FROM client_leads WHERE calendar_event_id = ${id}`
  await sql`DELETE FROM calendar_events WHERE id = ${id}`
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/calls')
}
