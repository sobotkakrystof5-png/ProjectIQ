import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Připomínky schůzek e-mailem a SMS (R-137) proti skutečnému Postgresu se SQL
 * z migrací 114, 115 a 128. Čisté funkce (plán, texty SMS, odpovědi Odoriku,
 * soubor do kalendáře) bez databáze.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  convertEventToMeeting,
  scheduleCalendarMeeting,
  sendDueInvite,
  syncMeetingAfterEdit,
  undoMeetingSetup,
} from '@/lib/admin/meetings'
import {
  planReminders,
  processDueReminders,
  queueChangeNotice,
  reminderPlan,
  stillUseful,
  warnIfTriggerStopped,
} from '@/lib/admin/meeting-reminders'
import { meetingOnDay, reminderSms, reminderSubject, relativeWhen } from '@/lib/admin/meeting-email'
import { buildMeetingIcs } from '@/lib/admin/meeting-ics'
import { odorikRecipient, parseOdorikResponse, toSmsText } from '@/lib/admin/sms'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL, company text, email text, phone text, source text,
  merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE client_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL, contact_name text, phone text, email text,
  lead_status text NOT NULL DEFAULT 'new',
  next_action text, next_action_type text, next_action_date date, next_action_time time,
  notes text, estimated_value numeric,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  event_type text NOT NULL DEFAULT 'manual' CHECK (event_type IN ('manual', 'block')),
  lead_origin text, project_id uuid,
  lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_leads ADD COLUMN calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;
