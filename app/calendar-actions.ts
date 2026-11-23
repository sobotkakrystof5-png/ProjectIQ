'use server'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ensureContact } from '@/lib/admin/contacts'
import { loadCalendarWindow, type CalendarData } from '@/lib/admin/calendar'
import {
  availabilitySchema,
  insertAvailability,
  removeAvailability,
  restoreAvailability,
  type AvailabilityInput,
  type AvailabilitySnapshot,
} from '@/lib/admin/availability'
import { isCalendarDay, windowFor, type DayRange } from '@/lib/admin/calendar-window'
import { isoToPragueDateAndTime } from '@/lib/prague-time'
import { DEFAULT_LEAD_ORIGIN } from '@/lib/lead-origins'
import { applyMeetingSettings, syncMeetingAfterEdit } from '@/lib/admin/meetings'
import { planReminders } from '@/lib/admin/meeting-reminders'
import { deleteGoogleEvent } from '@/lib/admin/google/calendar'
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

/**
 * Schůzka s Google Meet u smazané události (R-137). „Zpět" ji obnoví se stejným
 * id, odkazem i připomínkami; událost v Googlu se proto maže až po chvíli.
 */
export type MeetingSnapshot = {
  meet_url: string
  google_event_id: string | null
  invite_status: string | null
  invite_to: string | null
  invite_subject: string | null
  invite_body: string | null
  invite_demo_url: string | null
  invite_sent_at: string | null
  meeting_phone: string | null
  reminders_on: boolean
}

