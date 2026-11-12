import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'

/**
 * Migrace 105 a přesun termínu (AD10) proti skutečnému Postgresu (PGlite).
 *
 * Co se tu hlídá, protože to dřív nefungovalo:
 *  - přesun termínu u kontaktu v Hovorech **přepíše i kalendář** (dvojice
 *    z migrace 051 se rozcházela),
 *  - rezervace z portálu je vidět v kalendáři **i v Hovorech** a jen jednou,
 *  - křížový překryvový guard (044) pozná dvojici a nehlásí kolizi sám
 *    se sebou, ale cizí překryv pořád zastaví.
 */

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/server', () => ({ after: (cb: () => unknown) => void cb() }))
vi.mock('@/lib/email', () => ({ sendPlainEmail: vi.fn() }))
vi.mock('@/lib/admin/leads', () => ({ loadLeadNotes: vi.fn() }))
vi.mock('@/lib/admin/contacts', () => ({ ensureContact: vi.fn(async () => null) }))
vi.mock('@/app/actions', () => ({ notifyClientOfProjectChange: vi.fn() }))

import { updateLead } from '@/app/calls-actions'
import type { LeadPayload } from '@/app/calls-actions'

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const GUARD_008 = read('008_calendar_overlap_guard.sql')
const GUARD_044 = read('044_cross_table_overlap_guard.sql')
const MIGRATION = read('105_propojeni_kalendar_hovory.sql')

let db: PGlite

/** Prázdná tabulková kostra v tom stavu, v jakém ji nechaly migrace 001–104. */
const SCHEMA = `
  CREATE TABLE contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL,
    phone text,
    email text
  );
  CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name text NOT NULL,
    client_email text,
    client_phone text,
    description text,
    status text NOT NULL DEFAULT 'new',
    lead_origin text NOT NULL DEFAULT 'vizeon',
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE calendar_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    event_type text NOT NULL DEFAULT 'manual',
    project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    lead_origin text NOT NULL DEFAULT 'vizeon',
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE client_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    contact_name text,
    phone text,
    email text,
    lead_status text DEFAULT 'cold',
    next_action text,
    next_action_date date,
    next_action_time time,
    next_action_type text,
    notes text,
    estimated_value numeric,
    call_answered boolean,
    reminder_day_before_sent boolean DEFAULT false,
    reminder_2h_before_sent boolean DEFAULT false,
    portfolio_sent_at timestamptz,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz
  );
  ALTER TABLE calendar_events ADD COLUMN lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL;
  CREATE TABLE consultation_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scheduled_at timestamptz NOT NULL UNIQUE,
    channel text NOT NULL DEFAULT 'phone',
    channel_other_text text,
    client_wish text NOT NULL DEFAULT '',
    meeting_link text,
    client_email text,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
  );
`

const payload = (over: Partial<LeadPayload> = {}): LeadPayload => ({
  company_name: 'Kavárna Ukázková',
  contact_name: 'Jana Ukázková',
  phone: '+420777123456',
  email: 'jana@example.cz',
  lead_status: 'warm',
  next_action: 'Zavolat',
  next_action_date: '2026-11-20',
  next_action_time: '09:00',
  next_action_type: 'call',
  notes: null,
  estimated_value: null,
  call_answered: null,
  ...over,
})

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params)
  return res.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(GUARD_008)
  await db.exec(GUARD_044)
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
}, 60_000)

afterAll(() => {
  setAdminDbForTests(null)
})

beforeEach(async () => {
  await db.exec(`DELETE FROM client_leads; DELETE FROM consultation_slots; DELETE FROM calendar_events; DELETE FROM projects; DELETE FROM contacts;`)
})

