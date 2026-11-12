'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ensureContact } from '@/lib/admin/contacts'
import { loadCalendarWindow, type CalendarData } from '@/lib/admin/calendar'
import { isCalendarDay, windowFor, type DayRange } from '@/lib/admin/calendar-window'
import { isoToPragueDateAndTime } from '@/lib/prague-time'
import { DEFAULT_LEAD_ORIGIN } from '@/lib/lead-origins'
import type { CalendarEventType } from '@/lib/types'

/**
 * Dotažení dalšího období kalendáře (AD08). Stránka pošle jen okno kolem
 * zobrazeného měsíce; když se někdo proklikne dál, dojde sem místo
 * přenačtení celé stránky.
 *
 * Kotva je `'YYYY-MM-DD'` z prohlížeče, ale rozsah se z ní spočítá **tady**
 * (`windowFor`) — z klienta tak nemůže přijít „od roku 2000 do 2100".
 */
export async function loadCalendarMonth(anchor: string): Promise<{ range: DayRange; data: CalendarData }> {
  await requireAuth()
  if (!isCalendarDay(anchor)) throw new Error('Neplatné datum.')
  const range = windowFor(anchor)
  return { range, data: await loadCalendarWindow(range) }
}


type CalendarEventPayload = {
  title: string
  description: string | null
  starts_at: string // ISO string
  ends_at: string   // ISO string
  event_type: CalendarEventType
  /**
   * Komu termín patří (AD10). Nepovinné, ale bez toho byl zrcadlený kontakt
   * v Hovorech jen titulek a popis — nešlo z něj zavolat ani napsat.
   */
  contact_name?: string | null
  phone?: string | null
  email?: string | null
}

export async function createCalendarEvent(payload: CalendarEventPayload) {
  await requireAuth()

  if (!payload.title.trim()) throw new Error('Název je povinný.')
  if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
    throw new Error('Čas konce musí být po čase začátku.')
  }

  const title = payload.title.trim()
  const description = payload.description?.trim() || null
  const contactName = payload.contact_name?.trim() || null
  const phone = payload.phone?.trim() || null
  const email = payload.email?.trim() || null

  // Blokace jsou soukromé (dovolená, nedostupnost) — nemá smysl je zrcadlit
  // do Hovorů jako kontakt k obvolání. Po sloučení byznysů (AD02) se zrcadlí
  // všechno ostatní, dřív jen VIZEON.
  const mirrorToLeads = payload.event_type !== 'block'

  try {
    if (mirrorToLeads) {
      const { date, time } = isoToPragueDateAndTime(payload.starts_at)
      // Jeden člověk = jeden kontakt (AD09). Zápis nikdy nespadne na
      // duplicitě; bez telefonu i e-mailu se kontakt nezakládá (`null`).
      const contactId = await ensureContact({
        name: contactName,
        email,
        phone,
        source: 'manual',
        seenAt: payload.starts_at,
      })
      // Jeden atomický příkaz místo tří samostatných zápisů bez rollbacku —
      // založení kalendářní události, zrcadlení do Hovorů a zpětné propojení
      // lead_id musí uspět (nebo selhat) společně, jinak by výpadek uprostřed
      // nechal osamocenou událost bez páru nebo naopak.
      await sql`
        WITH new_event AS (
          INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, lead_origin)
          VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN})
          RETURNING id
        ),
        new_lead AS (
          INSERT INTO client_leads (
            company_name, contact_name, phone, email,
            next_action, next_action_date, next_action_time, next_action_type,
            calendar_event_id, contact_id
          )
          SELECT ${title}, ${contactName}, ${phone}, ${email},
                 ${description ?? 'Termín z kalendáře'}, ${date}::date, ${time}::time, 'other', id, ${contactId}
          FROM new_event
          RETURNING id, calendar_event_id
        )
        UPDATE calendar_events SET lead_id = new_lead.id
        FROM new_lead
        WHERE calendar_events.id = new_lead.calendar_event_id
      `
    } else {
      await sql`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, lead_origin)
        VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN})
      `
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }

  revalidatePath('/dashboard/calendar')
  if (mirrorToLeads) {
    revalidatePath('/dashboard/calls')
    revalidatePath('/dashboard/kontakty')
  }
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
