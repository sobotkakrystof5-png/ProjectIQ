import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Schůzka s firmou od AI asistenta (R-112, krok 3 a 4) proti skutečnému
 * Postgresu se SQL z migrací 114 a 115 a s vazbami kalendář ↔ Hovory
 * z migrace 051 (ON DELETE SET NULL, jedna událost na kontakt).
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { ingestOutreachLeads, loadOutreachQueue } from '@/lib/admin/outreach'
import {
  cancelMeeting,
  recordArrangedMeeting,
  scheduleOutreachMeeting,
  sendDueInvite,
  sendOverdueInvites,
} from '@/lib/admin/meetings'
import { outreachPayloadSchema } from '@/types/outreach'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL, company text, email text, phone text, source text,
  merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
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
CREATE UNIQUE INDEX calendar_events_lead_id_key ON calendar_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX client_leads_calendar_event_id_key ON client_leads(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
`

const FUTURE = new Date(Date.now() + 3 * 86_400_000)
FUTURE.setUTCHours(13, 0, 0, 0)
const START = FUTURE.toISOString()

const createMeet = vi.fn(async () => ({ googleEventId: 'g-1', meetUrl: 'https://meet.google.com/abc-defg-hij' }))
const deleteMeet = vi.fn(async () => {})
const deps = { createMeet, deleteMeet }

async function firm(overrides: Record<string, unknown> = {}): Promise<string> {
  const lead = outreachPayloadSchema.parse({
    version: 1,
    leads: [
      {
        external_id: 'vizeon-outreach:1',
        updated_at: new Date().toISOString(),
        company: 'Topenářství Testové',
        contact_name: 'Jan Test',
        phone: '+420777000001',
        email: 'jan@example.cz',
        status: 'demo_ready',
        demo: { url: 'https://navrhy.vizeon.cz/topeni/', status: 'ready', views: 0 },
        ...overrides,
      },
    ],
  }).leads[0]
  await ingestOutreachLeads([lead])
  return (await loadOutreachQueue()).rows[0].id
}

function input(outreachId: string, extra: Record<string, unknown> = {}) {
  return {
    outreachId,
    startsAt: START,
    minutes: 30,
    sendInvite: true,
    inviteTo: 'jan@example.cz',
    subject: 'Naše schůzka',
    intro: 'Dobrý den,\n\nposílám odkaz.',
    ...extra,
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const m of ['114_hovory_od_asistenta.sql', '115_schuzky_google_meet.sql']) {
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
  createMeet.mockClear()
  deleteMeet.mockClear()
  await db.exec('DELETE FROM calendar_events; DELETE FROM client_leads; DELETE FROM outreach_leads; DELETE FROM contacts;')
})

describe('domluvit schůzku', () => {
  it('založí kontakt, událost s Meetem a převezme firmu; e-mail čeká na odklad', async () => {
    const id = await firm()
    const result = await scheduleOutreachMeeting(input(id), deps)
    expect(result).toMatchObject({ ok: true, meetUrl: 'https://meet.google.com/abc-defg-hij', inviteQueued: true })
    if (!result.ok) return

    const ev = await db.query<{ meet_url: string; invite_status: string; lead_id: string; title: string; waits: boolean }>(
      `SELECT meet_url, invite_status, lead_id::text, title, invite_send_after > now() AS waits FROM calendar_events`,
    )
    expect(ev.rows[0]).toMatchObject({ meet_url: 'https://meet.google.com/abc-defg-hij', invite_status: 'pending', waits: true })
    expect(ev.rows[0].title).toBe('Schůzka: Topenářství Testové')

    const lead = await db.query<{ calendar_event_id: string; next_action_type: string }>(
      `SELECT calendar_event_id::text, next_action_type FROM client_leads`,
    )
    expect(lead.rows).toHaveLength(1)
    expect(lead.rows[0]).toEqual({ calendar_event_id: result.eventId, next_action_type: 'meeting' })
    expect((await loadOutreachQueue()).rows).toHaveLength(0)

    // Dokud neuběhl odklad, e-mail neodejde.
    const send = vi.fn(async () => ({ ok: true as const, id: 'email_1' }))
    expect(await sendDueInvite(result.eventId, send)).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('po odkladu e-mail odejde právě jednou, s odkazem na Meet a ukázkou', async () => {
    const id = await firm()
    const result = await scheduleOutreachMeeting(input(id), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE calendar_events SET invite_send_after = now() - interval '1 second'`)

    const send = vi.fn(async (_m: { to: string; text: string; idempotencyKey?: string }) => ({ ok: true as const, id: 'email_1' }))
    expect(await sendDueInvite(result.eventId, send)).toBe('sent')
    expect(await sendDueInvite(result.eventId, send)).toBe('skipped')
    expect(send).toHaveBeenCalledTimes(1)
    const mail = send.mock.calls[0][0]
    expect(mail.to).toBe('jan@example.cz')
    expect(mail.text).toContain('https://meet.google.com/abc-defg-hij')
    expect(mail.text).toContain('https://navrhy.vizeon.cz/topeni/')
    expect(mail.idempotencyKey).toBe(`meeting-invite:${result.eventId}`)

    // Odeslanou schůzku už „Zpět" nezruší.
    expect(await cancelMeeting(result.eventId, deps)).toMatchObject({ ok: false })
  })

  it('„Zpět" zastaví e-mail, smaže událost i v Googlu a kontakt zůstane bez termínu', async () => {
    const id = await firm()
    const result = await scheduleOutreachMeeting(input(id), deps)
    if (!result.ok) throw new Error(result.error)

    expect(await cancelMeeting(result.eventId, deps)).toEqual({ ok: true })
    expect(deleteMeet).toHaveBeenCalledWith('g-1')
    expect((await db.query(`SELECT 1 FROM calendar_events`)).rows).toHaveLength(0)
    const lead = await db.query<{ calendar_event_id: string | null; next_action_date: string | null; next_action: string }>(
      `SELECT calendar_event_id::text, next_action_date::text, next_action FROM client_leads`,
    )
    expect(lead.rows[0]).toEqual({ calendar_event_id: null, next_action_date: null, next_action: 'Domluvit schůzku' })
  })

  it('u převzaté firmy použije stávající kontakt a starou událost jen odpojí', async () => {
    const id = await firm()
    const first = await scheduleOutreachMeeting(input(id), deps)
    if (!first.ok) throw new Error(first.error)
    const later = new Date(FUTURE.getTime() + 86_400_000).toISOString()
    const second = await scheduleOutreachMeeting(input(id, { startsAt: later }), deps)
    expect(second).toMatchObject({ ok: true, leadId: first.leadId })

    expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(1)
    const events = await db.query<{ lead_id: string | null }>(`SELECT lead_id::text FROM calendar_events ORDER BY starts_at`)
    expect(events.rows.map((r) => r.lead_id)).toEqual([null, first.leadId])
  })

  it('když admin nemůže uložit, událost v Googlu se smaže', async () => {
    const id = await firm()
    await db.exec(`ALTER TABLE calendar_events ADD CONSTRAINT test_fail CHECK (title <> 'Schůzka: Topenářství Testové')`)
    try {
      await expect(scheduleOutreachMeeting(input(id), deps)).rejects.toThrow()
      expect(deleteMeet).toHaveBeenCalledWith('g-1')
      expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(0)
    } finally {
      await db.exec(`ALTER TABLE calendar_events DROP CONSTRAINT test_fail`)
    }
  })

  it('bez e-mailu klienta jen schůzka, žádný e-mail', async () => {
    const id = await firm({ email: null })
    expect(await scheduleOutreachMeeting(input(id, { inviteTo: null }), deps)).toMatchObject({ ok: false })
    const result = await scheduleOutreachMeeting(input(id, { sendInvite: false, inviteTo: null }), deps)
    expect(result).toMatchObject({ ok: true, inviteQueued: false })
    const ev = await db.query<{ invite_status: string | null }>(`SELECT invite_status FROM calendar_events`)
    expect(ev.rows[0].invite_status).toBeNull()
  })

  it('schůzku v minulosti nebo moc dlouhou odmítne dřív, než sáhne na Google', async () => {
    const id = await firm()
    expect(await scheduleOutreachMeeting(input(id, { startsAt: '2020-01-01T10:00:00Z' }), deps)).toMatchObject({ ok: false })
    expect(await scheduleOutreachMeeting(input(id, { minutes: 600 }), deps)).toMatchObject({ ok: false })
    expect(createMeet).not.toHaveBeenCalled()
  })

  it('denní pojistka pošle e-mail, který po odkladu zůstal viset', async () => {
    const id = await firm()
    const result = await scheduleOutreachMeeting(input(id), deps)
    if (!result.ok) throw new Error(result.error)
    await db.query(`UPDATE calendar_events SET invite_send_after = now() - interval '10 minutes'`)
    vi.stubEnv('VIZEON_RESEND_API_KEY', '')
    // Bez klíče se e-mail neodešle a skončí jako „failed" — pojistka ho ale zkusila.
    expect(await sendOverdueInvites()).toBe(0)
    const ev = await db.query<{ invite_status: string; invite_error: string }>(`SELECT invite_status, invite_error FROM calendar_events`)
    expect(ev.rows[0].invite_status).toBe('failed')
    expect(ev.rows[0].invite_error).toContain('VIZEON_RESEND_API_KEY')
  })
})

