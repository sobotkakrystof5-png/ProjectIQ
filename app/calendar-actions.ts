'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { isoToPragueDateAndTime } from '@/lib/prague-time'
import type { Business } from '@/lib/business'
import type { CalendarEventType } from '@/lib/types'

type CalendarEventPayload = {
  title: string
  description: string | null
  starts_at: string // ISO string
  ends_at: string   // ISO string
  event_type: CalendarEventType
}

export async function createCalendarEvent(payload: CalendarEventPayload, business: Business = 'vizeon') {
  await requireAuth()

  if (!payload.title.trim()) throw new Error('Název je povinný.')
  if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
    throw new Error('Čas konce musí být po čase začátku.')
  }

  const title = payload.title.trim()
  const description = payload.description?.trim() || null

  // Hovory (client_leads) existují jen ve VIZEONu a blokace jsou soukromé
  // (dovolená, nedostupnost) — nemá smysl je zrcadlit jako kontakt k obvolání.
  const mirrorToLeads = business === 'vizeon' && payload.event_type !== 'block'

  try {
    if (mirrorToLeads) {
      const { date, time } = isoToPragueDateAndTime(payload.starts_at)
      // Jeden atomický příkaz místo tří samostatných zápisů bez rollbacku —
      // založení kalendářní události, zrcadlení do Hovorů a zpětné propojení
      // lead_id musí uspět (nebo selhat) společně, jinak by výpadek uprostřed
      // nechal osamocenou událost bez páru nebo naopak.
      await sql`
        WITH new_event AS (
          INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, business)
          VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${business})
          RETURNING id
        ),
        new_lead AS (
          INSERT INTO client_leads (company_name, next_action, next_action_date, next_action_time, next_action_type, calendar_event_id)
          SELECT ${title}, ${description ?? 'Termín z kalendáře'}, ${date}::date, ${time}::time, 'other', id
          FROM new_event
          RETURNING id, calendar_event_id
        )
        UPDATE calendar_events SET lead_id = new_lead.id
        FROM new_lead
        WHERE calendar_events.id = new_lead.calendar_event_id
      `
    } else {
      await sql`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, business)
        VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${business})
      `
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }

  revalidatePath('/dashboard/calendar')
  if (mirrorToLeads) revalidatePath('/dashboard/calls')
}

export async function deleteCalendarEvent(id: string) {
  await requireAuth()
  // Atomicky — dřívější dvojice samostatných DELETE mohla při výpadku mezi
  // nimi smazat lead a nechat viset osiřelou kalendářní událost.
  await sql`
    WITH deleted_lead AS (
      DELETE FROM client_leads WHERE calendar_event_id = ${id} RETURNING id
    )
    DELETE FROM calendar_events WHERE id = ${id}
  `
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/calls')
}
