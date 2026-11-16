'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
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

/** Co se při smazání zapamatuje, aby šlo smazání vzít zpět (toast „Zpět"). */
export type CalendarEventSnapshot = {
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  event_type: 'manual' | 'block'
  lead: {
    contact_name: string | null
    phone: string | null
    email: string | null
    next_action: string | null
    notes: string | null
    lead_status: string | null
    estimated_value: number | null
  } | null
}

const EDITABLE_TYPES = ['manual', 'block'] as const

function checkPayload(payload: Pick<CalendarEventPayload, 'title' | 'starts_at' | 'ends_at'>) {
  if (!payload.title.trim()) throw new Error('Název je povinný.')
  if (payload.title.trim().length > 120) throw new Error('Název může mít nejvýš 120 znaků.')
  if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
    throw new Error('Čas konce musí být po čase začátku.')
  }
}

function revalidateCalendar(mirrored: boolean) {
  revalidatePath('/dashboard/calendar')
  // Kalendář je od R-110 i na Dnes (a „Nejbližší schůzky a hovory").
  revalidatePath('/dashboard')
  if (mirrored) {
    revalidatePath('/dashboard/calls')
    revalidatePath('/dashboard/kontakty')
  }
}

type LeadExtras = {
  notes?: string | null
  lead_status?: string | null
  estimated_value?: number | null
  next_action?: string | null
}

async function insertEvent(payload: CalendarEventPayload, extras: LeadExtras = {}): Promise<string | null> {
  const title = payload.title.trim()
  const description = payload.description?.trim() || null
  const contactName = payload.contact_name?.trim() || null
  const phone = payload.phone?.trim() || null
  const email = payload.email?.trim() || null

  // Blokace jsou soukromé (dovolená, nedostupnost) — nemá smysl je zrcadlit
  // do Hovorů jako kontakt k obvolání. Po sloučení byznysů (AD02) se zrcadlí
  // všechno ostatní, dřív jen VIZEON.
  const mirrorToLeads = payload.event_type !== 'block'

  // Id nové události potřebuje asistent pro „Zpět" (R-111); formuláře ho zahodí.
  let rows: Record<string, unknown>[]
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
      rows = (await sql`
        WITH new_event AS (
          INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, lead_origin)
          VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN})
          RETURNING id
        ),
        new_lead AS (
          INSERT INTO client_leads (
            company_name, contact_name, phone, email,
            next_action, next_action_date, next_action_time, next_action_type,
            calendar_event_id, contact_id, notes, lead_status, estimated_value
          )
          SELECT ${title}, ${contactName}, ${phone}, ${email},
                 ${extras.next_action ?? description ?? 'Termín z kalendáře'}, ${date}::date, ${time}::time, 'other', id, ${contactId},
                 ${extras.notes ?? null}, COALESCE(${extras.lead_status ?? null}::text, 'cold'), ${extras.estimated_value ?? null}
          FROM new_event
          RETURNING id, calendar_event_id
        )
        UPDATE calendar_events SET lead_id = new_lead.id
        FROM new_lead
        WHERE calendar_events.id = new_lead.calendar_event_id
        RETURNING calendar_events.id::text AS id
      `) as Record<string, unknown>[]
    } else {
      rows = (await sql`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, lead_origin)
        VALUES (${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN})
        RETURNING id::text AS id
      `) as Record<string, unknown>[]
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }
  revalidateCalendar(mirrorToLeads)
  return rows[0]?.id ? String(rows[0].id) : null
}

export async function createCalendarEvent(payload: CalendarEventPayload): Promise<{ id: string | null }> {
  await requireAuth()
  checkPayload(payload)
  return { id: await insertEvent(payload) }
}

/**
 * Úprava vlastní události nebo blokace: název, čas, poznámka a kontakt.
 * Zrcadlený kontakt v Hovorech se mění **v téže transakci**, takže se
 * kalendář a Hovory nikdy nerozejdou (R-010). Druh události (událost × blokace)
 * se nemění — blokace do Hovorů vůbec nepatří.
 */
