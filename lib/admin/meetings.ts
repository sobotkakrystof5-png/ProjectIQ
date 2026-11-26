import 'server-only'
import { randomUUID } from 'node:crypto'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { absorbIntoContact, linkOutreachContact, syncOutreachContact } from '@/lib/admin/contact-sync'
import { loadOutreachSource } from '@/lib/admin/outreach'
import { createMeetEvent, deleteGoogleEvent, moveGoogleEvent } from '@/lib/admin/google/calendar'
import { normalizePhone } from '@/lib/contacts/normalize'
import { remindersNote, renderMeetingEmail } from '@/lib/admin/meeting-email'
import { buildMeetingIcs } from '@/lib/admin/meeting-ics'
import { icsSequence, planReminders, queueChangeNotice } from '@/lib/admin/meeting-reminders'
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
 *
 * „Schůzka domluvena" (`recordArrangedMeeting`) je jen krok 2: termín, který
 * Kryštof s klientem domluvil jinde, se zapíše bez Googlu a bez e-mailu.
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
  /** Připomínky e-mailem a SMS (R-137). Bez migrace 128 se tiše vynechají. */
  reminders?: boolean
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
  let leadId: string
  try {
    leadId = await writeMeeting(source, {
      outreachId: input.outreachId,
      eventId,
      start,
      end,
      title,
      description,
      nextAction: 'Schůzka přes Google Meet',
      meet,
      invite: inviteTo
        ? {
            to: inviteTo,
            subject: input.subject.trim().slice(0, 200),
            body: input.intro.trim().slice(0, 4000),
            demoUrl: source.demo_url,
          }
        : null,
    })
  } catch (err) {
    await deleteMeet(meet.googleEventId).catch((e) => console.error('[meeting] Úklid v Googlu selhal:', (e as Error).message))
    if ((err as { code?: string })?.code === '23P01') {
      return { ok: false, error: OVERLAP_ERROR }
    }
    throw err
  }

  if (input.reminders) {
    await applyMeetingSettings(eventId, { phone: normalizePhone(source.phone), remindersOn: true })
    await planReminders(eventId)
  }
  await rememberMeetingEmail(input.outreachId, inviteTo)

  return { ok: true, eventId, leadId, meetUrl: meet.meetUrl, inviteQueued: inviteTo !== null }
}

const OVERLAP_ERROR = 'V tu dobu už máte v kalendáři něco jiného.'

/**
 * E-mail, na který šla pozvánka, si kontakt firmy zapamatuje (R-141) — jen
 * když žádný neměl. Příště se předvyplní všude. Selhání schůzku nezruší.
 */
async function rememberMeetingEmail(outreachId: string, inviteTo: string | null): Promise<void> {
  try {
    const contactId = await syncOutreachContact(outreachId)
    if (contactId && inviteTo) await absorbIntoContact(contactId, { email: inviteTo, phone: null })
  } catch (err) {
    console.error('[meeting] zapamatování e-mailu u kontaktu selhalo', (err as Error).message)
  }
}

type OutreachSource = NonNullable<Awaited<ReturnType<typeof loadOutreachSource>>>

/**
 * Zápis schůzky do adminu jednou transakcí: kontakt v Hovorech (stávající,
 * nebo nový), událost v kalendáři a firma od asistenta převzatá. Společné
 * pro „Domluvit schůzku" (s Meetem a e-mailem) i „Schůzka domluvena" (jen
 * termín). Vrací id kontaktu v Hovorech; překryv termínů vyhodí `23P01`.
 */