/** Co se při smazání zapamatuje, aby šlo smazání vzít zpět (toast „Zpět"). */
export type CalendarEventSnapshot = {
  id?: string
  meeting?: MeetingSnapshot | null
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

async function insertEvent(
  payload: CalendarEventPayload,
  extras: LeadExtras = {},
  fixedId?: string,
): Promise<string | null> {
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
  // Obě id vznikají tady, ne v databázi: řádek vložený v CTE totiž další část
  // téhož příkazu nevidí, takže dřívější `UPDATE … SET lead_id` nikdy nic
  // nenašel a každá událost zůstala bez `lead_id` (kontakt se pak v kalendáři
  // neukázal a asistent dostal místo id `null`).
  const eventId = fixedId ?? randomUUID()
  let rows: Record<string, unknown>[]
  try {
    if (mirrorToLeads) {
      const leadId = randomUUID()
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
      // Jeden atomický příkaz: událost i její kontakt v Hovorech vzniknou
      // spolu, nebo vůbec. Řádky se odkazují navzájem; cizí klíče Postgres
      // kontroluje až na konci příkazu, kdy existují oba.
      rows = (await sql`
        WITH new_event AS (
          INSERT INTO calendar_events (id, title, description, starts_at, ends_at, event_type, lead_origin, lead_id)
          VALUES (${eventId}, ${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN}, ${leadId})
          RETURNING id
        ),
        new_lead AS (
          INSERT INTO client_leads (
            id, company_name, contact_name, phone, email,
            next_action, next_action_date, next_action_time, next_action_type,
            calendar_event_id, contact_id, notes, lead_status, estimated_value
          )
          SELECT ${leadId}, ${title}, ${contactName}, ${phone}, ${email},
                 ${extras.next_action ?? description ?? 'Termín z kalendáře'}, ${date}::date, ${time}::time, 'other', id, ${contactId},
                 ${extras.notes ?? null}, COALESCE(${extras.lead_status ?? null}::text, 'cold'), ${extras.estimated_value ?? null}
          FROM new_event
          RETURNING id
        )
        SELECT new_event.id::text AS id FROM new_event, new_lead
      `) as Record<string, unknown>[]
    } else {
      rows = (await sql`
        INSERT INTO calendar_events (id, title, description, starts_at, ends_at, event_type, lead_origin)
        VALUES (${eventId}, ${title}, ${description}, ${payload.starts_at}, ${payload.ends_at}, ${payload.event_type}, ${DEFAULT_LEAD_ORIGIN})
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
export type CalendarUpdateResult = {
  /** Schůzka se v Google Kalendáři nepřesunula (R-137). */
  warning: string | null
  /** Klientovi se zařadila zpráva o změně termínu. */
  noticeQueued: boolean
}

export async function updateCalendarEvent(
  id: string,
  payload: CalendarEventPayload,
  options: { notifyClient?: boolean } = {},
): Promise<CalendarUpdateResult> {
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

  // Dvojice se hledá z obou stran. Události založené z kalendáře před opravou
  // 2026-11-18 mají `lead_id` prázdné (kontakt v Hovorech na ně ukazuje jen
  // přes `calendar_event_id`) a nejstarší události dvojici nemají vůbec.
  // Úprava proto `lead_id` doplní, a když kontakt v Hovorech chybí, založí ho
  // — jinak by se vyplněný telefon a e-mail tiše zahodily.
  const newLeadId = randomUUID()
  let rows: Record<string, unknown>[]
  try {
    rows = (await sql`
      WITH old AS (
        -- Stav před úpravou: CTE vidí data z doby před UPDATE v témže příkazu.
        SELECT starts_at, ends_at, to_jsonb(calendar_events) ->> 'meet_url' AS meet_url
          FROM calendar_events WHERE id = ${id}
      ),
      ev AS (
        UPDATE calendar_events
        SET title = ${title}, description = ${description},
            starts_at = ${payload.starts_at}, ends_at = ${payload.ends_at},
            lead_id = CASE WHEN event_type = 'manual' THEN COALESCE(
              lead_id,
              (SELECT l.id FROM client_leads l WHERE l.calendar_event_id = calendar_events.id LIMIT 1),
              ${newLeadId}::uuid
            ) ELSE lead_id END
        WHERE id = ${id} AND event_type IN ('manual', 'block')
        RETURNING id, event_type, lead_id
      ),
      new_lead AS (
        INSERT INTO client_leads (
          id, company_name, contact_name, phone, email, contact_id,
          next_action, next_action_date, next_action_time, next_action_type,
          calendar_event_id, lead_status
        )
        SELECT ev.lead_id, ${title}, ${contactName}, ${phone}, ${email}, ${contactId}::uuid,
               ${description ?? 'Termín z kalendáře'}, ${date}::date, ${time}::time, 'other',
               ev.id, 'cold'
        FROM ev
        WHERE ev.lead_id = ${newLeadId}::uuid
        RETURNING id
      ),
      lead AS (
        UPDATE client_leads SET
          company_name = ${title},
          contact_name = ${contactName},
          phone = ${phone},
          email = ${email},
          contact_id = COALESCE(${contactId}::uuid, contact_id),
          calendar_event_id = ev.id,
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
        WHERE client_leads.id = ev.lead_id
        RETURNING client_leads.id
      )
      SELECT ev.id, ev.event_type, old.starts_at AS old_starts_at, old.ends_at AS old_ends_at, old.meet_url
        FROM ev, old
    `) as Record<string, unknown>[]
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři.')
    }
    throw err
  }
  if (rows.length === 0) throw new Error('Tuhle událost nejde upravit — už neexistuje.')
  revalidateCalendar(rows[0].event_type !== 'block')

  // Schůzka s Google Meet (R-137): přesun v Googlu a nové připomínky. Platí
  // pro okno kalendáře i pro asistenta, oba sem chodí.
  if (!rows[0].meet_url) return { warning: null, noticeQueued: false }
  const timeChanged =
    new Date(rows[0].old_starts_at as string).getTime() !== new Date(payload.starts_at).getTime() ||
    new Date(rows[0].old_ends_at as string).getTime() !== new Date(payload.ends_at).getTime()
  return syncMeetingAfterEdit(id, { timeChanged, notifyClient: options.notifyClient === true })
}

function meetingFromRow(row: Record<string, unknown> | null): MeetingSnapshot | null {
  if (!row || typeof row.meet_url !== 'string' || !row.meet_url) return null
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    meet_url: row.meet_url,
    google_event_id: str(row.google_event_id),
    invite_status: str(row.invite_status),
    invite_to: str(row.invite_to),
    invite_subject: str(row.invite_subject),
    invite_body: str(row.invite_body),
    invite_demo_url: str(row.invite_demo_url),
    invite_sent_at: str(row.invite_sent_at),
    meeting_phone: str(row.meeting_phone),
    reminders_on: row.reminders_on === true,
  }
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
      RETURNING id, title, description, starts_at, ends_at, event_type,
                -- Schůzka (R-114, R-137) přes to_jsonb, ať mazání běží i bez migrací.
                to_jsonb(calendar_events) AS row_json
    ),
    ld AS (
      DELETE FROM client_leads
      WHERE calendar_event_id IN (SELECT id FROM ev)
      RETURNING contact_name, phone, email, next_action, notes, lead_status, estimated_value
    )
    SELECT ev.id::text AS id, ev.title, ev.description, ev.starts_at, ev.ends_at, ev.event_type, ev.row_json,
           (SELECT to_jsonb(ld) FROM ld LIMIT 1) AS lead
    FROM ev
  `) as Record<string, unknown>[]
  revalidateCalendar(true)
  if (rows.length === 0) return null
  const r = rows[0]
  const meeting = meetingFromRow(r.row_json as Record<string, unknown> | null)
  // Událost v Googlu se maže až po vypršení „Zpět" (toast drží 6 s) a jen
  // když ji „Zpět" neobnovilo — obnova vrací stejné id. 10 s se vejde do
  // limitu běhu funkce i na Hobby.
  if (meeting?.google_event_id) {
    const googleId = meeting.google_event_id
    const eventId = String(r.id)
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000))
      const back = (await sql`SELECT 1 FROM calendar_events WHERE id = ${eventId}`) as unknown[]
      if (back.length > 0) return
      await deleteGoogleEvent(googleId).catch((err) =>
        console.error('[calendar] Smazání schůzky v Googlu selhalo:', (err as Error).message),
      )
    })
  }
  return {
    id: String(r.id),
    meeting,
    title: String(r.title),
    description: (r.description as string | null) ?? null,
    starts_at: new Date(r.starts_at as string).toISOString(),
    ends_at: new Date(r.ends_at as string).toISOString(),
    event_type: r.event_type as 'manual' | 'block',
    lead: (r.lead as CalendarEventSnapshot['lead']) ?? null,
  }
}