export async function updateCalendarEvent(id: string, payload: CalendarEventPayload) {
  await requireAuth()
  checkPayload(payload)

  const title = payload.title.trim()
  const description = payload.description?.trim() || null
  const contactName = payload.contact_name?.trim() || null
  const phone = payload.phone?.trim() || null
  const email = payload.email?.trim() || null
  const { date, time } = isoToPragueDateAndTime(payload.starts_at)
  const contactId =
    payload.event_type === 'block'
      ? null
      : await ensureContact({ name: contactName, email, phone, source: 'manual', seenAt: payload.starts_at })

  let rows: Record<string, unknown>[]
  try {
    rows = (await sql`
      WITH ev AS (
        UPDATE calendar_events
        SET title = ${title}, description = ${description},
            starts_at = ${payload.starts_at}, ends_at = ${payload.ends_at}
        WHERE id = ${id} AND event_type IN ('manual', 'block')
        RETURNING id, event_type
      ),
      lead AS (
        UPDATE client_leads SET
          company_name = ${title},
          contact_name = ${contactName},
          phone = ${phone},
          email = ${email},
          contact_id = COALESCE(${contactId}::uuid, contact_id),
          next_action = ${description ?? 'Termín z kalendáře'},
          reminder_day_before_sent = CASE
            WHEN next_action_date IS DISTINCT FROM ${date}::date OR next_action_time IS DISTINCT FROM ${time}::time
            THEN false ELSE reminder_day_before_sent END,
          reminder_2h_before_sent = CASE
            WHEN next_action_date IS DISTINCT FROM ${date}::date OR next_action_time IS DISTINCT FROM ${time}::time
            THEN false ELSE reminder_2h_before_sent END,
          next_action_date = ${date}::date,
          next_action_time = ${time}::time,
          updated_at = now()
        FROM ev
        WHERE client_leads.calendar_event_id = ev.id
        RETURNING client_leads.id
      )
      SELECT id, event_type FROM ev
    `) as Record<string, unknown>[]
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }
  if (rows.length === 0) throw new Error('Tuhle událost nejde upravit — už neexistuje.')
  revalidateCalendar(rows[0].event_type !== 'block')
}

/**
 * Smaže vlastní událost nebo blokaci a vrátí, co se smazalo, aby toast mohl
 * nabídnout „Zpět". Rezervace od klientů, hovory a deadliny zakázek se tudy
 * mazat nedají — mají svůj zdroj (zakázka, Hovory).
 */
export async function deleteCalendarEvent(id: string): Promise<CalendarEventSnapshot | null> {
  await requireAuth()
  // Atomicky — dřívější dvojice samostatných DELETE mohla při výpadku mezi
  // nimi smazat lead a nechat viset osiřelou kalendářní událost.
  const rows = (await sql`
    WITH ev AS (
      DELETE FROM calendar_events
      WHERE id = ${id} AND event_type IN ('manual', 'block')
      RETURNING id, title, description, starts_at, ends_at, event_type
    ),
    ld AS (
      DELETE FROM client_leads
      WHERE calendar_event_id IN (SELECT id FROM ev)
      RETURNING contact_name, phone, email, next_action, notes, lead_status, estimated_value
    )
    SELECT ev.title, ev.description, ev.starts_at, ev.ends_at, ev.event_type,
           (SELECT to_jsonb(ld) FROM ld LIMIT 1) AS lead
    FROM ev
  `) as Record<string, unknown>[]
  revalidateCalendar(true)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    title: String(r.title),
    description: (r.description as string | null) ?? null,
    starts_at: new Date(r.starts_at as string).toISOString(),
    ends_at: new Date(r.ends_at as string).toISOString(),
    event_type: r.event_type as 'manual' | 'block',
    lead: (r.lead as CalendarEventSnapshot['lead']) ?? null,
  }
}

const snapshotSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable(),
  starts_at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  ends_at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  event_type: z.enum(EDITABLE_TYPES),
  lead: z
    .object({
      contact_name: z.string().max(120).nullable(),
      phone: z.string().max(40).nullable(),
      email: z.string().max(200).nullable(),
      next_action: z.string().max(500).nullable(),
      notes: z.string().max(5000).nullable(),
      lead_status: z.string().max(40).nullable(),
      estimated_value: z.number().nullable(),
    })
    .nullable(),
})

/** „Zpět" po smazání: založí událost znovu, včetně poznámek kontaktu v Hovorech. */
export async function restoreCalendarEvent(snapshot: CalendarEventSnapshot) {
  await requireAuth()
  const s = snapshotSchema.parse(snapshot)
  checkPayload(s)
  await insertEvent(
    {
      title: s.title,
      description: s.description,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      event_type: s.event_type,
      contact_name: s.lead?.contact_name ?? null,
      phone: s.lead?.phone ?? null,
      email: s.lead?.email ?? null,
    },
    {
      notes: s.lead?.notes ?? null,
      lead_status: s.lead?.lead_status ?? null,
      estimated_value: s.lead?.estimated_value ?? null,
      next_action: s.lead?.next_action ?? null,
    },
  )
}
