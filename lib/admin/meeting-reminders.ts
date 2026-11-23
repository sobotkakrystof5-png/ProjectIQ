import 'server-only'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import {
  reminderIntro,
  reminderSms,
  reminderSubject,
  renderMeetingEmail,
  type ReminderKind,
} from '@/lib/admin/meeting-email'
import { buildMeetingIcs } from '@/lib/admin/meeting-ics'
import { sendSms, type SmsResult } from '@/lib/admin/sms'
import { sendVizeonMail, type SendResult } from '@/lib/admin/vizeon-mail'
import { createNotification } from '@/lib/notifications'

/**
 * Připomínky schůzek e-mailem a SMS (R-137, migrace 128).
 *
 * Plán: den předem e-mail a SMS, hodinu předem e-mail, 10 minut předem SMS.
 * Každá zpráva je řádek ve frontě `meeting_reminders`; text se skládá až při
 * odeslání z aktuálního času schůzky, takže přesun termínu stačí promítnout
 * do `send_at` (`planReminders`).
 *
 * Odesílá `processDueReminders`, kterou každou minutu volá externí cron přes
 * `/api/cron/meeting-reminders` (Vercel Hobby pustí cron jen jednou denně,
 * R-006). Řádek si zamkne jeden UPDATE `pending` → `sending`, takže zpráva
 * neodejde dvakrát ani při dvou souběžných bězích. SMS se nikdy neposílá
 * znovu naslepo: řádek, který zůstal viset v `sending`, skončí jako `failed`.
 */

export type Channel = 'email' | 'sms'
type StepKind = Exclude<ReminderKind, 'changed'>

export const REMINDER_STEPS: { kind: StepKind; channel: Channel; minutesBefore: number }[] = [
  { kind: 'h24', channel: 'email', minutesBefore: 24 * 60 },
  { kind: 'h24', channel: 'sms', minutesBefore: 24 * 60 },
  { kind: 'h1', channel: 'email', minutesBefore: 60 },
  { kind: 'm10', channel: 'sms', minutesBefore: 10 },
]

/**
 * Připomínka, která by přišla dřív než tolik minut od naplánování, se
 * přeskočí: klient právě dostal pozvánku nebo zprávu o změně a další zpráva
 * hned za ní by byla otravná. U 10minutové jen pojistka proti minulosti.
 */
const SKIP_IF_SOONER_MIN: Record<StepKind, number> = { h24: 6 * 60, h1: 15, m10: 0 }

/**
 * Nejpozději kolik minut před začátkem smí zpožděná zpráva ještě odejít
 * (spouštěč chvíli neběžel). Pozdější by klienta mátla.
 */
const LATEST_BEFORE_START_MIN: Record<ReminderKind, number> = { h24: 3 * 60, h1: 15, m10: 0, changed: 0 }

const MAX_ATTEMPTS = 3
/** Spouštěč, který se neozval déle, se považuje za zastavený. */
export const TICK_STALE_MS = 10 * 60_000

export type PlannedReminder = { kind: StepKind; channel: Channel; sendAt: Date; status: 'pending' | 'skipped' }

/** Čistý plán připomínek pro jeden termín. Kanál bez kontaktu se vynechá. */
export function reminderPlan(
  startsAt: Date,
  now: Date,
  contacts: { email: boolean; sms: boolean },
): PlannedReminder[] {
  return REMINDER_STEPS.filter((s) => (s.channel === 'email' ? contacts.email : contacts.sms)).map((s) => {
    const sendAt = new Date(startsAt.getTime() - s.minutesBefore * 60_000)
    const tooSoon = sendAt.getTime() < now.getTime() + SKIP_IF_SOONER_MIN[s.kind] * 60_000
    return { kind: s.kind, channel: s.channel, sendAt, status: tooSoon ? 'skipped' : 'pending' }
  })
}

/** Smí zpráva ještě odejít? Po začátku schůzky (a u denní dřív) už ne. */
export function stillUseful(kind: ReminderKind, startsAt: Date, now: Date): boolean {
  return now.getTime() <= startsAt.getTime() - LATEST_BEFORE_START_MIN[kind] * 60_000
}

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42703'
}

type EventForPlan = {
  starts_at: string | Date
  meet_url: string | null
  invite_to: string | null
  meeting_phone: string | null
  reminders_on: boolean
}

/**
 * Srovná frontu s aktuálním stavem schůzky: nový čas, přidaný nebo smazaný
 * kontakt, vypnuté připomínky. Řádek, kterému se čas nezměnil, nechá být —
 * odeslaná připomínka tak po úpravě názvu neodejde znovu. Bez migrace 128
 * nedělá nic.
 */