`

const MEET = 'https://meet.google.com/abc-defg-hij'
const createMeet = vi.fn(async () => ({ googleEventId: 'g-1', meetUrl: MEET }))
const deleteMeet = vi.fn(async () => {})
const deps = { createMeet, deleteMeet }

const mail = vi.fn(async (_mail: unknown) => ({ ok: true as const, id: 'resend-1' }))
const sms = vi.fn(async (_input: { to: string; text: string }) => ({ ok: true as const, id: null }))
const notify = vi.fn(async (_n: unknown) => {})

function inDays(days: number, hourUtc = 13): Date {
  const d = new Date(Date.now() + days * 86_400_000)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d
}

function meetingInput(start: Date, extra: Record<string, unknown> = {}) {
  return {
    title: 'Schůzka s Novákem',
    description: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
    contactName: 'Jan Novák',
    phoneRaw: '777 000 111',
    email: 'jan@example.cz',
    phone: '+420777000111',
    subject: 'Naše schůzka',
    intro: 'Dobrý den,\n\ntěším se.',
    demoUrl: 'https://navrhy.vizeon.cz/novak/',
    reminders: true,
    ...extra,
  }
}

async function reminders(eventId: string) {
  return (
    await db.query<{ kind: string; channel: string; status: string; send_at: Date; attempts: number; error: string | null }>(
      `SELECT kind, channel, status, send_at, attempts, error FROM meeting_reminders WHERE event_id = $1 ORDER BY send_at, channel`,
      [eventId],
    )
  ).rows
}

const OFFSET_MIN: Record<string, number> = { h24: 24 * 60, h1: 60, m10: 10 }

/**
 * Připomínka je „na řadě": schůzka se posune tak, aby její čas vyšel minutu
 * zpátky, a řádek se srovná. Jen posunutý `send_at` by fronta správně vrátila
 * na skutečný čas (pojistka proti přesunu mimo kalendář).
 */
async function makeDue(eventId: string, kind: string) {
  await db.query(
    `UPDATE calendar_events SET starts_at = now() + make_interval(mins => $2 - 1),
                                ends_at = now() + make_interval(mins => $2 + 29)
      WHERE id = $1`,
    [eventId, OFFSET_MIN[kind]],
  )
  await db.query(`UPDATE meeting_reminders SET send_at = now() - interval '1 minute' WHERE event_id = $1 AND kind = $2`, [
    eventId,
    kind,
  ])
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const m of ['114_hovory_od_asistenta.sql', '115_schuzky_google_meet.sql', '128_schuzky_pripominky.sql']) {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotence
  }
  setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  for (const f of [createMeet, deleteMeet, mail, sms, notify]) f.mockClear()
  await db.exec(
    'DELETE FROM meeting_reminders; DELETE FROM calendar_events; DELETE FROM client_leads; DELETE FROM contacts; UPDATE admin_settings SET reminders_tick_at = NULL;',
  )
})

// ─── Čisté funkce ─────────────────────────────────────────────────────────────

describe('plán připomínek', () => {
  const now = new Date('2026-11-20T09:00:00Z')

  it('schůzka za tři dny: den předem e-mail a SMS, hodinu předem e-mail, 10 minut předem SMS', () => {
    const start = new Date('2026-11-23T14:00:00Z')
    const plan = reminderPlan(start, now, { email: true, sms: true })
    expect(plan.map((p) => `${p.kind}:${p.channel}:${p.status}`)).toEqual([
      'h24:email:pending',
      'h24:sms:pending',
      'h1:email:pending',
      'm10:sms:pending',
    ])
    expect(plan[0].sendAt.toISOString()).toBe('2026-11-22T14:00:00.000Z')
    expect(plan[3].sendAt.toISOString()).toBe('2026-11-23T13:50:00.000Z')
  })

  it('bez telefonu jen e-maily, bez e-mailu jen SMS', () => {
    const start = new Date('2026-11-23T14:00:00Z')
    expect(reminderPlan(start, now, { email: true, sms: false }).map((p) => p.channel)).toEqual(['email', 'email'])
    expect(reminderPlan(start, now, { email: false, sms: true }).map((p) => p.channel)).toEqual(['sms', 'sms'])
  })

  it('denní připomínka těsně po pozvánce se vynechá', () => {
    // Schůzka za 26 h: denní připomínka by přišla za 2 h po pozvánce.
    const plan = reminderPlan(new Date(now.getTime() + 26 * 3_600_000), now, { email: true, sms: true })
    expect(plan.filter((p) => p.kind === 'h24').every((p) => p.status === 'skipped')).toBe(true)
    expect(plan.filter((p) => p.kind !== 'h24').every((p) => p.status === 'pending')).toBe(true)
  })

  it('schůzka za půl hodiny: zbude jen SMS 10 minut předem', () => {
    const plan = reminderPlan(new Date(now.getTime() + 30 * 60_000), now, { email: true, sms: true })
    expect(plan.filter((p) => p.status === 'pending').map((p) => p.kind)).toEqual(['m10'])
  })

  it('zpožděná zpráva po začátku schůzky (a denní pozdě) už neodejde', () => {
    const start = new Date('2026-11-20T12:00:00Z')
    expect(stillUseful('m10', start, new Date('2026-11-20T11:59:00Z'))).toBe(true)
    expect(stillUseful('m10', start, new Date('2026-11-20T12:01:00Z'))).toBe(false)
    expect(stillUseful('h24', start, new Date('2026-11-20T08:00:00Z'))).toBe(true)
    expect(stillUseful('h24', start, new Date('2026-11-20T10:00:00Z'))).toBe(false)
  })
})

describe('texty', () => {
  it('„zítra" a „dnes" podle pražského dne', () => {
    const now = new Date('2026-11-19T20:00:00Z') // 21:00 v Praze
    expect(relativeWhen('2026-11-20T14:00:00Z', now)).toBe('zítra v 15:00')
    expect(relativeWhen('2026-11-19T21:30:00Z', now)).toBe('dnes v 22:30')
    expect(reminderSubject('h24', '2026-11-20T14:00:00Z', now)).toBe('Připomínka: naše schůzka zítra v 15:00')
  })

  it('den v týdnu s předložkou a ve 4. pádě', () => {
    expect(meetingOnDay('2026-11-19T14:00:00Z')).toBe('ve čtvrtek 19. listopadu v 15:00')
    expect(meetingOnDay('2026-11-18T14:00:00Z')).toBe('ve středu 18. listopadu v 15:00')
    expect(meetingOnDay('2026-11-20T14:00:00Z')).toBe('v pátek 20. listopadu v 15:00')
    expect(meetingOnDay('2026-11-21T14:00:00Z')).toBe('v sobotu 21. listopadu v 15:00')
    expect(meetingOnDay('2026-11-22T14:00:00Z')).toBe('v neděli 22. listopadu v 15:00')
    expect(meetingOnDay('2026-11-23T08:00:00Z')).toBe('v pondělí 23. listopadu v 9:00')
    expect(meetingOnDay('2026-11-24T08:00:00Z')).toBe('v úterý 24. listopadu v 9:00')
    expect(reminderSubject('changed', '2026-11-18T14:00:00Z', new Date('2026-11-10T10:00:00Z'))).toBe(
      'Schůzku přesouváme na středu 18. listopadu v 15:00',
    )
  })

  it('SMS je bez diakritiky, vejde se do jedné zprávy a odkaz neusekne', () => {
    const now = new Date('2026-11-19T14:00:00Z')
    for (const kind of ['h24', 'h1', 'm10', 'changed'] as const) {
      const at = kind === 'm10' ? '2026-11-19T14:10:00Z' : kind === 'h1' ? '2026-11-19T15:00:00Z' : '2026-11-20T14:00:00Z'
      const text = toSmsText(reminderSms(kind, at, MEET, now))
      expect(text.length).toBeLessThanOrEqual(160)
      expect(text).toContain(MEET)
      expect(text).not.toMatch(/[^\x20-\x7e\n]/)
    }
    expect(toSmsText(reminderSms('m10', '2026-11-19T14:10:00Z', MEET, now))).toMatch(/^Za 10 minut zaciname \(15:10\)/)
  })

  it('toSmsText převede pomlčky a uvozovky a zkrátí přes 160 znaků', () => {
    expect(toSmsText('Schůzka – „zítra" … ok')).toBe('Schuzka - "zitra" ... ok')
    expect(toSmsText('x'.repeat(200))).toHaveLength(160)
  })
})

describe('Odorik', () => {
  it('číslo převede na 00420…', () => {
    expect(odorikRecipient('+420777000111')).toBe('00420777000111')
    expect(odorikRecipient('777000111')).toBeNull()
  })

  it('čte odpovědi z dokumentace', () => {
    expect(parseOdorikResponse(200, 'successfully_sent 132.45')).toEqual({ ok: true, id: null })
    expect(parseOdorikResponse(200, 'successfully_enqueued')).toEqual({ ok: true, id: null })
    expect(parseOdorikResponse(200, 'error low_balance')).toMatchObject({ ok: false, retry: false })
    expect(parseOdorikResponse(200, 'error gateway_failed')).toMatchObject({ ok: false, retry: true })
    expect(parseOdorikResponse(200, 'error authentication_failed')).toMatchObject({ ok: false, retry: false })
    expect(parseOdorikResponse(502, '')).toMatchObject({ ok: false, retry: true })
  })
})

describe('soubor do kalendáře', () => {
  it('má UID schůzky, čas v UTC, alarm a řádky do 75 bajtů', () => {
    const ics = buildMeetingIcs({
      eventId: '11111111-2222-3333-4444-555555555555',
      startsAt: '2026-11-20T14:00:00Z',
      endsAt: '2026-11-20T14:30:00Z',
      title: 'Schůzka s Kryštofem Sobotkou (VIZEON)',
      meetUrl: MEET,
      description: `Připojit se: ${MEET}; a ještě dlouhý text, který se musí zalomit, protože je delší než povolených 75 bajtů na řádek`,
      sequence: 7,
      now: new Date('2026-11-19T10:00:00Z'),
    })
    expect(ics).toContain('UID:schuzka-11111111-2222-3333-4444-555555555555@vizeon.cz')
    expect(ics).toContain('DTSTART:20261120T140000Z')
    expect(ics).toContain('SEQUENCE:7')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('\\;')
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
  })
})

// ─── Databáze ─────────────────────────────────────────────────────────────────

describe('schůzka z kalendáře', () => {
  it('založí Meet, událost s pozvánkou, kontakt v Hovorech a čtyři připomínky', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    expect(result).toMatchObject({ ok: true, meetUrl: MEET })
    if (!result.ok) return

    const ev = await db.query<{ meet_url: string; invite_status: string; invite_to: string; meeting_phone: string; reminders_on: boolean; lead_ok: boolean }>(
      `SELECT e.meet_url, e.invite_status, e.invite_to, e.meeting_phone, e.reminders_on,
              (l.calendar_event_id = e.id) AS lead_ok
         FROM calendar_events e JOIN client_leads l ON l.id = e.lead_id`,
    )
    expect(ev.rows[0]).toMatchObject({
      meet_url: MEET,
      invite_status: 'pending',
      invite_to: 'jan@example.cz',
      meeting_phone: '+420777000111',
      reminders_on: true,
      lead_ok: true,
    })
    expect((await reminders(result.eventId)).map((r) => `${r.kind}:${r.channel}:${r.status}`)).toEqual([
      'h24:email:pending',
      'h24:sms:pending',
      'h1:email:pending',
      'm10:sms:pending',
    ])
  })

  it('bez připomínek vznikne jen pozvánka', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3), { reminders: false }), deps)
    if (!result.ok) throw new Error(result.error)
    expect(await reminders(result.eventId)).toHaveLength(0)
  })

  it('překryv s jiným termínem uklidí událost v Googlu', async () => {
    const start = inDays(3)
    await db.query(
      `INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ('Jiné', $1, $2)`,
      [start.toISOString(), new Date(start.getTime() + 3_600_000).toISOString()],
    )
    // Testová tabulka nemá EXCLUDE z migrace 043; překryv nasimulujeme
    // pádem vložení s kódem 23P01.
    await db.exec(`
      CREATE OR REPLACE FUNCTION fail_overlap() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RAISE EXCEPTION 'overlap' USING ERRCODE = '23P01'; END $f$;
      CREATE TRIGGER t_overlap BEFORE INSERT ON calendar_events FOR EACH ROW
        WHEN (NEW.meet_url IS NOT NULL) EXECUTE FUNCTION fail_overlap();
    `)
    try {
      const result = await scheduleCalendarMeeting(meetingInput(start), deps)
      expect(result).toEqual({ ok: false, error: 'Tento termín se překrývá s jinou událostí v kalendáři.' })
      expect(deleteMeet).toHaveBeenCalledWith('g-1')
      expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(0)
    } finally {
      await db.exec('DROP TRIGGER t_overlap ON calendar_events; DROP FUNCTION fail_overlap();')
    }
  })

  it('pozvánka má přílohu .ics a větu o připomínkách', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE calendar_events SET invite_send_after = now() - interval '1 second'`)
    expect(await sendDueInvite(result.eventId, mail)).toBe('sent')
    const sent = mail.mock.calls[0][0] as { text: string; attachments: { filename: string; content: Buffer }[] }
    expect(sent.text).toContain('pošlu připomínku e-mailem a SMS')
    expect(sent.attachments[0].filename).toBe('schuzka.ics')
    expect(sent.attachments[0].content.toString('utf8')).toContain(`UID:schuzka-${result.eventId}@vizeon.cz`)
  })

  it('„Zpět" před odesláním smaže událost, kontakt i Google; po odeslání už ne', async () => {
    const first = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!first.ok) throw new Error(first.error)
    expect(await undoMeetingSetup(first.eventId, 'delete', deps)).toEqual({ ok: true })
    expect((await db.query(`SELECT 1 FROM calendar_events`)).rows).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM meeting_reminders`)).rows).toHaveLength(0)
    expect(deleteMeet).toHaveBeenCalledWith('g-1')

    const second = await scheduleCalendarMeeting(meetingInput(inDays(4)), deps)
    if (!second.ok) throw new Error(second.error)
    await db.query(`UPDATE calendar_events SET invite_status = 'sent'`)
    expect(await undoMeetingSetup(second.eventId, 'delete', deps)).toMatchObject({ ok: false })
    expect((await db.query(`SELECT 1 FROM calendar_events`)).rows).toHaveLength(1)
  })

  it('existující událost se stane schůzkou a „Zpět" ji vrátí na obyčejnou', async () => {
    const start = inDays(3)
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ('Konzultace', $1, $2) RETURNING id::text`,
      [start.toISOString(), new Date(start.getTime() + 3_600_000).toISOString()],
    )
    const id = rows[0].id
    const draft = { email: 'eva@example.cz', phone: null, subject: 'S', intro: 'I', demoUrl: null, reminders: true }
    const result = await convertEventToMeeting(id, draft, deps)
    expect(result).toMatchObject({ ok: true, meetUrl: MEET })
    expect((await reminders(id)).map((r) => r.channel)).toEqual(['email', 'email'])
    expect(await convertEventToMeeting(id, draft, deps)).toMatchObject({ ok: false })

    expect(await undoMeetingSetup(id, 'revert', deps)).toEqual({ ok: true })
    const ev = await db.query<{ meet_url: string | null; title: string }>(`SELECT meet_url, title FROM calendar_events`)
    expect(ev.rows[0]).toEqual({ meet_url: null, title: 'Konzultace' })
    expect(await reminders(id)).toHaveLength(0)
  })
})

