import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'

/**
 * Kontakt u události v kalendáři (oprava 2026-11-18) proti skutečnému Postgresu.
 *
 * Dřív se telefon a e-mail z okna „Upravit v kalendáři" zdánlivě neukládaly:
 *  - založení události dělalo CTE, jehož závěrečný `UPDATE … SET lead_id`
 *    vložený řádek nevidí, takže `calendar_events.lead_id` zůstalo prázdné,
 *  - kalendář četl kontakt jen přes `lead_id`, úprava psala jen přes
 *    `calendar_event_id` — kontakt se uložil, ale nikdy neukázal,
 *  - událost úplně bez dvojice vyplněný kontakt tiše zahodila.
 */

let db: PGlite

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))
vi.mock('@/lib/auth', () => ({ requireAuth: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/admin/contacts', () => ({ ensureContact: async () => null }))

import { createCalendarEvent, updateCalendarEvent } from '@/app/calendar-actions'
import { loadCalendarWindow } from '@/lib/admin/calendar'

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

/** Kostra tabulek ve stavu po migracích 051 a 105 (jen to, na co se tu sahá). */
const SCHEMA = `
  CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name text NOT NULL,
    deadline date
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
    reminder_day_before_sent boolean DEFAULT false,
    reminder_2h_before_sent boolean DEFAULT false,
    contact_id uuid,
    calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
    updated_at timestamptz
  );
  ALTER TABLE calendar_events ADD COLUMN lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL;
  CREATE UNIQUE INDEX calendar_events_lead_id_key ON calendar_events(lead_id) WHERE lead_id IS NOT NULL;
  CREATE UNIQUE INDEX client_leads_calendar_event_id_key ON client_leads(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
  CREATE TABLE consultation_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scheduled_at timestamptz NOT NULL UNIQUE,
    channel text NOT NULL DEFAULT 'phone',
    channel_other_text text,
    client_wish text NOT NULL DEFAULT '',
    meeting_link text,
    client_email text,
    contact_id uuid,
    created_at timestamptz DEFAULT now()
  );
`

const MIGRATION_120 = read('120_kalendar_doplneni_lead_id.sql')

async function one<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(text, params)
  return res.rows[0]
}

const base = {
  title: 'KOČOVI - schůzka',
  description: null,
  starts_at: '2026-11-23T15:00:00.000Z',
  ends_at: '2026-11-23T16:00:00.000Z',
  event_type: 'manual' as const,
}

async function eventOnDay(title: string) {
  const data = await loadCalendarWindow({ from: '2026-11-23', to: '2026-11-23' })
  return data.events.find((e) => e.title === title)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(read('008_calendar_overlap_guard.sql'))
  await db.exec(read('044_cross_table_overlap_guard.sql'))
  await db.exec(read('105_propojeni_kalendar_hovory.sql'))
  setAdminDbForTests(pgliteAdminDriver(db))
}, 60_000)

afterAll(() => setAdminDbForTests(null))

beforeEach(async () => {
  await db.exec(`UPDATE calendar_events SET lead_id = NULL; DELETE FROM client_leads; DELETE FROM calendar_events;`)
})

describe('nová událost z kalendáře', () => {
  it('dostane lead_id a vrátí své id (asistent na něm staví „Zpět")', async () => {
    const { id } = await createCalendarEvent({ ...base, phone: '+420777000111', email: 'kocovi@example.cz' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const row = await one<{ lead_id: string | null; pair: string | null }>(
      `SELECT e.lead_id::text, l.calendar_event_id::text AS pair
       FROM calendar_events e LEFT JOIN client_leads l ON l.id = e.lead_id WHERE e.id = $1`,
      [id],
    )
    expect(row.lead_id).not.toBeNull()
    expect(row.pair).toBe(id)
  })

  it('kontakt z formuláře je hned vidět v kalendáři', async () => {
    await createCalendarEvent({ ...base, contact_name: 'Pavel Kočí', phone: '+420777000111', email: 'kocovi@example.cz' })
    const ev = await eventOnDay(base.title)
    expect(ev?.contact_phone).toBe('+420777000111')
    expect(ev?.contact_email).toBe('kocovi@example.cz')
    expect(ev?.contact_person).toBe('Pavel Kočí')
  })

  it('blokace do Hovorů nejde a id vrátí taky', async () => {
    const { id } = await createCalendarEvent({ ...base, title: 'Dovolená', event_type: 'block' })
    expect(id).not.toBeNull()
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM client_leads`)
    expect(n.n).toBe(0)
  })
})

describe('úprava události', () => {
  it('doplněný telefon a e-mail se uloží a ukážou', async () => {
    const { id } = await createCalendarEvent(base)
    await updateCalendarEvent(id!, { ...base, phone: '+420777000222', email: 'novy@example.cz' })

    const ev = await eventOnDay(base.title)
    expect(ev?.contact_phone).toBe('+420777000222')
    expect(ev?.contact_email).toBe('novy@example.cz')
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM client_leads`)
    expect(n.n).toBe(1)
  })

  it('stará událost s prázdným lead_id kontakt ukáže a úprava dvojici opraví', async () => {
    // Stav po dřívějším `insertEvent`: kontakt ukazuje na událost, událost na nic.
    const ev = await one<{ id: string }>(
      `INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING id::text`,
      [base.title, base.starts_at, base.ends_at],
    )
    await db.query(
      `INSERT INTO client_leads (company_name, phone, calendar_event_id) VALUES ($1, '+420777000333', $2)`,
      [base.title, ev.id],
    )

    // Čtení najde kontakt i bez lead_id.
    expect((await eventOnDay(base.title))?.contact_phone).toBe('+420777000333')
    // Do pole Jméno se nepropíše název události.
    expect((await eventOnDay(base.title))?.contact_person).toBeNull()

    await updateCalendarEvent(ev.id, { ...base, phone: '+420777000444', email: 'opraveno@example.cz' })
    const row = await one<{ lead_id: string | null; phone: string; n: number }>(
      `SELECT e.lead_id::text, l.phone, (SELECT count(*)::int FROM client_leads) AS n
       FROM calendar_events e JOIN client_leads l ON l.id = e.lead_id WHERE e.id = $1`,
      [ev.id],
    )
    expect(row.lead_id).not.toBeNull()
    expect(row.phone).toBe('+420777000444')
    expect(row.n).toBe(1)
  })

  it('událost úplně bez kontaktu v Hovorech ho úpravou dostane', async () => {
    const ev = await one<{ id: string }>(
      `INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING id::text`,
      [base.title, base.starts_at, base.ends_at],
    )
    await updateCalendarEvent(ev.id, { ...base, contact_name: 'Pavel Kočí', phone: '+420777000555', email: 'kocovi@example.cz' })

    const shown = await eventOnDay(base.title)
    expect(shown?.contact_phone).toBe('+420777000555')
    expect(shown?.contact_email).toBe('kocovi@example.cz')
    const lead = await one<{ calendar_event_id: string; next_action_type: string }>(
      `SELECT calendar_event_id::text, next_action_type FROM client_leads`,
    )
    expect(lead.calendar_event_id).toBe(ev.id)
    expect(lead.next_action_type).toBe('other')
  })

  it('blokace při úpravě kontakt v Hovorech nezaloží', async () => {
    const { id } = await createCalendarEvent({ ...base, title: 'Dovolená', event_type: 'block' })
    await updateCalendarEvent(id!, { ...base, title: 'Dovolená', event_type: 'block' })
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM client_leads`)
    expect(n.n).toBe(0)
  })
})

describe('migrace 120', () => {
  it('doplní lead_id u rozbitých dvojic a jde pustit dvakrát', async () => {
    const ev = await one<{ id: string }>(
      `INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING id::text`,
      [base.title, base.starts_at, base.ends_at],
    )
    const lead = await one<{ id: string }>(
      `INSERT INTO client_leads (company_name, calendar_event_id) VALUES ($1, $2) RETURNING id::text`,
      [base.title, ev.id],
    )
    await db.exec(MIGRATION_120)
    await db.exec(MIGRATION_120)
    const row = await one<{ lead_id: string }>(`SELECT lead_id::text FROM calendar_events WHERE id = $1`, [ev.id])
    expect(row.lead_id).toBe(lead.id)
  })
})
