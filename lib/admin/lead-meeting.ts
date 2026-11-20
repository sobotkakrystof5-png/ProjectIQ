import 'server-only'
import { adminDb, q, type AdminQuery } from '@/lib/admin/db'
import { createMeetEvent, deleteGoogleEvent } from '@/lib/admin/google/calendar'
import { meetingWhen, renderMeetingEmail } from '@/lib/admin/meeting-email'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { isoToPragueDateAndTime } from '@/lib/prague-time'

/**
 * Schůzka s kontaktem z Hovorů a e-mail s odkazem na Google Meet (R-121).
 *
 * Šablona „Schůzka s Google Meet" v okně „Poslat e-mail" není jen text:
 * odkaz na Meet musí skutečně existovat. Pořadí je záměrné a **všechno nebo
 * nic** — když cokoli selže, kontakt zůstane, jak byl:
 *
 *  1. **Hovory a kalendář** — příští akce kontaktu se přepíše na schůzku
 *     a termín se přesune i v propojené kalendářní události (`admin_lead_reschedule`,
 *     migrace 105). Jako první proto, že tady zaprotestuje překryvový guard
 *     a nic dalšího se ještě nestalo.
 *  2. **Google** — událost s Meetem v kalendáři Kryštofa (bez hostů, R-114).
 *  3. **E-mail** — z krystof@vizeon.cz přes Resend, ihned (text před odesláním
 *     vidí Kryštof v okně, žádný odklad na „Zpět" jako u firem od asistenta).
 *
 * Selže-li 2 nebo 3, vrátí se 1 a událost v Googlu se smaže.
 */

const MIN_MINUTES = 15
const MAX_MINUTES = 180
export const MEETING_ACTION = 'Schůzka přes Google Meet'

export type LeadMeetingInput = {
  leadId: string
  /** Začátek schůzky jako okamžik (ISO). */
  startsAt: string
  minutes: number
  subject: string
  /** Úvod e-mailu; zbytek (termín, Meet, web, podpis) doplní `renderMeetingEmail`. */
  intro: string
}

export type LeadMeetingResult =
  | { ok: true; meetUrl: string; when: string }
  | { ok: false; error: string }

type Deps = {
  createMeet?: typeof createMeetEvent
  deleteMeet?: typeof deleteGoogleEvent
  send?: typeof sendVizeonMail
}

type LeadRow = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  next_action: string | null
  next_action_type: string | null
  next_action_date: string | null
  next_action_time: string | null
  calendar_event_id: string | null
  event_starts_at: string | Date | null
  event_ends_at: string | Date | null
  event_google_id: string | null
}

type Schedule = { action: string | null; type: string | null; date: string | null; time: string | null }

/**
 * Přepíše příští akci kontaktu a posune propojenou událost v kalendáři.
 * Stejný postup jako `updateLead` v `app/calls-actions.ts`: dávka je jedna
 * transakce a databáze bez migrace 105 (`42883`) nesmí shodit odeslání —
 * termín v kalendáři se pak jen neposune.
 */
async function applySchedule(
  leadId: string,
  schedule: Schedule,
  event: { startsAt: string; endsAt: string | null } | null,
): Promise<void> {
  const update = q`
    UPDATE client_leads SET
      next_action = ${schedule.action},
      next_action_type = ${schedule.type},
      next_action_date = ${schedule.date}::date,
      next_action_time = ${schedule.time}::time,
      reminder_day_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM ${schedule.date}::date
          OR next_action_time IS DISTINCT FROM ${schedule.time}::time
        THEN false ELSE reminder_day_before_sent END,
      reminder_2h_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM ${schedule.date}::date
          OR next_action_time IS DISTINCT FROM ${schedule.time}::time
        THEN false ELSE reminder_2h_before_sent END,
      updated_at = now()
    WHERE id = ${leadId}
  `
  const queries: AdminQuery[] = [update]
  if (event) {
    queries.push(q`SELECT admin_lead_reschedule(${leadId}, ${event.startsAt}::timestamptz, ${event.endsAt}::timestamptz) AS event_id`)
  }
  try {
    await adminDb.batch(queries)
  } catch (err) {
    if ((err as { code?: string })?.code !== '42883' || !event) throw err
    console.error('[Hovory] migrace 105 chybí, termín v kalendáři se neposunul')
    await adminDb.batch([update])
  }
}