describe('migrace 105', () => {
  it('jde pustit dvakrát po sobě', async () => {
    await db.exec(MIGRATION)
    await db.exec(MIGRATION)
    const row = await one<{ n: number }>(`SELECT count(*)::int AS n FROM consultation_slots`)
    expect(row.n).toBe(0)
  })

  it('přidala obě strany dvojice', async () => {
    const row = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE (table_name = 'consultation_slots' AND column_name = 'calendar_event_id')
         OR (table_name = 'calendar_events' AND column_name = 'consultation_slot_id')
    `)
    expect(row.n).toBe(2)
  })
})

describe('přesun termínu v Hovorech', () => {
  async function leadWithEvent(): Promise<{ leadId: string; eventId: string }> {
    const event = await one<{ id: string }>(`
      INSERT INTO calendar_events (title, starts_at, ends_at)
      VALUES ('Hovor s Janou', '2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z')
      RETURNING id::text AS id
    `)
    const lead = await one<{ id: string }>(`
      INSERT INTO client_leads (company_name, next_action_date, next_action_time, calendar_event_id,
                                reminder_day_before_sent, reminder_2h_before_sent)
      VALUES ('Kavárna Ukázková', '2026-11-20', '09:00', $1, true, true)
      RETURNING id::text AS id
    `, [event.id])
    return { leadId: lead.id, eventId: event.id }
  }

  it('přepíše čas i v kalendáři a nechá termín stejně dlouhý', async () => {
    const { leadId, eventId } = await leadWithEvent()

    await updateLead(leadId, payload({ next_action_date: '2026-11-21', next_action_time: '14:30' }))

    // Porovnává se okamžik, ne text: `::text` by se vykreslil v zóně sezení.
    const event = await one<{ starts_at: string; ends_at: string }>(`
      SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS starts_at,
             to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS ends_at
      FROM calendar_events WHERE id = $1
    `, [eventId])
    // 14:30 v Praze v listopadu = 13:30 UTC; délka zůstala hodinová.
    expect(event.starts_at).toBe('2026-11-21 13:30')
    expect(event.ends_at).toBe('2026-11-21 14:30')

    const lead = await one<{ next_action_date: string; next_action_time: string; den: boolean; dve: boolean }>(`
      SELECT next_action_date::text, next_action_time::text,
             reminder_day_before_sent AS den, reminder_2h_before_sent AS dve
      FROM client_leads WHERE id = $1
    `, [leadId])
    expect(lead.next_action_date).toBe('2026-11-21')
    expect(lead.next_action_time).toBe('14:30:00')
    // Přesunutý termín se musí připomenout znovu.
    expect(lead.den).toBe(false)
    expect(lead.dve).toBe(false)
  })

  it('beze změny času nechá připomínky i termín na pokoji', async () => {
    const { leadId, eventId } = await leadWithEvent()

    await updateLead(leadId, payload({ notes: 'Volala, že se ozve.' }))

    const lead = await one<{ den: boolean; dve: boolean; notes: string }>(`
      SELECT reminder_day_before_sent AS den, reminder_2h_before_sent AS dve, notes
      FROM client_leads WHERE id = $1
    `, [leadId])
    expect(lead.notes).toBe('Volala, že se ozve.')
    expect(lead.den).toBe(true)
    expect(lead.dve).toBe(true)

    const event = await one<{ starts_at: string }>(
      `SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS starts_at
       FROM calendar_events WHERE id = $1`, [eventId],
    )
    expect(event.starts_at).toBe('2026-11-20 08:00')
  })

  it('kontakt bez termínu v kalendáři projde jako dřív', async () => {
    const lead = await one<{ id: string }>(`
      INSERT INTO client_leads (company_name) VALUES ('Bez termínu') RETURNING id::text AS id
    `)
    await updateLead(lead.id, payload({ next_action_date: null, next_action_time: null }))
    const row = await one<{ next_action_date: string | null }>(
      `SELECT next_action_date::text FROM client_leads WHERE id = $1`, [lead.id],
    )
    expect(row.next_action_date).toBeNull()
  })

  it('kolizi s jinou událostí odmítne českou hláškou', async () => {
    const { leadId } = await leadWithEvent()
    await db.query(`
      INSERT INTO calendar_events (title, starts_at, ends_at)
      VALUES ('Obsazeno', '2026-11-25T10:00:00Z', '2026-11-25T11:00:00Z')
    `)
    await expect(
      updateLead(leadId, payload({ next_action_date: '2026-11-25', next_action_time: '11:30' })),
    ).rejects.toThrow(/překrývá/)
  })
})

describe('rezervace z portálu', () => {
  async function slot(at = '2026-12-01T09:00:00Z'): Promise<{ projectId: string; slotId: string }> {
    const contact = await one<{ id: string }>(
      `INSERT INTO contacts (display_name, phone) VALUES ('Jana Ukázková', '+420777123456') RETURNING id::text AS id`,
    )
    const project = await one<{ id: string }>(`
      INSERT INTO projects (client_name, client_email, client_phone, contact_id)
      VALUES ('Kavárna Ukázková', 'kavarna@example.cz', '+420777123456', $1)
      RETURNING id::text AS id
    `, [contact.id])
    const row = await one<{ id: string }>(`
      INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish, client_email)
      VALUES ($1, $2, 'phone', 'Chci nový web.', 'jana@example.cz')
      RETURNING id::text AS id
    `, [project.id, at])
    return { projectId: project.id, slotId: row.id }
  }

  it('založí termín v kalendáři i kontakt v Hovorech', async () => {
    const { projectId, slotId } = await slot()
    const paired = await one<{ event_id: string }>(`SELECT admin_slot_ensure_event($1)::text AS event_id`, [slotId])

    const event = await one<{ id: string; title: string; project_id: string; lead_id: string; slot: string }>(`
      SELECT id::text, title, project_id::text, lead_id::text, consultation_slot_id::text AS slot
      FROM calendar_events
    `)
    expect(event.id).toBe(paired.event_id)
    expect(event.title).toBe('Konzultace: Kavárna Ukázková')
    expect(event.project_id).toBe(projectId)
    expect(event.slot).toBe(slotId)

    const lead = await one<{ id: string; phone: string; email: string; contact_id: string; next_action_time: string }>(`
      SELECT id::text, phone, email, contact_id::text, next_action_time::text FROM client_leads
    `)
    expect(lead.id).toBe(event.lead_id)
    // Z Hovorů jde hned zavolat i napsat — to je celý smysl zrcadlení.
    expect(lead.phone).toBe('+420777123456')
    expect(lead.email).toBe('jana@example.cz')
    expect(lead.contact_id).not.toBeNull()
    // 9:00 UTC v prosinci = 10:00 v Praze.
    expect(lead.next_action_time).toBe('10:00:00')

    const back = await one<{ event_id: string; contact_id: string }>(
      `SELECT calendar_event_id::text AS event_id, contact_id::text FROM consultation_slots WHERE id = $1`, [slotId],
    )
    expect(back.event_id).toBe(paired.event_id)
    expect(back.contact_id).not.toBeNull()
  })

  it('druhé spuštění nic nepřidá (idempotentní)', async () => {
    const { slotId } = await slot()
    const first = await one<{ id: string }>(`SELECT admin_slot_ensure_event($1)::text AS id`, [slotId])
    const second = await one<{ id: string }>(`SELECT admin_slot_ensure_event($1)::text AS id`, [slotId])
    expect(second.id).toBe(first.id)

    const counts = await one<{ events: number; leads: number }>(`
      SELECT (SELECT count(*)::int FROM calendar_events) AS events,
             (SELECT count(*)::int FROM client_leads) AS leads
    `)
    expect(counts).toEqual({ events: 1, leads: 1 })
  })

  it('cizí překryv guard pořád zastaví', async () => {
    const { slotId } = await slot('2026-12-02T09:00:00Z')
    // Událost, která nestojí na čase rezervace (tu by guard nepustil už při
    // vkládání), ale do její hodiny zasahuje — párování proto musí selhat.
    await db.query(`
      INSERT INTO calendar_events (title, starts_at, ends_at)
      VALUES ('Obsazeno', '2026-12-02T09:30:00Z', '2026-12-02T10:30:00Z')
    `)
    await expect(db.query(`SELECT admin_slot_ensure_event($1)`, [slotId])).rejects.toThrow(/překrývá/)

    // Rezervace zůstává v databázi — jen bez dvojice.
    const row = await one<{ event_id: string | null }>(
      `SELECT calendar_event_id::text AS event_id FROM consultation_slots WHERE id = $1`, [slotId],
    )
    expect(row.event_id).toBeNull()
  })
})