export async function planReminders(eventId: string, now: Date = new Date()): Promise<void> {
  let event: EventForPlan | undefined
  try {
    ;[event] = await adminDb<EventForPlan>`
      SELECT starts_at, meet_url, invite_to, meeting_phone, reminders_on
        FROM calendar_events WHERE id = ${eventId}
    `
  } catch (err) {
    if (isMissingSchema(err)) return
    throw err
  }
  if (!event) return

  const active = event.reminders_on && Boolean(event.meet_url)
  const plan = active
    ? reminderPlan(new Date(event.starts_at), now, { email: Boolean(event.invite_to), sms: Boolean(event.meeting_phone) })
    : []

  const queries: AdminQuery[] = []
  for (const step of REMINDER_STEPS) {
    const planned = plan.find((p) => p.kind === step.kind && p.channel === step.channel)
    if (!planned) {
      queries.push({
        text: `UPDATE meeting_reminders SET status = 'cancelled', updated_at = now()
                WHERE event_id = $1 AND kind = $2 AND channel = $3 AND status = 'pending'`,
        params: [eventId, step.kind, step.channel],
      })
      continue
    }
    queries.push({
      text: `INSERT INTO meeting_reminders (event_id, kind, channel, send_at, status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (event_id, kind, channel) DO UPDATE
                SET send_at = EXCLUDED.send_at, status = EXCLUDED.status, attempts = 0,
                    sent_at = NULL, provider_id = NULL, error = NULL, updated_at = now()
              WHERE meeting_reminders.status <> 'sending'
                AND (meeting_reminders.send_at IS DISTINCT FROM EXCLUDED.send_at
                     OR meeting_reminders.status = 'cancelled')`,
      params: [eventId, step.kind, step.channel, planned.sendAt.toISOString(), planned.status],
    })
  }
  await adminDb.batch(queries)
}

/**
 * Zpráva klientovi, že se schůzka přesunula (R-137). Jen když už dostal
 * pozvánku; dokud pozvánka čeká na odeslání, přečte si nový čas sama.
 * Vrací, jestli se něco zařadilo.
 */
export async function queueChangeNotice(eventId: string): Promise<boolean> {
  try {
    const rows = await adminDb<{ n: number }>`
      WITH ev AS (
        SELECT id, invite_to, meeting_phone FROM calendar_events
         WHERE id = ${eventId} AND meet_url IS NOT NULL AND invite_status = 'sent'
      ), ins AS (
        INSERT INTO meeting_reminders (event_id, kind, channel, send_at, status)
        SELECT ev.id, 'changed', ch.channel, now(), 'pending'
          FROM ev
          CROSS JOIN (VALUES ('email'), ('sms')) AS ch(channel)
         WHERE (ch.channel = 'email' AND ev.invite_to IS NOT NULL)
            OR (ch.channel = 'sms' AND ev.meeting_phone IS NOT NULL)
        ON CONFLICT (event_id, kind, channel) DO UPDATE
           SET send_at = now(), status = 'pending', attempts = 0, sent_at = NULL,
               provider_id = NULL, error = NULL, updated_at = now()
         WHERE meeting_reminders.status <> 'sending'
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM ins
    `
    return (rows[0]?.n ?? 0) > 0
  } catch (err) {
    if (isMissingSchema(err)) return false
    throw err
  }
}

type Claimed = {
  id: string
  event_id: string
  kind: ReminderKind
  channel: Channel
  attempts: number
  send_at: string | Date
  starts_at: string | Date
  ends_at: string | Date
  title: string
  meet_url: string | null
  invite_to: string | null
  meeting_phone: string | null
  invite_demo_url: string | null
  reminders_on: boolean
}

export type ReminderSenders = {
  mail?: typeof sendVizeonMail
  sms?: (input: { to: string; text: string }) => Promise<SmsResult>
  notify?: typeof createNotification
}

export type TickResult = { sent: number; failed: number; skipped: number }

/** Pořadí verze souboru do kalendáře: minuty od roku 2020, takže každá další zpráva má vyšší. */
export function icsSequence(now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.UTC(2020, 0, 1)) / 60_000)
}

