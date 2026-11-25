import fs from 'fs'
import path from 'path'
import { createHmac } from 'crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Doručení e-mailů z adminu podle webhooku Resendu (R-146) proti skutečnému
 * Postgresu se SQL z migrací 115 a 135: rozbor události, pořadí stavů,
 * upozornění na nedoručenou pozvánku, „Poslat znovu", webhook s podpisem
 * a načtení do kalendáře.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

vi.mock('@/lib/db', () => ({ sql: async () => [] }))
const createNotification = vi.fn(async (_n: unknown) => {})
vi.mock('@/lib/notifications', () => ({ createNotification: (n: unknown) => createNotification(n) }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { ADMIN_MAIL_TAG, parseResendEvent } from '@/lib/admin/email-delivery'
import { handleAdminResendEvent, recordDelivery } from '@/lib/admin/email-deliveries'
import { retryInvite } from '@/lib/admin/meetings'
import { loadCalendarWindow } from '@/lib/admin/calendar'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { POST } from '@/app/api/resend/vizeon/route'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id));
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, deadline date);
CREATE TABLE consultation_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
  scheduled_at timestamptz NOT NULL, channel text NOT NULL DEFAULT 'phone', client_wish text NOT NULL DEFAULT '',
  meeting_link text, client_email text
);
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  event_type text NOT NULL DEFAULT 'manual', project_id uuid, lead_id uuid
);
CREATE TABLE client_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_name text,
  next_action text, next_action_type text, next_action_date date, next_action_time time,
  phone text, email text, lead_status text NOT NULL DEFAULT 'cold', estimated_value numeric, notes text,
  calendar_event_id uuid
);
`

const SECRET_KEY = Buffer.from('tajny-klic-webhooku-pro-test').toString('base64')
const SECRET = `whsec_${SECRET_KEY}`

function event(type: string, emailId: string, extra: Record<string, unknown> = {}, createdAt = new Date().toISOString()) {
  return {
    type,
    created_at: createdAt,
    data: {
      email_id: emailId,
      from: 'Kryštof Sobotka | VIZEON <krystof@vizeon.cz>',
      to: ['klient@example.cz'],
      subject: 'Naše schůzka',
      tags: { zakaziq: 'admin' },
      ...extra,
    },
  }
}

async function insertMeeting(opts: { providerId: string; inDays?: number; title?: string; status?: string }) {
  const start = new Date(Date.now() + (opts.inDays ?? 2) * 86_400_000)
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO calendar_events (title, starts_at, ends_at, meet_url, invite_status, invite_to, invite_subject,
                                  invite_body, invite_send_after, invite_sent_at, invite_provider_id)
     VALUES ($1, $2, $3, 'https://meet.google.com/abc-defg-hij', $4, 'klient@example.cz', 'Naše schůzka',
             'Dobrý den, těším se.', now() - interval '1 hour', now() - interval '1 hour', $5)
     RETURNING id::text`,
    [
      opts.title ?? 'Schůzka s Novákem',
      start.toISOString(),
      new Date(start.getTime() + 30 * 60_000).toISOString(),
      opts.status ?? 'sent',
      opts.providerId,
    ],
  )
  return rows[0].id
}

async function delivery(providerId: string) {
  return (
    await db.query<{ status: string; bounce_type: string | null }>(
      'SELECT status, bounce_type FROM email_deliveries WHERE provider_id = $1',
      [providerId],
    )
  ).rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const m of ['115_schuzky_google_meet.sql', '135_doruceni_emailu.sql']) {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotence
  }
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(() => setAdminDbForTests(null))

beforeEach(async () => {
  createNotification.mockClear()
  await db.exec('DELETE FROM email_deliveries; DELETE FROM calendar_events;')
})

