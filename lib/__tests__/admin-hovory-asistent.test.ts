import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Hovory od asistenta z Growth OS (R-112) proti skutečnému Postgresu (PGlite)
 * se SQL z migrace 114.
 *
 * Co se hlídá:
 * - snímek se uloží, opakované poslání nic nezdvojí a starší snímek
 *   novější nepřepíše,
 * - snímek nesahá na to, co s firmou udělal Kryštof,
 * - fronta ukáže jen ty, u kterých je na tahu člověk, a seřadí je,
 * - převzetí do Hovorů založí kontakt a plánovaný hovor, podruhé nic,
 * - „Nemá zájem" se vrátí, když firma odpoví na e-mail.
 */

const ROOT = path.resolve(__dirname, '../..')

let db: PGlite

vi.mock('@/lib/auth', () => ({ getAdminSession: async () => ({ email: 'admin@example.cz' }), adminActorEmail: async () => 'admin@example.cz', requireAuth: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { ingestOutreachLeads, loadOutreachQueue, countOutreachQueue } from '@/lib/admin/outreach'
import { queueReason } from '@/lib/admin/outreach-view'
import { dismissOutreachLead, takeOverOutreachLead, undoDismissOutreachLead } from '@/app/outreach-actions'
import { outreachPayloadSchema, type OutreachLeadPayload } from '@/types/outreach'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  company text, email text, phone text, source text,
  merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_email_uq ON contacts (email) WHERE merged_into IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_uq ON contacts (phone) WHERE merged_into IS NULL AND phone IS NOT NULL;
CREATE TABLE client_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text, phone text, email text,
  lead_status text NOT NULL DEFAULT 'new',
  next_action text, next_action_type text, next_action_date date, next_action_time time,
  notes text, estimated_value numeric,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
`

const NOW = new Date('2026-11-17T09:00:00Z') // 10:00 v Praze

function lead(overrides: Partial<OutreachLeadPayload> = {}): OutreachLeadPayload {
  return outreachPayloadSchema.parse({
    version: 1,
    leads: [
      {
        external_id: 'vizeon-outreach:1',
        updated_at: '2026-11-17T08:00:00Z',
        company: 'Topenářství Testové',
        contact_name: 'Jan Test',
        phone: '+420777000001',
        email: 'jan@example.cz',
        website: 'https://topeni-test.example.cz',
        industry: 'topenáři',
        city: 'Zlín',
        status: 'callback_later',
        attempts: 1,
        last_call: {
          at: '2026-11-17T07:15:00Z',
          outcome: 'callback_later',
          summary: 'Teď nemá čas, chce zavolat odpoledne.',
          callback_at: '2026-11-17T13:30:00Z',
          callback_text: 'dnes po druhé',
        },
        ...overrides,
      },
    ],
  }).leads[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  const migration = fs.readFileSync(path.join(ROOT, 'migrations', '114_hovory_od_asistenta.sql'), 'utf8')
  await db.exec(migration)
  // Idempotence: podruhé musí projít beze změny.
  await db.exec(migration)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM outreach_leads; DELETE FROM client_leads; DELETE FROM contacts;')
})

describe('příjem snímků z Growth OS', () => {
  it('uloží firmu, podruhé nic nezdvojí a ohlásí ji jen jednou', async () => {
    const first = await ingestOutreachLeads([lead()])
    expect(first.saved).toBe(1)
    expect(first.events).toMatchObject([{ kind: 'do-fronty', company: 'Topenářství Testové', reason: expect.any(String), leadId: expect.any(String) }])

    const again = await ingestOutreachLeads([lead({ updated_at: '2026-11-17T08:05:00Z' })])
    expect(again.saved).toBe(1)
    expect(again.events).toEqual([])

    const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM outreach_leads')
    expect(count.rows[0].n).toBe(1)
  })

  it('starší snímek novější nepřepíše', async () => {
    await ingestOutreachLeads([lead({ updated_at: '2026-11-17T10:00:00Z', status: 'demo_ready' })])
    const stale = await ingestOutreachLeads([lead({ updated_at: '2026-11-17T08:00:00Z', status: 'callback_later' })])
    expect(stale.saved).toBe(0)
    const row = await db.query<{ status: string }>('SELECT status FROM outreach_leads')
    expect(row.rows[0].status).toBe('demo_ready')
  })

  it('dvakrát stejná firma v jedné dávce nespadne, vezme se novější', async () => {
    const result = await ingestOutreachLeads([
      lead({ updated_at: '2026-11-17T08:00:00Z', status: 'accepted' }),
      lead({ updated_at: '2026-11-17T09:00:00Z', status: 'demo_ready' }),
    ])
    expect(result.saved).toBe(1)
    const row = await db.query<{ status: string }>('SELECT status FROM outreach_leads')
    expect(row.rows[0].status).toBe('demo_ready')
  })

  it('ohlásí první otevření ukázky', async () => {
    const demo = { url: 'https://navrhy.vizeon.cz/topeni-test/', status: 'ready', views: 0 }
    await ingestOutreachLeads([lead({ status: 'email_sent', last_call: null, demo })])
    const viewed = await ingestOutreachLeads([
      lead({ updated_at: '2026-11-17T09:00:00Z', status: 'demo_viewed', last_call: null, demo: { ...demo, views: 2 } }),
    ])
    expect(viewed.events).toMatchObject([{ kind: 'otevrel-ukazku', company: 'Topenářství Testové' }])
  })

  it('kontrakt odmítne odkaz na ukázku bez https a telefon v jiném tvaru', () => {
    const bad = (patch: Record<string, unknown>) =>
      outreachPayloadSchema.safeParse({
        version: 1,
        leads: [{ external_id: 'x', updated_at: '2026-11-17T08:00:00Z', company: 'X', status: 'accepted', ...patch }],
      }).success
    expect(bad({ demo: { url: 'javascript:alert(1)' } })).toBe(false)
    expect(bad({ demo: { url: 'http://navrhy.vizeon.cz/x' } })).toBe(false)
    expect(bad({ phone: '777 000 001' })).toBe(false)
    expect(bad({})).toBe(true)
  })
})

describe('fronta „Komu zavolat"', () => {
  it('ukáže jen firmy, u kterých je na tahu člověk, a seřadí je', async () => {
    await ingestOutreachLeads([
      lead({ external_id: 'a', company: 'Nezvedl', status: 'no_answer', last_call: null }),
      lead({ external_id: 'b', company: 'Nevolat', status: 'do_not_call', do_not_call: true, last_call: null }),
      lead({
        external_id: 'c',
        company: 'Ukázka odeslaná',
        status: 'email_sent',
        last_call: null,
        demo: { url: 'https://navrhy.vizeon.cz/c/', status: 'ready', views: 0 },
        emails: { demo_sent_at: '2026-11-16T10:00:00Z' },
      }),
      lead({ external_id: 'd', company: 'Odpověděl', status: 'replied', last_call: null, emails: { replied_at: '2026-11-17T08:30:00Z' } }),
      lead({ external_id: 'e', company: 'Chce zavolat dnes' }),
    ])

    const queue = await loadOutreachQueue(NOW)
    expect(queue.available).toBe(true)
    expect(queue.rows.map((r) => r.company)).toEqual(['Odpověděl', 'Chce zavolat dnes', 'Ukázka odeslaná'])
    expect(queueReason(queue.rows[1], NOW).label).toBe('Chce zavolat dnes 14:30')
    expect(await countOutreachQueue()).toBe(3)
  })

  it('bez migrace 114 se záložka neukáže a nic nespadne', async () => {
    const empty = new PGlite()
    setAdminDbForTests(pgliteAdminDriver(empty))
    try {
      expect(await loadOutreachQueue(NOW)).toEqual({ rows: [], available: false })
      expect(await countOutreachQueue()).toBeNull()
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
      await empty.close()
    }
  })
})

describe('akce Kryštofa', () => {
  it('převzetí založí kontakt a plánovaný hovor v pražském čase, podruhé nic', async () => {
    await ingestOutreachLeads([lead()])
    const [row] = (await loadOutreachQueue(NOW)).rows

    const first = await takeOverOutreachLead(row.id)
    expect(first.ok).toBe(true)
    const second = await takeOverOutreachLead(row.id)
    expect(second).toEqual(first)

    const leads = await db.query<{
      company_name: string
      next_action_type: string
      d: string
      t: string
      notes: string
      contact_id: string | null
    }>(
      `SELECT company_name, next_action_type, next_action_date::text AS d, next_action_time::text AS t,
              notes, contact_id::text AS contact_id FROM client_leads`,
    )
    expect(leads.rows).toHaveLength(1)
    const l = leads.rows[0]
    expect(l.company_name).toBe('Topenářství Testové')
    expect(l.next_action_type).toBe('call')
    expect(l.d).toBe('2026-11-17')
    expect(l.t).toBe('14:30:00')
    expect(l.notes).toContain('odhad, ne fakt')
    expect(l.contact_id).not.toBeNull()

    // Z fronty zmizí a další snímek ho tam nevrátí.
    expect((await loadOutreachQueue(NOW)).rows).toHaveLength(0)
    await ingestOutreachLeads([lead({ updated_at: '2026-11-17T09:30:00Z' })])
    expect((await loadOutreachQueue(NOW)).rows).toHaveLength(0)
  })

  it('dvojklik na převzetí založí v Hovorech jen jeden kontakt (audit #23)', async () => {
    await ingestOutreachLeads([lead()])
    const [row] = (await loadOutreachQueue(NOW)).rows

    const [a, b] = await Promise.all([takeOverOutreachLead(row.id), takeOverOutreachLead(row.id)])
    expect(a.ok && b.ok).toBe(true)
    expect(a).toEqual(b)
    const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM client_leads`)
    expect(n.rows[0].n).toBe(1)
  })

  it('„Nemá zájem" schová, „Zpět" vrátí a nová odpověď na e-mail ho vrátí sama', async () => {
    await ingestOutreachLeads([lead()])
    const [row] = (await loadOutreachQueue(NOW)).rows

    await dismissOutreachLead(row.id)
    expect((await loadOutreachQueue(NOW)).rows).toHaveLength(0)
    await undoDismissOutreachLead(row.id)
    expect((await loadOutreachQueue(NOW)).rows).toHaveLength(1)

    await dismissOutreachLead(row.id)
    const reply = await ingestOutreachLeads([
      lead({ updated_at: '2026-11-17T10:00:00Z', status: 'replied', emails: { replied_at: '2026-11-17T09:55:00Z' } }),
    ])
    expect(reply.events).toMatchObject([{ kind: 'odpovedel', company: 'Topenářství Testové' }])
    expect((await loadOutreachQueue(NOW)).rows.map((r) => r.company)).toEqual(['Topenářství Testové'])
  })
})