async function writeMeeting(
  source: OutreachSource,
  m: {
    outreachId: string
    eventId: string
    start: Date
    end: Date
    title: string
    description: string
    nextAction: string
    meet: { googleEventId: string; meetUrl: string } | null
    invite: { to: string; subject: string; body: string; demoUrl: string | null } | null
  },
): Promise<string> {
  const existingLead = source.client_lead_id
  const leadId = existingLead ?? randomUUID()
  const { date, time } = isoToPragueDateAndTime(m.start.toISOString())

  const queries: AdminQuery[] = []
  if (existingLead) {
    // Kontakt smí mít jen jednu spárovanou událost (migrace 051) — starou odpojit.
    queries.push({ text: `UPDATE calendar_events SET lead_id = NULL WHERE lead_id = $1`, params: [leadId] })
  } else {
    const contactId =
      source.contact_id ??
      (await ensureContact({
        name: source.contact_name ?? source.company_name,
        company: source.company_name,
        email: source.email,
        phone: source.phone,
        source: 'growth-os',
        seenAt: m.start.toISOString(),
      }))
    if (contactId) await linkOutreachContact(m.outreachId, contactId)
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
        m.nextAction,
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
        m.eventId,
        m.title,
        m.description,
        m.start.toISOString(),
        m.end.toISOString(),
        DEFAULT_LEAD_ORIGIN,
        leadId,
        m.meet?.meetUrl ?? null,
        m.meet?.googleEventId ?? null,
        m.outreachId,
        m.invite ? 'pending' : null,
        m.invite?.to ?? null,
        m.invite?.subject ?? null,
        m.invite?.body ?? null,
        m.invite?.demoUrl ?? null,
        INVITE_DELAY_MS / 1000,
      ],
    },
    {
      text: `UPDATE client_leads
                SET calendar_event_id = $2, next_action = $3, next_action_type = 'meeting',
                    next_action_date = $4::date, next_action_time = $5::time
              WHERE id = $1`,
      params: [leadId, m.eventId, m.nextAction, date, time],
    },
    {
      text: `UPDATE outreach_leads
                SET handled_at = now(), handled_reason = 'prevzato',
                    client_lead_id = coalesce(client_lead_id, $2::uuid), updated_at = now()
              WHERE id = $1`,
      params: [m.outreachId, leadId],
    },
  )

  await adminDb.batch(queries)
  return leadId
}

export type ArrangedInput = {
  outreachId: string
  startsAt: string
  minutes: number
  /** Kde a o čem, volitelně. Jde do popisu události i do Hovorů. */
  note: string
}

export type ArrangedResult = { ok: true; eventId: string; leadId: string } | { ok: false; error: string }

/**
 * „Schůzka domluvena": s klientem je termín už domluvený (telefonem, osobně),
 * takže se jen zapíše — událost v kalendáři a kontakt v Hovorech. Žádný
 * Google ani e-mail. „Zpět" je stejné jako u schůzky s Meetem (`cancelMeeting`).
 */