describe('rozbor události z webhooku', () => {
  it('bere jen naše e-maily se štítkem a známé druhy událostí', () => {
    expect(parseResendEvent(event('email.delivered', 'e-1'))).toMatchObject({ providerId: 'e-1', status: 'delivered' })
    expect(parseResendEvent(event('email.delivery_delayed', 'e-1'))?.status).toBe('delayed')
    expect(parseResendEvent(event('email.suppressed', 'e-1'))?.status).toBe('suppressed')
    // E-mail Growth OS ze stejné domény: bez štítku, nebo s cizím.
    expect(parseResendEvent(event('email.delivered', 'e-1', { tags: undefined }))).toBeNull()
    expect(parseResendEvent(event('email.delivered', 'e-1', { tags: { zakaziq: 'growth' } }))).toBeNull()
    // Druhy, které nás nezajímají (otevření sleduje Resend jen se zapnutým sledováním).
    expect(parseResendEvent(event('email.sent', 'e-1'))).toBeNull()
    expect(parseResendEvent(event('email.opened', 'e-1'))).toBeNull()
    expect(parseResendEvent({ type: 'domain.updated', data: {} })).toBeNull()
    expect(parseResendEvent(null)).toBeNull()
  })

  it('štítky jako pole {name, value} projdou taky', () => {
    expect(parseResendEvent(event('email.delivered', 'e-1', { tags: [ADMIN_MAIL_TAG] }))?.status).toBe('delivered')
  })

  it('nečitelné id e-mailu se zahodí', () => {
    expect(parseResendEvent(event('email.delivered', "x'; DROP TABLE email_deliveries; --"))).toBeNull()
    expect(parseResendEvent(event('email.delivered', ''))).toBeNull()
    expect(parseResendEvent(event('email.delivered', 'a'.repeat(101)))).toBeNull()
  })

  it('u vrácení si nechá jen druh, ne text serveru s adresou', () => {
    const parsed = parseResendEvent(
      event('email.bounced', 'e-1', {
        bounce: { type: 'Permanent', subType: 'General', message: '550 klient@example.cz neexistuje' },
      }),
    )
    expect(parsed).toMatchObject({ status: 'bounced', bounceType: 'Permanent' })
    expect(JSON.stringify(parsed)).not.toContain('klient@example.cz')
    expect(parseResendEvent(event('email.bounced', 'e-1', { bounce: { type: '<script>' } }))?.bounceType).toBeNull()
  })

  it('čas je čas události; nečitelný čas = teď', () => {
    const now = new Date('2026-11-25T10:00:00Z')
    expect(parseResendEvent(event('email.delivered', 'e-1', {}, '2026-11-25T09:00:00Z'), now)?.eventAt.toISOString())
      .toBe('2026-11-25T09:00:00.000Z')
    expect(parseResendEvent(event('email.delivered', 'e-1', {}, 'včera'), now)?.eventAt).toEqual(now)
  })
})

describe('pořadí stavů', () => {
  const at = (iso: string) => new Date(iso)

  it('novější přepíše starší, starší se zahodí', async () => {
    await recordDelivery({ providerId: 'p-1', status: 'delivered', eventAt: at('2026-11-25T10:00:00Z'), bounceType: null })
    const late = await recordDelivery({ providerId: 'p-1', status: 'complained', eventAt: at('2026-11-25T12:00:00Z'), bounceType: null })
    expect(late).toEqual({ before: 'delivered', after: 'complained' })
    const stale = await recordDelivery({ providerId: 'p-1', status: 'delivered', eventAt: at('2026-11-25T11:00:00Z'), bounceType: null })
    expect(stale.after).toBeNull()
    expect((await delivery('p-1')).status).toBe('complained')
  })

  it('„zdržuje se" nepřepíše doručení, ani když přijde se zpožděním', async () => {
    await recordDelivery({ providerId: 'p-2', status: 'delivered', eventAt: at('2026-11-25T10:00:00Z'), bounceType: null })
    await recordDelivery({ providerId: 'p-2', status: 'delayed', eventAt: at('2026-11-25T11:00:00Z'), bounceType: null })
    expect((await delivery('p-2')).status).toBe('delivered')
  })

  it('konečný stav přepíše „zdržuje se" i se starším časem', async () => {
    await recordDelivery({ providerId: 'p-3', status: 'delayed', eventAt: at('2026-11-25T11:00:00Z'), bounceType: null })
    await recordDelivery({ providerId: 'p-3', status: 'bounced', eventAt: at('2026-11-25T10:59:00Z'), bounceType: 'Transient' })
    expect(await delivery('p-3')).toEqual({ status: 'bounced', bounce_type: 'Transient' })
  })
})