async function deliver(row: Claimed, now: Date, senders: Required<ReminderSenders>): Promise<SmsResult | SendResult> {
  const startsAt = new Date(row.starts_at).toISOString()
  const meetUrl = row.meet_url as string
  if (row.channel === 'sms') {
    return senders.sms({ to: row.meeting_phone as string, text: reminderSms(row.kind, startsAt, meetUrl, now) })
  }
  const minutes = Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000)
  const { text, html } = renderMeetingEmail({
    intro: reminderIntro(row.kind, startsAt, now),
    startsAt,
    minutes,
    meetUrl,
    demoUrl: row.invite_demo_url,
  })
  const attachments =
    row.kind === 'changed'
      ? [
          {
            filename: 'schuzka.ics',
            contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            content: Buffer.from(
              buildMeetingIcs({
                eventId: row.event_id,
                startsAt,
                endsAt: new Date(row.ends_at).toISOString(),
                title: 'Schůzka s Kryštofem Sobotkou (VIZEON)',
                meetUrl,
                description: `Připojit se: ${meetUrl}`,
                sequence: icsSequence(now),
                now,
              }),
              'utf8',
            ),
          },
        ]
      : undefined
  return senders.mail({
    to: row.invite_to as string,
    subject: reminderSubject(row.kind, startsAt, now),
    text,
    html,
    // Nový čas = nový klíč; opakovaný pokus téže zprávy ale nic nezdvojí.
    idempotencyKey: `meeting-reminder:${row.id}:${new Date(row.send_at).toISOString()}`,
    attachments,
  })
}

/**
 * Pošle připomínky, kterým nadešel čas. Volá ji spouštěč každou minutu
 * a denní cron jako pojistku. Zapíše čas běhu do `admin_settings`.
 */
