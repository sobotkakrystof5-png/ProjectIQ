import 'server-only'
import { randomUUID } from 'node:crypto'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { loadOutreachSource } from '@/lib/admin/outreach'
import { createMeetEvent, deleteGoogleEvent } from '@/lib/admin/google/calendar'
import { renderMeetingEmail } from '@/lib/admin/meeting-email'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { isoToPragueDateAndTime } from '@/lib/prague-time'
import { DEFAULT_LEAD_ORIGIN } from '@/lib/lead-origins'

/**
 * Schůzka s firmou od AI asistenta (R-112, krok 3 a 4).
 *
 * Pořadí je záměrné:
 *  1. **Google** — událost s Meetem v kalendáři Kryštofa. Když selže, v adminu
 *     nevznikne nic.
 *  2. **Admin** — jedna transakce: kontakt v Hovorech (stávající, nebo nový),
 *     událost v kalendáři s odkazem na Meet, firma od asistenta převzatá.
 *     Když selže (překryv s jiným termínem), událost v Googlu se smaže.
 *  3. **E-mail** — čeká `INVITE_DELAY_MS` na „Zpět" a pak odejde jedním UPDATE,
 *     který řádek zamkne (`pending` → `sending`), takže dvakrát neodejde.
 */

export const INVITE_DELAY_MS = 15_000
const MIN_MINUTES = 15
const MAX_MINUTES = 180

export type ScheduleInput = {
  outreachId: string
  startsAt: string
  minutes: number
  /** Poslat klientovi e-mail? Bez adresy nejde. */
  sendInvite: boolean
  inviteTo: string | null
  subject: string
  intro: string
}

export type ScheduleResult =
  | { ok: true; eventId: string; leadId: string; meetUrl: string; inviteQueued: boolean }
  | { ok: false; error: string }

type Deps = {
  createMeet?: typeof createMeetEvent
  deleteMeet?: typeof deleteGoogleEvent
}