export async function recordArrangedMeeting(input: ArrangedInput): Promise<ArrangedResult> {
  const start = new Date(input.startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Neplatný čas schůzky.' }
  if (start.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: 'Schůzka nemůže být v minulosti.' }
  const minutes = Math.round(input.minutes)
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { ok: false, error: 'Délka schůzky musí být 15 až 180 minut.' }
  const end = new Date(start.getTime() + minutes * 60_000)

  const source = await loadOutreachSource(input.outreachId)
  if (!source) return { ok: false, error: 'Firma nenalezena.' }

  const note = input.note.trim().slice(0, 300)
  const description = [
    note || null,
    source.contact_name ? `Kontakt: ${source.contact_name}` : null,
    source.phone ? `Telefon: ${source.phone}` : null,
    source.demo_url ? `Ukázka: ${source.demo_url}` : null,
    'Domluveno s klientem, firma od AI asistenta (Growth OS).',
  ]
    .filter(Boolean)
    .join('\n')

  const eventId = randomUUID()
  try {
    const leadId = await writeMeeting(source, {
      outreachId: input.outreachId,
      eventId,
      start,
      end,
      title: `Schůzka: ${source.company_name}`.slice(0, 120),
      description,
      nextAction: note ? `Schůzka — ${note}`.slice(0, 200) : 'Schůzka',
      meet: null,
      invite: null,
    })
    return { ok: true, eventId, leadId }
  } catch (err) {
    if ((err as { code?: string })?.code === '23P01') return { ok: false, error: OVERLAP_ERROR }
    throw err
  }
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
  /** Ruční „Poslat znovu": jiný klíč, jinak by Resend do 24 h e-mail podruhé neposlal. */
  keySuffix?: string,
): Promise<SendInviteResult> {
  const rows = await adminDb<{
    invite_to: string
    invite_subject: string
    invite_body: string
    invite_demo_url: string | null
    meet_url: string
    starts_at: string | Date
    ends_at: string | Date
    reminders_on: string | null
    meeting_phone: string | null
  }>`
    UPDATE calendar_events SET invite_status = 'sending'
     WHERE id = ${eventId} AND invite_status = 'pending' AND invite_send_after <= now()
    RETURNING invite_to, invite_subject, invite_body, invite_demo_url, meet_url, starts_at, ends_at,
              -- Přes to_jsonb, ať pozvánka odejde i bez migrace 128.
              to_jsonb(calendar_events) ->> 'reminders_on' AS reminders_on,
              to_jsonb(calendar_events) ->> 'meeting_phone' AS meeting_phone
  `
  const row = rows[0]
  if (!row) return 'skipped'

  const startsAt = new Date(row.starts_at).toISOString()
  const minutes = Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000)
  let result: Awaited<ReturnType<typeof sendVizeonMail>>
  try {
    const remindersOn = row.reminders_on === 'true'
    const { text, html } = renderMeetingEmail({
      intro: row.invite_body,
      startsAt,
      minutes,
      meetUrl: row.meet_url,
      demoUrl: row.invite_demo_url,
      note: remindersOn ? remindersNote(Boolean(row.meeting_phone)) : null,
    })
    // Soubor do kalendáře (R-137): klient si schůzku uloží i s vlastní připomínkou.
    const ics = buildMeetingIcs({
      eventId,
      startsAt,
      endsAt: new Date(row.ends_at).toISOString(),
      title: 'Schůzka s Kryštofem Sobotkou (VIZEON)',
      meetUrl: row.meet_url,
      description: `Připojit se: ${row.meet_url}`,
      sequence: icsSequence(),
    })
    result = await send({
      to: row.invite_to,
      subject: row.invite_subject,
      text,
      html,
      idempotencyKey: keySuffix ? `meeting-invite:${eventId}:${keySuffix}` : `meeting-invite:${eventId}`,
      attachments: [
        { filename: 'schuzka.ics', contentType: 'text/calendar; charset=utf-8; method=PUBLISH', content: Buffer.from(ics, 'utf8') },
      ],
    })
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

/**
 * „Poslat znovu" u pozvánky, která neodešla, nebo podle webhooku Resendu
 * nedorazila (R-146) — na adresu, která je u schůzky teď (oprava v Kontaktech
 * se do budoucích schůzek propisuje, R-141). Doručenou pozvánku znovu neposílá.
 */
export async function retryInvite(
  eventId: string,
  send: typeof sendVizeonMail = sendVizeonMail,
): Promise<SendInviteResult> {
  try {
    await adminDb`
      UPDATE calendar_events e
         SET invite_status = 'pending', invite_send_after = now(), invite_error = NULL
       WHERE e.id = ${eventId}
         AND (e.invite_status = 'failed'
              OR (e.invite_status = 'sent' AND EXISTS (
                    SELECT 1 FROM email_deliveries d
                     WHERE d.provider_id = e.invite_provider_id
                       AND d.status IN ('bounced', 'failed', 'suppressed'))))
    `
  } catch (err) {
    // Bez migrace 135 jde znovu poslat jen pozvánka, která neodešla.
    if ((err as { code?: string })?.code !== '42P01') throw err
    await adminDb`
      UPDATE calendar_events SET invite_status = 'pending', invite_send_after = now(), invite_error = NULL
       WHERE id = ${eventId} AND invite_status = 'failed'
    `
  }
  return sendDueInvite(eventId, send, `znovu-${Date.now()}`)
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

// ─── Schůzka přímo z kalendáře (R-137) ────────────────────────────────────────
// Přepínač „Schůzka přes Google Meet" v okně události. Pořadí je stejné jako
// u schůzky z AI asistenta: Google → admin v jedné transakci → pozvánka po
// odkladu na „Zpět" → připomínky ve frontě `meeting_reminders`.

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42703'
}

/**
 * Telefon pro SMS a zapnutí připomínek u události. Bez migrace 128 nedělá
 * nic, ať schůzka z AI asistenta funguje i bez ní.
 */
export async function applyMeetingSettings(
  eventId: string,
  settings: { phone: string | null; remindersOn: boolean; email?: string | null },
): Promise<void> {
  try {
    await adminDb`
      UPDATE calendar_events
         SET meeting_phone = ${settings.phone},
             reminders_on = ${settings.remindersOn},
             invite_to = COALESCE(${settings.email ?? null}::text, invite_to)
       WHERE id = ${eventId}
    `
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
}

export type MeetingDraft = {
  /** E-mail klienta, kam jde pozvánka a připomínky. */
  email: string
  /** Telefon pro SMS v mezinárodním tvaru, nebo `null` = bez SMS. */
  phone: string | null
  subject: string
  intro: string
  demoUrl: string | null
  reminders: boolean
}

export type CalendarMeetingInput = MeetingDraft & {
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  contactName: string | null
  /** Telefon tak, jak ho Kryštof napsal — do Hovorů. */
  phoneRaw: string | null
}

export type MeetingSetupResult = { ok: true; eventId: string; meetUrl: string } | { ok: false; error: string }

function checkMeetingTime(startsAt: string, endsAt: string): string | null {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Neplatný čas schůzky.'
  if (start < Date.now() - 5 * 60_000) return 'Schůzka nemůže být v minulosti.'
  if (end <= start) return 'Čas konce musí být po čase začátku.'
  if (end - start > 12 * 3_600_000) return 'Schůzka může trvat nejvýš 12 hodin.'
  return null
}

/** Nová událost v kalendáři rovnou jako schůzka s Google Meet. */
export async function scheduleCalendarMeeting(
  input: CalendarMeetingInput,
  deps: Deps = {},
): Promise<MeetingSetupResult> {
  const createMeet = deps.createMeet ?? createMeetEvent
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent
  const timeError = checkMeetingTime(input.startsAt, input.endsAt)
  if (timeError) return { ok: false, error: timeError }

  const title = input.title.trim().slice(0, 120)
  const description = input.description?.trim() || null

  let meet: { googleEventId: string; meetUrl: string }
  try {
    meet = await createMeet({
      title,
      description: [description, input.contactName ? `Kontakt: ${input.contactName}` : null, `E-mail: ${input.email}`]
        .filter(Boolean)
        .join('\n'),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const eventId = randomUUID()
  const leadId = randomUUID()
  const { date, time } = isoToPragueDateAndTime(input.startsAt)
  try {
    const contactId = await ensureContact({
      name: input.contactName,
      email: input.email,
      phone: input.phoneRaw,
      source: 'manual',
      seenAt: input.startsAt,
    })
    // Kontakt v Hovorech nejdřív (událost na něj ukazuje), pak událost, pak
    // zpětný odkaz — v jedné transakci, takže vznikne všechno, nebo nic.
    await adminDb.batch([
      {
        text: `INSERT INTO client_leads (id, company_name, contact_name, phone, email, lead_status, next_action,
                                         next_action_type, next_action_date, next_action_time, contact_id)
               VALUES ($1, $2, $3, $4, $5, 'cold', $6, 'meeting', $7::date, $8::time, $9)`,
        params: [
          leadId,
          title,
          input.contactName,
          input.phoneRaw,
          input.email,
          description ?? 'Schůzka přes Google Meet',
          date,
          time,
          contactId,
        ],
      },
      {
        text: `INSERT INTO calendar_events (id, title, description, starts_at, ends_at, event_type, lead_origin, lead_id,
                                            meet_url, google_event_id, invite_status, invite_to, invite_subject,
                                            invite_body, invite_demo_url, invite_send_after, meeting_phone, reminders_on)
               VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, $8, $9, 'pending', $10, $11, $12, $13,
                       now() + make_interval(secs => $14), $15, $16)`,
        params: [
          eventId,
          title,
          description,
          input.startsAt,
          input.endsAt,
          DEFAULT_LEAD_ORIGIN,
          leadId,
          meet.meetUrl,
          meet.googleEventId,
          input.email,
          input.subject.trim().slice(0, 200),
          input.intro.trim().slice(0, 4000),
          input.demoUrl,
          INVITE_DELAY_MS / 1000,
          input.phone,
          input.reminders,
        ],
      },
      {
        text: `UPDATE client_leads SET calendar_event_id = $2 WHERE id = $1`,
        params: [leadId, eventId],
      },
    ])
  } catch (err) {
    await deleteMeet(meet.googleEventId).catch((e) => console.error('[meeting] Úklid v Googlu selhal:', (e as Error).message))
    if ((err as { code?: string })?.code === '23P01') return { ok: false, error: 'Tento termín se překrývá s jinou událostí v kalendáři.' }
    throw err
  }

  await planReminders(eventId)
  return { ok: true, eventId, meetUrl: meet.meetUrl }
}

/** Existující událost se stane schůzkou: odkaz na Meet, pozvánka, připomínky. */
export async function convertEventToMeeting(
  eventId: string,
  draft: MeetingDraft,
  deps: Deps = {},
): Promise<MeetingSetupResult> {
  const createMeet = deps.createMeet ?? createMeetEvent
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent

  const [event] = await adminDb<{ title: string; description: string | null; starts_at: string | Date; ends_at: string | Date; meet_url: string | null }>`
    SELECT title, description, starts_at, ends_at, meet_url
      FROM calendar_events WHERE id = ${eventId} AND event_type = 'manual'
  `
  if (!event) return { ok: false, error: 'Událost nenalezena.' }
  if (event.meet_url) return { ok: false, error: 'Tahle událost už schůzka je.' }
  const startsAt = new Date(event.starts_at).toISOString()
  const endsAt = new Date(event.ends_at).toISOString()
  const timeError = checkMeetingTime(startsAt, endsAt)
  if (timeError) return { ok: false, error: timeError }

  let meet: { googleEventId: string; meetUrl: string }
  try {
    meet = await createMeet({
      title: event.title,
      description: [event.description, `E-mail: ${draft.email}`].filter(Boolean).join('\n'),
      startsAt,
      endsAt,
    })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const updated = await adminDb<{ id: string }>`
    UPDATE calendar_events
       SET meet_url = ${meet.meetUrl}, google_event_id = ${meet.googleEventId},
           invite_status = 'pending', invite_to = ${draft.email},
           invite_subject = ${draft.subject.trim().slice(0, 200)}, invite_body = ${draft.intro.trim().slice(0, 4000)},
           invite_demo_url = ${draft.demoUrl}, invite_error = NULL,
           invite_send_after = now() + make_interval(secs => ${INVITE_DELAY_MS / 1000}),
           meeting_phone = ${draft.phone}, reminders_on = ${draft.reminders}
     WHERE id = ${eventId} AND meet_url IS NULL
    RETURNING id::text
  `
  if (!updated[0]) {
    await deleteMeet(meet.googleEventId).catch(() => {})
    return { ok: false, error: 'Tahle událost už schůzka je.' }
  }
  await planReminders(eventId)
  return { ok: true, eventId, meetUrl: meet.meetUrl }
}

/**
 * Po změně události, která je schůzkou (R-137): přesun v Googlu a nový plán
 * připomínek. Volá ji `updateCalendarEvent`, takže to platí pro okno kalendáře
 * i pro asistenta. Zprávu klientovi o změně posílá jen na výslovné přání.
 * Selhání Googlu změnu v adminu nevrací — vrátí jen varování.
 */
export async function syncMeetingAfterEdit(
  eventId: string,
  change: { timeChanged: boolean; notifyClient: boolean },
  deps: { moveMeet?: typeof moveGoogleEvent } = {},
): Promise<{ warning: string | null; noticeQueued: boolean }> {
  const moveMeet = deps.moveMeet ?? moveGoogleEvent
  const rows = await adminDb<{ title: string; starts_at: string | Date; ends_at: string | Date; meet_url: string | null; google_event_id: string | null }>`
    SELECT title, starts_at, ends_at, meet_url, google_event_id FROM calendar_events WHERE id = ${eventId}
  `
  const event = rows[0]
  if (!event?.meet_url) return { warning: null, noticeQueued: false }

  let warning: string | null = null
  if (change.timeChanged && event.google_event_id) {
    try {
      await moveMeet(event.google_event_id, {
        startsAt: new Date(event.starts_at).toISOString(),
        endsAt: new Date(event.ends_at).toISOString(),
      })
    } catch (err) {
      console.error('[meeting] Přesun v Googlu selhal:', (err as Error).message)
      warning = 'V Google Kalendáři se čas nezměnil. Upravte ho tam prosím ručně.'
    }
  }
  await planReminders(eventId)
  const noticeQueued = change.timeChanged && change.notifyClient ? await queueChangeNotice(eventId) : false
  return { warning, noticeQueued }
}

/**
 * „Zpět" do odeslání pozvánky u schůzky z kalendáře. `delete` smaže celou
 * nově založenou událost i s kontaktem v Hovorech, `revert` vrátí existující
 * událost na obyčejnou. Po odeslání pozvánky už nejde.
 */
export async function undoMeetingSetup(
  eventId: string,
  mode: 'delete' | 'revert',
  deps: Deps = {},
): Promise<CancelResult> {
  const deleteMeet = deps.deleteMeet ?? deleteGoogleEvent
  const sentError = 'Pozvánka už klientovi odešla. Schůzku zrušte v kalendáři a dejte mu vědět.'
  const [row] = await adminDb<{ google_event_id: string | null }>`
    SELECT google_event_id FROM calendar_events
     WHERE id = ${eventId} AND outreach_lead_id IS NULL
       AND (invite_status IS NULL OR invite_status IN ('pending', 'cancelled', 'failed'))
  `
  if (!row) return { ok: false, error: sentError }

  if (mode === 'delete') {
    const deleted = await adminDb<{ id: string }>`
      WITH ev AS (
        DELETE FROM calendar_events
         WHERE id = ${eventId} AND outreach_lead_id IS NULL
           AND (invite_status IS NULL OR invite_status IN ('pending', 'cancelled', 'failed'))
        RETURNING id, lead_id
      ), ld AS (
        DELETE FROM client_leads WHERE id IN (SELECT lead_id FROM ev) OR calendar_event_id IN (SELECT id FROM ev)
        RETURNING id
      )
      SELECT id::text FROM ev
    `
    if (!deleted[0]) return { ok: false, error: sentError }
  } else {
    const reverted = await adminDb<{ id: string }>`
      UPDATE calendar_events
         SET meet_url = NULL, google_event_id = NULL, invite_status = NULL, invite_to = NULL,
             invite_subject = NULL, invite_body = NULL, invite_demo_url = NULL, invite_send_after = NULL,
             invite_error = NULL, meeting_phone = NULL, reminders_on = false
       WHERE id = ${eventId} AND outreach_lead_id IS NULL
         AND (invite_status IS NULL OR invite_status IN ('pending', 'cancelled', 'failed'))
      RETURNING id::text
    `
    if (!reverted[0]) return { ok: false, error: sentError }
    await adminDb`DELETE FROM meeting_reminders WHERE event_id = ${eventId}`
  }

  if (row.google_event_id) {
    await deleteMeet(row.google_event_id).catch((e) =>
      console.error('[meeting] Smazání v Googlu selhalo:', (e as Error).message),
    )
  }
  return { ok: true }
}