export async function processDueReminders(
  options: { now?: Date; limit?: number } & ReminderSenders = {},
): Promise<TickResult> {
  const senders: Required<ReminderSenders> = {
    mail: options.mail ?? sendVizeonMail,
    sms: options.sms ?? sendSms,
    notify: options.notify ?? createNotification,
  }
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const result: TickResult = { sent: 0, failed: 0, skipped: 0 }

  let claimed: Claimed[]
  try {
    // Zpráva, která zůstala viset rozeslaná napůl (spadlá funkce), se znovu
    // neposílá — u SMS by mohla přijít dvakrát. Kryštof uvidí, že neodešla.
    await adminDb`
      UPDATE meeting_reminders
         SET status = 'failed', error = 'Nejisté, jestli odešla. Odesílání se přerušilo.', updated_at = now()
       WHERE status = 'sending' AND updated_at < now() - interval '10 minutes'
    `
    claimed = await adminDb<Claimed>`
      UPDATE meeting_reminders r
         SET status = 'sending', attempts = r.attempts + 1, updated_at = now()
        FROM calendar_events e
       WHERE r.id IN (
               SELECT id FROM meeting_reminders
                WHERE status = 'pending' AND send_at <= now()
                ORDER BY send_at
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
             )
         AND e.id = r.event_id
      RETURNING r.id::text AS id, r.event_id::text AS event_id, r.kind, r.channel, r.attempts, r.send_at,
                e.starts_at, e.ends_at, e.title, e.meet_url, e.invite_to, e.meeting_phone,
                e.invite_demo_url, e.reminders_on
    `
  } catch (err) {
    if (isMissingSchema(err)) return result
    throw err
  }

  for (const row of claimed) {
    const now = options.now ?? new Date()
    const startsAt = new Date(row.starts_at)
    const recipient = row.channel === 'email' ? row.invite_to : row.meeting_phone

    // Čas schůzky se změnil bez nového plánu (cesta mimo `updateCalendarEvent`):
    // připomínka by přišla moc brzy, tak se jen posune na správný čas.
    const step = REMINDER_STEPS.find((st) => st.kind === row.kind)
    if (step) {
      const expected = new Date(startsAt.getTime() - step.minutesBefore * 60_000)
      if (expected.getTime() > now.getTime() + 5 * 60_000) {
        await adminDb`
          UPDATE meeting_reminders
             SET status = 'pending', send_at = ${expected.toISOString()}, attempts = 0, error = NULL, updated_at = now()
           WHERE id = ${row.id}
        `
        continue
      }
    }

    let skip: { status: 'skipped' | 'cancelled'; why: string } | null = null
    if (!row.meet_url) skip = { status: 'cancelled', why: 'Schůzka nemá odkaz na připojení.' }
    else if (row.kind !== 'changed' && !row.reminders_on) skip = { status: 'cancelled', why: 'Připomínky jsou vypnuté.' }
    else if (!recipient) skip = { status: 'cancelled', why: 'Chybí kontakt.' }
    else if (!stillUseful(row.kind, startsAt, now)) skip = { status: 'skipped', why: 'Na odeslání už bylo pozdě.' }

    if (skip) {
      await adminDb`
        UPDATE meeting_reminders SET status = ${skip.status}, error = ${skip.why}, updated_at = now()
         WHERE id = ${row.id}
      `
      result.skipped++
      continue
    }

    let sent: SmsResult | SendResult
    try {
      sent = await deliver(row, now, senders)
    } catch (err) {
      sent = { ok: false, error: (err as Error).message.slice(0, 300) }
    }

    if (sent.ok) {
      await adminDb`
        UPDATE meeting_reminders
           SET status = 'sent', sent_at = now(), provider_id = ${sent.id}, error = NULL, updated_at = now()
         WHERE id = ${row.id}
      `
      result.sent++
      continue
    }

    const retry = 'retry' in sent ? sent.retry : true
    if (retry && row.attempts < MAX_ATTEMPTS) {
      // Další pokus při příštím běhu spouštěče (za minutu).
      await adminDb`
        UPDATE meeting_reminders SET status = 'pending', error = ${sent.error.slice(0, 300)}, updated_at = now()
         WHERE id = ${row.id}
      `
      continue
    }
    await adminDb`
      UPDATE meeting_reminders SET status = 'failed', error = ${sent.error.slice(0, 300)}, updated_at = now()
       WHERE id = ${row.id}
    `
    result.failed++
    await senders.notify({
      type: 'meeting_reminder_failed',
      title: `Připomínka schůzky neodešla: ${row.title}`.slice(0, 200),
      body: `${row.channel === 'sms' ? 'SMS' : 'E-mail'}: ${sent.error}`.slice(0, 500),
      link: '/dashboard/calendar',
    })
  }

  try {
    await adminDb`UPDATE admin_settings SET reminders_tick_at = now() WHERE id`
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
  return result
}

/**
 * Denní pojistka (`send-reminders`): když čekají připomínky a spouštěč se
 * neozval přes `TICK_STALE_MS`, upozorní Kryštofa do zvonku. Vrací, jestli upozornil.
 */
export async function warnIfTriggerStopped(notify: typeof createNotification = createNotification): Promise<boolean> {
  let rows: { pending: number; tick: string | Date | null }[]
  try {
    rows = await adminDb<{ pending: number; tick: string | Date | null }>`
      SELECT (SELECT count(*)::int FROM meeting_reminders WHERE status = 'pending') AS pending,
             (SELECT reminders_tick_at FROM admin_settings WHERE id) AS tick
    `
  } catch (err) {
    if (isMissingSchema(err)) return false
    throw err
  }
  const { pending, tick } = rows[0] ?? { pending: 0, tick: null }
  if (pending === 0) return false
  if (tick && Date.now() - new Date(tick).getTime() < TICK_STALE_MS) return false
  await notify({
    type: 'meeting_reminder_failed',
    title: 'Připomínky schůzek teď neodcházejí',
    body: 'Spouštěč, který je posílá každou minutu, neběží. Zkontrolujte cron-job.org.',
    link: '/dashboard/calendar',
  })
  return true
}

export type ReminderRow = {
  kind: ReminderKind
  channel: Channel
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'
  sendAt: string
  sentAt: string | null
  error: string | null
}

export type MeetingStatus = {
  reminders: ReminderRow[]
  remindersOn: boolean
  /** Běží spouštěč? `null` = ještě nikdy neběžel. */
  triggerOk: boolean | null
}

/** Stav připomínek jedné schůzky pro detail v kalendáři. Bez migrace `null`. */
export async function loadMeetingStatus(eventId: string): Promise<MeetingStatus | null> {
  try {
    const [rows, meta] = await adminDb.batch([
      {
        text: `SELECT kind, channel, status, send_at, sent_at, error
                 FROM meeting_reminders WHERE event_id = $1
                ORDER BY send_at, channel`,
        params: [eventId],
      },
      {
        text: `SELECT (SELECT reminders_on FROM calendar_events WHERE id = $1) AS reminders_on,
                      (SELECT reminders_tick_at FROM admin_settings WHERE id) AS tick`,
        params: [eventId],
      },
    ])
    const m = meta[0] as { reminders_on: boolean | null; tick: string | Date | null } | undefined
    return {
      reminders: rows.map((r) => ({
        kind: r.kind as ReminderKind,
        channel: r.channel as Channel,
        status: r.status as ReminderRow['status'],
        sendAt: new Date(r.send_at as string).toISOString(),
        sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
        error: (r.error as string | null) ?? null,
      })),
      remindersOn: Boolean(m?.reminders_on),
      triggerOk: m?.tick ? Date.now() - new Date(m.tick).getTime() < TICK_STALE_MS : null,
    }
  } catch (err) {
    if (isMissingSchema(err)) return null
    throw err
  }
}

/** Je migrace 128 v databázi? Bez ní se přepínač schůzky v kalendáři neukáže. */
export async function remindersAvailable(): Promise<boolean> {
  try {
    await adminDb`SELECT 1 FROM meeting_reminders LIMIT 0`
    return true
  } catch (err) {
    if (isMissingSchema(err)) return false
    throw err
  }
}