function iso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export async function sendLeadMeetingEmail(input: LeadMeetingInput, deps: Deps = {}): Promise<LeadMeetingResult> {
  const createMeet = deps.createMeet ?? createMeetEvent
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent
  const send = deps.send ?? sendVizeonMail

  const start = new Date(input.startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Neplatný čas schůzky.' }
  if (start.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: 'Schůzka nemůže být v minulosti.' }
  const minutes = Math.round(input.minutes)
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { ok: false, error: 'Délka schůzky musí být 15 až 180 minut.' }
  const end = new Date(start.getTime() + minutes * 60_000)

  // Událost v Googlu a propojená událost v kalendáři adminu — `to_jsonb` ať
  // dotaz běží i na databázi, která nemá sloupce z migrace 115.
  const rows = await adminDb<LeadRow>`
    SELECT l.id::text AS id, l.company_name, l.contact_name, l.phone, l.email,
           l.next_action, l.next_action_type,
           l.next_action_date::text AS next_action_date, l.next_action_time::text AS next_action_time,
           l.calendar_event_id::text AS calendar_event_id,
           e.starts_at AS event_starts_at, e.ends_at AS event_ends_at,
           to_jsonb(e) ->> 'google_event_id' AS event_google_id
      FROM client_leads l
      LEFT JOIN calendar_events e ON e.id = l.calendar_event_id
     WHERE l.id = ${input.leadId}
  `
  const lead = rows[0]
  if (!lead) return { ok: false, error: 'Kontakt nenalezen.' }
  if (!lead.email) return { ok: false, error: 'Kontakt nemá vyplněný e-mail.' }

  const next = isoToPragueDateAndTime(start.toISOString())
  const previous: Schedule = {
    action: lead.next_action,
    type: lead.next_action_type,
    date: lead.next_action_date,
    time: lead.next_action_time,
  }
  const previousEvent =
    lead.calendar_event_id && lead.event_starts_at
      ? { startsAt: iso(lead.event_starts_at)!, endsAt: iso(lead.event_ends_at) }
      : null

  // 1) Hovory + kalendář
  try {
    await applySchedule(
      lead.id,
      { action: MEETING_ACTION, type: 'meeting', date: next.date, time: next.time },
      lead.calendar_event_id ? { startsAt: start.toISOString(), endsAt: end.toISOString() } : null,
    )
  } catch (err) {
    if ((err as { code?: string })?.code === '23P01') {
      return { ok: false, error: 'V tu dobu už máte v kalendáři něco jiného. Vyberte jiný čas.' }
    }
    throw err
  }

  const revert = async () => {
    try {
      // Bez původního data (kontakt neměl termín) se vrací jen text a typ.
      await applySchedule(lead.id, previous, previousEvent && previous.date ? previousEvent : null)
    } catch (err) {
      console.error('[Hovory] Návrat původního termínu selhal:', (err as Error).message)
    }
  }

  // 2) Google
  const title = `Schůzka: ${lead.company_name}`.slice(0, 120)
  const description = [
    lead.contact_name ? `Kontakt: ${lead.contact_name}` : null,
    lead.phone ? `Telefon: ${lead.phone}` : null,
    'Domluveno z Hovorů v ZakazIQ.',
  ]
    .filter(Boolean)
    .join('\n')
  let meet: { googleEventId: string; meetUrl: string }
  try {
    meet = await createMeet({ title, description, startsAt: start.toISOString(), endsAt: end.toISOString() })
  } catch (err) {
    await revert()
    return { ok: false, error: (err as Error).message }
  }

  // 3) E-mail
  let result: Awaited<ReturnType<typeof sendVizeonMail>>
  try {
    const { text, html } = renderMeetingEmail({
      intro: input.intro,
      startsAt: start.toISOString(),
      minutes,
      meetUrl: meet.meetUrl,
      demoUrl: null,
    })
    result = await send({ to: lead.email, subject: input.subject, text, html })
  } catch (err) {
    result = { ok: false, error: (err as Error).message }
  }
  if (!result.ok) {
    await deleteMeet(meet.googleEventId).catch((e) =>
      console.error('[Hovory] Úklid události v Googlu selhal:', (e as Error).message),
    )
    await revert()
    console.error('[Hovory] E-mail se schůzkou neodešel:', result.error)
    return { ok: false, error: 'E-mail se nepodařilo odeslat, schůzka se nezapsala. Zkuste to prosím znovu.' }
  }

  // E-mail už odešel — od téhle chvíle nic nesmí vrátit chybu. Co se nezapíše,
  // jen se zaloguje; odkaz na Meet je v e-mailu a v Google Kalendáři.
  const when = meetingWhen(start.toISOString())
  const note = `Schůzka přes Google Meet ${when} (${minutes} minut). E-mail s odkazem odeslán.\nOdkaz: ${meet.meetUrl}`
  try {
    const writes: AdminQuery[] = [
      q`UPDATE client_leads SET portfolio_sent_at = now() WHERE id = ${lead.id}`,
      q`INSERT INTO lead_notes (lead_id, content) VALUES (${lead.id}, ${note})`,
    ]
    await adminDb.batch(writes)
  } catch (err) {
    console.error('[Hovory] Poznámka o schůzce se nezapsala:', (err as Error).message)
  }
  if (lead.calendar_event_id) {
    try {
      await adminDb`
        UPDATE calendar_events SET meet_url = ${meet.meetUrl}, google_event_id = ${meet.googleEventId}
         WHERE id = ${lead.calendar_event_id}
      `
      // Dřívější Meet téže události už neplatí, ať v Googlu nezůstane dvojník.
      if (lead.event_google_id && lead.event_google_id !== meet.googleEventId) {
        await deleteMeet(lead.event_google_id).catch((e) =>
          console.error('[Hovory] Starý Meet se nepodařilo smazat:', (e as Error).message),
        )
      }
    } catch (err) {
      // `42703` = databáze bez migrace 115; Meet je pak jen v Google Kalendáři.
      if ((err as { code?: string })?.code !== '42703') console.error('[Hovory] Meet u události:', (err as Error).message)
    }
  }

  return { ok: true, meetUrl: meet.meetUrl, when }
}