describe('upozornění na pozvánku, která nedorazila', () => {
  it('vrácená pozvánka na nadcházející schůzku → jedno upozornění, i když webhook přijde dvakrát', async () => {
    await insertMeeting({ providerId: 'inv-1' })
    const evt = event('email.bounced', 'inv-1', { bounce: { type: 'Permanent' } })
    expect(await handleAdminResendEvent(evt)).toBe('recorded')
    expect(await handleAdminResendEvent(evt)).toBe('recorded')
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      type: 'meeting_invite_undelivered',
      title: 'Pozvánka na schůzku nedorazila: Schůzka s Novákem',
      link: '/dashboard/calendar',
    })
  })

  it('doručená pozvánka ani proběhlá schůzka upozornění nedělají', async () => {
    await insertMeeting({ providerId: 'inv-2' })
    await handleAdminResendEvent(event('email.delivered', 'inv-2'))
    await insertMeeting({ providerId: 'inv-3', inDays: -2 })
    await handleAdminResendEvent(event('email.bounced', 'inv-3', { bounce: { type: 'Permanent' } }))
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('jiný e-mail z adminu (faktura, připomínka) se uloží, ale upozornění na pozvánku nevznikne', async () => {
    expect(await handleAdminResendEvent(event('email.bounced', 'faktura-1'))).toBe('recorded')
    expect((await delivery('faktura-1')).status).toBe('bounced')
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('e-mail bez našeho štítku se neuloží vůbec', async () => {
    expect(await handleAdminResendEvent(event('email.bounced', 'growth-1', { tags: {} }))).toBe('ignored')
    expect(await delivery('growth-1')).toBeUndefined()
  })
})

describe('poslat znovu', () => {
  const send = vi.fn(async (_m: { to: string; idempotencyKey?: string }) => ({ ok: true as const, id: 'novy-email' }))
  afterEach(() => send.mockClear())

  it('nedoručenou pozvánku pošle znovu s novým klíčem a novým id', async () => {
    const id = await insertMeeting({ providerId: 'inv-4' })
    await handleAdminResendEvent(event('email.bounced', 'inv-4', { bounce: { type: 'Permanent' } }))
    // Kontakt mezitím dostal opravený e-mail (R-141 ho propíše do schůzky).
    await db.query(`UPDATE calendar_events SET invite_to = 'opraveny@example.cz' WHERE id = $1`, [id])

    expect(await retryInvite(id, send)).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe('opraveny@example.cz')
    expect(send.mock.calls[0][0].idempotencyKey).toMatch(new RegExp(`^meeting-invite:${id}:znovu-\\d+$`))
    const { rows } = await db.query<{ invite_status: string; invite_provider_id: string }>(
      'SELECT invite_status, invite_provider_id FROM calendar_events WHERE id = $1',
      [id],
    )
    expect(rows[0]).toEqual({ invite_status: 'sent', invite_provider_id: 'novy-email' })
  })

  it('doručenou pozvánku znovu neposílá', async () => {
    const id = await insertMeeting({ providerId: 'inv-5' })
    await handleAdminResendEvent(event('email.delivered', 'inv-5'))
    expect(await retryInvite(id, send)).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('pozvánku, která neodešla, pošle znovu jako dřív', async () => {
    const id = await insertMeeting({ providerId: 'x', status: 'failed' })
    expect(await retryInvite(id, send)).toBe('sent')
  })
})

describe('kalendář', () => {
  it('k události přidá stav doručení její pozvánky', async () => {
    const id = await insertMeeting({ providerId: 'inv-6', inDays: 1 })
    const other = await insertMeeting({ providerId: 'inv-7', inDays: 1, title: 'Bez zprávy' })
    await handleAdminResendEvent(event('email.bounced', 'inv-6', { bounce: { type: 'Transient' } }))
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
    const data = await loadCalendarWindow({ from: day(0), to: day(3) })
    const byId = new Map(data.events.map((e) => [e.id, e]))
    expect(byId.get(id)).toMatchObject({ invite_delivery: 'bounced', invite_bounce_type: 'Transient' })
    expect(byId.get(id)?.invite_delivery_at).toEqual(expect.any(String))
    expect(byId.get(other)).toMatchObject({ invite_delivery: null, invite_delivery_at: null })
  })
})

describe('webhook /api/resend/vizeon', () => {
  const OLD = process.env.VIZEON_RESEND_WEBHOOK_SECRET
  afterEach(() => {
    if (OLD === undefined) delete process.env.VIZEON_RESEND_WEBHOOK_SECRET
    else process.env.VIZEON_RESEND_WEBHOOK_SECRET = OLD
  })

  function signed(body: string, opts: { secretKey?: string; timestamp?: number } = {}) {
    const id = 'msg_test_1'
    const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', Buffer.from(opts.secretKey ?? SECRET_KEY, 'base64'))
      .update(`${id}.${ts}.${body}`)
      .digest('base64')
    return new Request('https://www.zakaziq.cz/api/resend/vizeon', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
    })
  }

  it('bez nastaveného tajemství 503', async () => {
    delete process.env.VIZEON_RESEND_WEBHOOK_SECRET
    const res = await POST(signed('{}') as never)
    expect(res.status).toBe(503)
  })

  it('cizí podpis nebo starý čas 400, nic se neuloží', async () => {
    process.env.VIZEON_RESEND_WEBHOOK_SECRET = SECRET
    const body = JSON.stringify(event('email.delivered', 'w-1'))
    expect((await POST(signed(body, { secretKey: Buffer.from('jiny').toString('base64') }) as never)).status).toBe(400)
    expect((await POST(signed(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }) as never)).status).toBe(400)
    expect(await delivery('w-1')).toBeUndefined()
  })

  it('podepsaná událost se uloží', async () => {
    process.env.VIZEON_RESEND_WEBHOOK_SECRET = SECRET
    const res = await POST(signed(JSON.stringify(event('email.delivered', 'w-2'))) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, result: 'recorded' })
    expect((await delivery('w-2')).status).toBe('delivered')
  })

  it('příliš velké tělo 413', async () => {
    process.env.VIZEON_RESEND_WEBHOOK_SECRET = SECRET
    const res = await POST(signed('x'.repeat(70 * 1024)) as never)
    expect(res.status).toBe(413)
  })
})

describe('odeslání', () => {
  it('každý e-mail z adminu nese štítek, podle kterého ho webhook pozná', async () => {
    const OLD = process.env.VIZEON_RESEND_API_KEY
    process.env.VIZEON_RESEND_API_KEY = 're_test'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'e-1' }), { status: 200 }))
    try {
      await sendVizeonMail({ to: 'klient@example.cz', subject: 'S', text: 't', html: 'h' }, fetchImpl as unknown as typeof fetch)
    } finally {
      if (OLD === undefined) delete process.env.VIZEON_RESEND_API_KEY
      else process.env.VIZEON_RESEND_API_KEY = OLD
    }
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).tags).toEqual([{ name: 'zakaziq', value: 'admin' }])
  })
})