const meetingSnapshotSchema = z.object({
  meet_url: z.string().max(300).regex(/^https:\/\/meet\.google\.com\/[a-z0-9-]+(\?[^\s]*)?$/i),
  google_event_id: z.string().max(1024).nullable(),
  invite_status: z.enum(['pending', 'sending', 'sent', 'cancelled', 'failed']).nullable(),
  invite_to: z.string().max(254).email().nullable(),
  invite_subject: z.string().max(200).nullable(),
  invite_body: z.string().max(4000).nullable(),
  invite_demo_url: z.string().max(500).url().nullable(),
  invite_sent_at: z.string().max(40).nullable(),
  meeting_phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable(),
  reminders_on: z.boolean(),
})

const snapshotSchema = z.object({
  id: z.string().uuid().optional(),
  meeting: meetingSnapshotSchema.nullable().optional(),
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
    s.id,
  )
  if (s.id && s.meeting) {
    const m = s.meeting
    // Pozvánka, která čekala na odeslání, se po obnově nepošle sama — po
    // smazání ji Kryštof viděl zrušenou. Odeslanou nechá jako odeslanou.
    const status = m.invite_status === 'sent' ? 'sent' : m.invite_status ? 'cancelled' : null
    await sql`
      UPDATE calendar_events
         SET meet_url = ${m.meet_url}, google_event_id = ${m.google_event_id},
             invite_status = ${status}, invite_to = ${m.invite_to}, invite_subject = ${m.invite_subject},
             invite_body = ${m.invite_body}, invite_demo_url = ${m.invite_demo_url},
             invite_sent_at = ${status === 'sent' ? m.invite_sent_at : null}
       WHERE id = ${s.id}
    `
    await applyMeetingSettings(s.id, { phone: m.meeting_phone, remindersOn: m.reminders_on })
    await planReminders(s.id)
  }
}


// ─── Volno pro klienty (KP14, migrace 123) ────────────────────────────────────
//
// Volno není událost a do Hovorů se nezrcadlí. Klienti si v něm rezervují
// konzultace; smazáním volna se existující rezervace neruší.

function availabilityError(err: unknown): never {
  const code = (err as { code?: string })?.code
  if (code === '42P01' || code === '42883') {
    throw new Error('Volno pro klienty ještě není v databázi (migrace 123).')
  }
  throw err
}

export async function createClientAvailability(payload: AvailabilityInput): Promise<{ id: string }> {
  await requireAuth()
  const parsed = availabilitySchema.safeParse(payload)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím volno.')
  try {
    const id = await insertAvailability(parsed.data)
    revalidateCalendar(false)
    return { id }
  } catch (err) {
    return availabilityError(err)
  }
}

const removeSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(['series', 'day']),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** Smaže volno (celé, nebo jen jeden den opakování) a vrátí snímek pro „Zpět". */
export async function deleteClientAvailability(
  id: string,
  scope: 'series' | 'day',
  day: string,
): Promise<AvailabilitySnapshot | null> {
  await requireAuth()
  const parsed = removeSchema.parse({ id, scope, day })
  try {
    const snapshot = await removeAvailability(parsed.id, parsed.scope, parsed.day)
    revalidateCalendar(false)
    return snapshot
  } catch (err) {
    return availabilityError(err)
  }
}

export async function restoreClientAvailability(snapshot: AvailabilitySnapshot): Promise<void> {
  await requireAuth()
  await restoreAvailability(snapshot)
  revalidateCalendar(false)
}