export async function scheduleOutreachMeeting(input: ScheduleInput, deps: Deps = {}): Promise<ScheduleResult> {
  const createMeet = deps.createMeet ?? createMeetEvent
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent

  const start = new Date(input.startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Neplatný čas schůzky.' }
  if (start.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: 'Schůzka nemůže být v minulosti.' }
  const minutes = Math.round(input.minutes)
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { ok: false, error: 'Délka schůzky musí být 15 až 180 minut.' }
  const end = new Date(start.getTime() + minutes * 60_000)

  const source = await loadOutreachSource(input.outreachId)
  if (!source) return { ok: false, error: 'Firma nenalezena.' }

  const inviteTo = input.sendInvite ? input.inviteTo?.trim() || null : null
  if (input.sendInvite && !inviteTo) return { ok: false, error: 'Chybí e-mail klienta.' }

  const title = `Schůzka: ${source.company_name}`.slice(0, 120)
  const description = [
    source.contact_name ? `Kontakt: ${source.contact_name}` : null,
    source.phone ? `Telefon: ${source.phone}` : null,
    source.demo_url ? `Ukázka: ${source.demo_url}` : null,
    'Domluveno přes AI asistenta (Growth OS).',
  ]
    .filter(Boolean)
    .join('\n')

  // 1) Google
  let meet: { googleEventId: string; meetUrl: string }
  try {
    meet = await createMeet({ title, description, startsAt: start.toISOString(), endsAt: end.toISOString() })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  // 2) Admin
  const eventId = randomUUID()
  const existingLead = source.client_lead_id
  const leadId = existingLead ?? randomUUID()
  const { date, time } = isoToPragueDateAndTime(start.toISOString())
  const nextAction = `Schůzka přes Google Meet`

  const queries: AdminQuery[] = []
  if (existingLead) {
    // Kontakt smí mít jen jednu spárovanou událost (migrace 051) — starou odpojit.
    queries.push({ text: `UPDATE calendar_events SET lead_id = NULL WHERE lead_id = $1`, params: [leadId] })
  } else {
    const contactId = await ensureContact({
      name: source.contact_name ?? source.company_name,
      company: source.company_name,
      email: source.email,
      phone: source.phone,
      source: 'growth-os',
      seenAt: start.toISOString(),
    })
    queries.push({
      text: `INSERT INTO client_leads (id, company_name, contact_name, phone, email, lead_status, next_action,
                                       next_action_type, next_action_date, next_action_time, notes, contact_id)
             VALUES ($1, $2, $3, $4, $5, 'new', $6, 'meeting', $7::date, $8::time, $9, $10)`,
      params: [
        leadId,
        source.company_name,
        source.contact_name,
        source.phone,
        source.email,
        nextAction,
        date,
        time,
        source.demo_url ? `Z Growth OS. Ukázka: ${source.demo_url}` : 'Z Growth OS.',
        contactId,
      ],
    })
  }
  queries.push(
    {
      text: `INSERT INTO calendar_events (id, title, description, starts_at, ends_at, event_type, lead_origin, lead_id,
                                          meet_url, google_event_id, outreach_lead_id, invite_status, invite_to,
                                          invite_subject, invite_body, invite_demo_url, invite_send_after)
             VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                     CASE WHEN $11::text = 'pending' THEN now() + make_interval(secs => $16) END)`,
      params: [
        eventId,
        title,
        description,
        start.toISOString(),
        end.toISOString(),
        DEFAULT_LEAD_ORIGIN,
        leadId,
        meet.meetUrl,
        meet.googleEventId,
        input.outreachId,
        inviteTo ? 'pending' : null,
        inviteTo,
        inviteTo ? input.subject.trim().slice(0, 200) : null,
        inviteTo ? input.intro.trim().slice(0, 4000) : null,
        source.demo_url,
        INVITE_DELAY_MS / 1000,
      ],
    },
    {
      text: `UPDATE client_leads
                SET calendar_event_id = $2, next_action = $3, next_action_type = 'meeting',
                    next_action_date = $4::date, next_action_time = $5::time
              WHERE id = $1`,
      params: [leadId, eventId, nextAction, date, time],
    },
    {
      text: `UPDATE outreach_leads
                SET handled_at = now(), handled_reason = 'prevzato',
                    client_lead_id = coalesce(client_lead_id, $2::uuid), updated_at = now()
              WHERE id = $1`,
      params: [input.outreachId, leadId],
    },
  )

  try {
    await adminDb.batch(queries)
  } catch (err) {
    await deleteMeet(meet.googleEventId).catch((e) => console.error('[meeting] Úklid v Googlu selhal:', (e as Error).message))
    if ((err as { code?: string })?.code === '23P01') {
      return { ok: false, error: 'V tu dobu už máte v kalendáři něco jiného.' }
    }
    throw err
  }

  return { ok: true, eventId, leadId, meetUrl: meet.meetUrl, inviteQueued: inviteTo !== null }
}

export type SendInviteResult = 'sent' | 'failed' | 'skipped'

/**
 * Pošle e-mail, který už dočkal odkladu. Opakované volání nic nezdvojí:
 * řádek si zamkne UPDATE `pending` → `sending` a Resend dostane stejný
 * `Idempotency-Key`.
 */
export async function sendDueInvite(
  eventId: string,
  send: typeof sendVizeonMail = sendVizeonMail,
): Promise<SendInviteResult> {
  const rows = await adminDb<{
    invite_to: string
    invite_subject: string
    invite_body: string
    invite_demo_url: string | null
    meet_url: string
    starts_at: string | Date
    ends_at: string | Date
  }>`
    UPDATE calendar_events SET invite_status = 'sending'
     WHERE id = ${eventId} AND invite_status = 'pending' AND invite_send_after <= now()
    RETURNING invite_to, invite_subject, invite_body, invite_demo_url, meet_url, starts_at, ends_at
  `
  const row = rows[0]
  if (!row) return 'skipped'

  const startsAt = new Date(row.starts_at).toISOString()
  const minutes = Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000)
  let result: Awaited<ReturnType<typeof sendVizeonMail>>
  try {
    const { text, html } = renderMeetingEmail({
      intro: row.invite_body,
      startsAt,
      minutes,
      meetUrl: row.meet_url,
      demoUrl: row.invite_demo_url,
    })
    result = await send({ to: row.invite_to, subject: row.invite_subject, text, html, idempotencyKey: `meeting-invite:${eventId}` })
  } catch (err) {
    result = { ok: false, error: (err as Error).message }
  }

  if (result.ok) {
    await adminDb`
      UPDATE calendar_events
         SET invite_status = 'sent', invite_sent_at = now(), invite_provider_id = ${result.id}, invite_error = NULL
       WHERE id = ${eventId}
    `
    return 'sent'
  }
  await adminDb`
    UPDATE calendar_events SET invite_status = 'failed', invite_error = ${result.error.slice(0, 300)}
     WHERE id = ${eventId}
  `
  console.error('[meeting] E-mail neodešel:', result.error)
  return 'failed'
}

/** Pojistka pro denní cron: e-maily, které po odkladu neodešly (spadlá funkce). */
export async function sendOverdueInvites(): Promise<number> {
  let ids: { id: string }[]
  try {
    ids = await adminDb<{ id: string }>`
      SELECT id::text FROM calendar_events
       WHERE invite_status = 'pending' AND invite_send_after < now() - interval '2 minutes'
         AND starts_at > now()
       LIMIT 20
    `
  } catch (err) {
    if ((err as { code?: string })?.code === '42703') return 0
    throw err
  }
  let sent = 0
  for (const { id } of ids) if ((await sendDueInvite(id)) === 'sent') sent++
  return sent
}

/** „Poslat znovu" u e-mailu, který neodešel. */
export async function retryInvite(eventId: string): Promise<SendInviteResult> {
  await adminDb`
    UPDATE calendar_events SET invite_status = 'pending', invite_send_after = now(), invite_error = NULL
     WHERE id = ${eventId} AND invite_status = 'failed'
  `
  return sendDueInvite(eventId)
}

export type CancelResult = { ok: true } | { ok: false; error: string }

/**
 * „Zpět" do odeslání e-mailu: e-mail se zastaví, událost zmizí z kalendáře
 * adminu i z Googlu. Kontakt v Hovorech zůstává (firma je převzatá).
 */
export async function cancelMeeting(eventId: string, deps: Deps = {}): Promise<CancelResult> {
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent
  const rows = await adminDb<{ google_event_id: string | null; invite_status: string | null }>`
    SELECT google_event_id, invite_status FROM calendar_events WHERE id = ${eventId}
  `
  const row = rows[0]
  if (!row) return { ok: true }
  if (row.invite_status === 'sent' || row.invite_status === 'sending') {
    return { ok: false, error: 'E-mail klientovi už odešel. Schůzku zrušte v kalendáři a dejte mu vědět.' }
  }

  // Jedním příkazem: událost pryč a u kontaktu místo zrušeného termínu
  // „Domluvit schůzku" bez data (jinak by v kalendáři visel plánovaný hovor).
  const deleted = await adminDb<{ id: string }>`
    WITH del AS (
      DELETE FROM calendar_events
       WHERE id = ${eventId} AND (invite_status IS NULL OR invite_status IN ('pending', 'cancelled', 'failed'))
      RETURNING id, lead_id
    ), lead AS (
      UPDATE client_leads
         SET next_action = 'Domluvit schůzku', next_action_type = 'call',
             next_action_date = NULL, next_action_time = NULL
        FROM del WHERE client_leads.id = del.lead_id
      RETURNING client_leads.id
    )
    SELECT id::text FROM del
  `
  if (!deleted[0]) return { ok: false, error: 'E-mail klientovi už odešel. Schůzku zrušte v kalendáři a dejte mu vědět.' }

  if (row.google_event_id) {
    await deleteMeet(row.google_event_id).catch((e) =>
      console.error('[meeting] Smazání v Googlu selhalo:', (e as Error).message),
    )
  }
  return { ok: true }
}