describe('schůzka domluvena (jen do kalendáře)', () => {
  const arranged = (outreachId: string, extra: Record<string, unknown> = {}) => ({
    outreachId,
    startsAt: START,
    minutes: 60,
    note: 'U nich v provozovně',
    ...extra,
  })

  it('zapíše událost a kontakt v Hovorech bez Googlu a bez e-mailu, firma odejde z fronty', async () => {
    const id = await firm()
    const result = await recordArrangedMeeting(arranged(id))
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(createMeet).not.toHaveBeenCalled()

    const ev = await db.query<{
      title: string
      description: string
      meet_url: string | null
      invite_status: string | null
      lead_id: string
      outreach_lead_id: string
      minutes: number
    }>(
      `SELECT title, description, meet_url, invite_status, lead_id::text, outreach_lead_id::text,
              extract(epoch FROM ends_at - starts_at)::int / 60 AS minutes
         FROM calendar_events`,
    )
    expect(ev.rows).toHaveLength(1)
    expect(ev.rows[0]).toMatchObject({
      title: 'Schůzka: Topenářství Testové',
      meet_url: null,
      invite_status: null,
      lead_id: result.leadId,
      outreach_lead_id: id,
      minutes: 60,
    })
    expect(ev.rows[0].description).toContain('U nich v provozovně')

    const lead = await db.query<{ calendar_event_id: string; next_action_type: string; next_action: string }>(
      `SELECT calendar_event_id::text, next_action_type, next_action FROM client_leads`,
    )
    expect(lead.rows[0]).toEqual({
      calendar_event_id: result.eventId,
      next_action_type: 'meeting',
      next_action: 'Schůzka — U nich v provozovně',
    })
    expect((await loadOutreachQueue()).rows).toHaveLength(0)
    const firmRow = await db.query<{ handled_reason: string }>(`SELECT handled_reason FROM outreach_leads`)
    expect(firmRow.rows[0].handled_reason).toBe('prevzato')
  })

  it('„Zpět" událost smaže a kontakt zůstane bez termínu', async () => {
    const id = await firm()
    const result = await recordArrangedMeeting(arranged(id, { note: '' }))
    if (!result.ok) throw new Error(result.error)
    expect(await cancelMeeting(result.eventId, deps)).toEqual({ ok: true })
    expect(deleteMeet).not.toHaveBeenCalled()
    expect((await db.query(`SELECT 1 FROM calendar_events`)).rows).toHaveLength(0)
    const lead = await db.query<{ next_action_date: string | null }>(`SELECT next_action_date::text FROM client_leads`)
    expect(lead.rows[0].next_action_date).toBeNull()
  })

  it('u převzaté firmy použije stávající kontakt', async () => {
    const id = await firm()
    const first = await scheduleOutreachMeeting(input(id, { sendInvite: false, inviteTo: null }), deps)
    if (!first.ok) throw new Error(first.error)
    const later = new Date(FUTURE.getTime() + 86_400_000).toISOString()
    expect(await recordArrangedMeeting(arranged(id, { startsAt: later }))).toMatchObject({ ok: true, leadId: first.leadId })
    expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(1)
  })

  it('termín v minulosti, moc dlouhý nebo u neexistující firmy odmítne', async () => {
    const id = await firm()
    expect(await recordArrangedMeeting(arranged(id, { startsAt: '2020-01-01T10:00:00Z' }))).toMatchObject({ ok: false })
    expect(await recordArrangedMeeting(arranged(id, { minutes: 600 }))).toMatchObject({ ok: false })
    expect(
      await recordArrangedMeeting(arranged('00000000-0000-4000-8000-000000000000')),
    ).toEqual({ ok: false, error: 'Firma nenalezena.' })
    expect((await db.query(`SELECT 1 FROM calendar_events`)).rows).toHaveLength(0)
  })
})