describe('přesun a nastavení', () => {
  it('nový čas přepočítá připomínky, i ty už odeslané; stejný čas je nechá', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE meeting_reminders SET status = 'sent', sent_at = now() WHERE kind = 'h24'`)

    await planReminders(result.eventId) // čas se nezměnil
    expect((await reminders(result.eventId)).filter((r) => r.status === 'sent')).toHaveLength(2)

    await db.query(`UPDATE calendar_events SET starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day'`)
    const move = vi.fn(async () => {})
    const sync = await syncMeetingAfterEdit(result.eventId, { timeChanged: true, notifyClient: false }, { moveMeet: move })
    expect(sync).toEqual({ warning: null, noticeQueued: false })
    expect(move).toHaveBeenCalledWith('g-1', expect.objectContaining({ startsAt: expect.any(String) }))
    expect((await reminders(result.eventId)).every((r) => r.status === 'pending')).toBe(true)
  })

  it('selhání Googlu vrátí varování, připomínky se přesto přepočítají', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    const sync = await syncMeetingAfterEdit(
      result.eventId,
      { timeChanged: true, notifyClient: false },
      { moveMeet: async () => { throw new Error('Google Kalendář 500') } },
    )
    expect(sync.warning).toMatch(/Google Kalendáři/)
  })

  it('zpráva o změně jde jen po odeslané pozvánce, e-mailem i SMS', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    expect(await queueChangeNotice(result.eventId)).toBe(false)

    await db.query(`UPDATE calendar_events SET invite_status = 'sent'`)
    expect(await queueChangeNotice(result.eventId)).toBe(true)
    const changed = (await reminders(result.eventId)).filter((r) => r.kind === 'changed')
    expect(changed.map((r) => r.channel).sort()).toEqual(['email', 'sms'])

    const tick = await processDueReminders({ mail, sms, notify })
    expect(tick).toEqual({ sent: 2, failed: 0, skipped: 0 })
    const email = mail.mock.calls[0][0] as { subject: string; attachments: { filename: string; content: Buffer }[] }
    expect(email.subject).toMatch(/^Schůzku přesouváme na /)
    expect(email.attachments[0].content.toString('utf8')).toContain(`UID:schuzka-${result.eventId}@vizeon.cz`)
  })

  it('vypnuté připomínky zruší čekající', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE calendar_events SET reminders_on = false`)
    await planReminders(result.eventId)
    expect((await reminders(result.eventId)).every((r) => r.status === 'cancelled')).toBe(true)
    expect(await processDueReminders({ mail, sms, notify })).toEqual({ sent: 0, failed: 0, skipped: 0 })
  })
})

describe('odesílání', () => {
  it('zabírá po jedné: co se do běhu nevejde, zůstane čekat, nic neuvízne ve „sending" (audit #26)', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await makeDue(result.eventId, 'h24')

    // Strop počtu: jen jedna zpráva, druhá počká na další běh.
    expect(await processDueReminders({ mail, sms, notify, limit: 1 })).toEqual({ sent: 1, failed: 0, skipped: 0 })
    const statuses = async () => (await reminders(result.eventId)).filter((r) => r.kind === 'h24').map((r) => r.status).sort()
    expect(await statuses()).toEqual(['pending', 'sent'])
    // Vyčerpaný čas: nezabere nic.
    expect(await processDueReminders({ mail, sms, notify, budgetMs: 0 })).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(await statuses()).toEqual(['pending', 'sent'])
    expect(await processDueReminders({ mail, sms, notify })).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(await statuses()).toEqual(['sent', 'sent'])
  })

  it('pošle, co je na řadě, a podruhé nic', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await makeDue(result.eventId, 'h24')

    const [a, b] = await Promise.all([processDueReminders({ mail, sms, notify }), processDueReminders({ mail, sms, notify })])
    expect(a.sent + b.sent).toBe(2)
    expect(mail).toHaveBeenCalledTimes(1)
    expect(sms).toHaveBeenCalledTimes(1)
    const text = (sms.mock.calls[0][0] as { to: string; text: string })
    expect(text.to).toBe('+420777000111')
    expect(text.text).toContain(MEET)

    expect(await processDueReminders({ mail, sms, notify })).toEqual({ sent: 0, failed: 0, skipped: 0 })
    const tick = await db.query<{ t: Date | null }>(`SELECT reminders_tick_at AS t FROM admin_settings`)
    expect(tick.rows[0].t).not.toBeNull()
  })

  it('přesunutou schůzku nepřipomene v čase, který už neplatí', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    // Denní připomínka „na řadě", ale schůzka mezitím začíná za hodinu.
    await makeDue(result.eventId, 'h24')
    await db.query(`UPDATE calendar_events SET starts_at = now() + interval '1 hour', ends_at = now() + interval '90 minutes'`)
    expect(await processDueReminders({ mail, sms, notify })).toEqual({ sent: 0, failed: 0, skipped: 2 })
    expect(mail).not.toHaveBeenCalled()
  })

  it('schůzku posunutou mimo kalendář nepřipomene moc brzy, jen připomínku posune', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    // Hodinová připomínka „na řadě", ale schůzka je pořád za tři dny.
    await db.query(`UPDATE meeting_reminders SET send_at = now() - interval '1 minute' WHERE kind = 'h1'`)
    expect(await processDueReminders({ mail, sms, notify })).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(mail).not.toHaveBeenCalled()
    const h1 = (await reminders(result.eventId)).find((r) => r.kind === 'h1')
    expect(h1?.status).toBe('pending')
    expect(h1!.send_at.getTime()).toBeGreaterThan(Date.now() + 86_400_000)
  })

  it('přechodnou chybu zkusí třikrát, pak upozorní', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3), { email: 'jan@example.cz' }), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`DELETE FROM meeting_reminders WHERE channel = 'email'`)
    await makeDue(result.eventId, 'h24')
    const flaky = vi.fn(async (_i: { to: string; text: string }) => ({ ok: false as const, error: 'Odorik: gateway_failed', retry: true }))

    await processDueReminders({ mail, sms: flaky, notify })
    expect((await reminders(result.eventId)).find((r) => r.kind === 'h24')).toMatchObject({ status: 'pending', attempts: 1 })
    await processDueReminders({ mail, sms: flaky, notify })
    const third = await processDueReminders({ mail, sms: flaky, notify })
    expect(third.failed).toBe(1)
    expect(flaky).toHaveBeenCalledTimes(3)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'meeting_reminder_failed' }))
  })

  it('trvalou chybu (došel kredit) nezkouší znovu', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await makeDue(result.eventId, 'h24')
    const broke = vi.fn(async (_i: { to: string; text: string }) => ({ ok: false as const, error: 'Na účtu Odoriku došel kredit.', retry: false }))
    const tick = await processDueReminders({ mail, sms: broke, notify })
    expect(tick).toEqual({ sent: 1, failed: 1, skipped: 0 })
    expect(broke).toHaveBeenCalledTimes(1)
  })

  it('zprávu, která zůstala viset v odesílání, znovu neposílá', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE meeting_reminders SET status = 'sending', updated_at = now() - interval '20 minutes' WHERE kind = 'h24'`)
    await processDueReminders({ mail, sms, notify })
    expect(sms).not.toHaveBeenCalled()
    expect((await reminders(result.eventId)).filter((r) => r.status === 'failed')).toHaveLength(2)
  })
})

describe('hlídání spouštěče', () => {
  it('upozorní, když čekají připomínky a spouštěč neběží', async () => {
    const result = await scheduleCalendarMeeting(meetingInput(inDays(3)), deps)
    if (!result.ok) throw new Error(result.error)
    expect(await warnIfTriggerStopped(notify)).toBe(true)

    await db.query(`UPDATE admin_settings SET reminders_tick_at = now()`)
    notify.mockClear()
    expect(await warnIfTriggerStopped(notify)).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})
