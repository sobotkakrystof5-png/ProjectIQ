'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { CalendarEventType } from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

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

  await sql`
    INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type)
    VALUES (
      ${payload.title.trim()},
      ${payload.description?.trim() || null},
      ${payload.starts_at},
      ${payload.ends_at},
      ${payload.event_type}
    )
  `
  revalidatePath('/dashboard/calendar')
}

export async function deleteCalendarEvent(id: string) {
  await requireAuth()
  await sql`DELETE FROM calendar_events WHERE id = ${id}`
  revalidatePath('/dashboard/calendar')
}
