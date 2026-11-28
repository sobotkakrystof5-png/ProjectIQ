import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Jeden klient, jedny údaje (R-141) proti skutečnému Postgresu se SQL
 * z migrací 114, 115, 128 a 130: firma od AI asistenta → kontakt → Hovory,
 * zakázka a budoucí schůzka. Pravidlo: nová hodnota nahradí prázdné místo
 * nebo starou hodnotu, ručně zadanou jinou nechá být.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { ingestOutreachLeads, loadOutreachQueue, loadOutreachSource } from '@/lib/admin/outreach'
import { ensureContact, saveContactFields, suggestContacts } from '@/lib/admin/contacts'
import { absorbIntoContact, propagateContact, syncOutreachContact } from '@/lib/admin/contact-sync'
import { scheduleOutreachMeeting } from '@/lib/admin/meetings'
import { outreachPayloadSchema } from '@/types/outreach'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL, company text, email text, phone text, source text,
  ico text, dic text, note text,
  merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);
CREATE UNIQUE INDEX contacts_email_uq ON contacts (lower(email)) WHERE merged_into IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_uq ON contacts (phone) WHERE merged_into IS NULL AND phone IS NOT NULL;
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
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text, client_email text, client_phone text,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
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

const MIGRATIONS = ['114_hovory_od_asistenta.sql', '115_schuzky_google_meet.sql', '128_schuzky_pripominky.sql', '130_kontakt_jeden_zdroj.sql']

function snapshot(overrides: Record<string, unknown> = {}) {
  return outreachPayloadSchema.parse({
    version: 1,
    leads: [
      {
        external_id: 'vizeon-outreach:1',
        updated_at: new Date().toISOString(),
        company: 'Topenářství Testové',
        contact_name: 'Jan Test',
        phone: '+420777000001',
        email: 'jan@example.cz',
        status: 'accepted',
        ...overrides,
      },
    ],
  }).leads
}

let tick = 0
/** Každý další snímek o vteřinu novější — starší by novější nepřepsal. */
async function ingest(overrides: Record<string, unknown> = {}) {
  tick += 1
  await ingestOutreachLeads(snapshot({ updated_at: new Date(Date.now() + tick * 1000).toISOString(), ...overrides }))
  const rows = await db.query<{ id: string }>(`SELECT id::text FROM outreach_leads WHERE external_id = 'vizeon-outreach:1'`)
  return rows.rows[0].id
}

async function contactOf(outreachId: string) {
  return (
    await db.query<{ id: string; email: string | null; phone: string | null; source: string }>(
      `SELECT c.id::text, c.email, c.phone, c.source FROM outreach_leads o JOIN contacts c ON c.id = o.contact_id WHERE o.id = $1`,
      [outreachId],
    )
  ).rows[0]
}

function inDays(days: number): Date {
  const d = new Date(Date.now() + days * 86_400_000)
  d.setUTCHours(13, 0, 0, 0)
  return d
}

/** Kontakt v Hovorech + zakázka + budoucí schůzka s Meetem, vše na jednom kontaktu. */
async function clientWithMeeting(contactId: string, values: { email: string | null; phone: string | null }) {
  const lead = await db.query<{ id: string }>(
    `INSERT INTO client_leads (company_name, phone, email, contact_id) VALUES ('Topenářství Testové', $1, $2, $3) RETURNING id::text`,
    [values.phone, values.email, contactId],
  )
  const leadId = lead.rows[0].id
  await db.query(`INSERT INTO projects (client_name, client_email, client_phone, contact_id) VALUES ('Jan Test', $1, $2, $3)`, [
    values.email,
    values.phone,
    contactId,
  ])
  const start = inDays(3)
  const ev = await db.query<{ id: string }>(
    `INSERT INTO calendar_events (title, starts_at, ends_at, lead_id, meet_url, invite_status, invite_to, meeting_phone, reminders_on)
     VALUES ('Schůzka', $1, $2, $3, 'https://meet.google.com/abc-defg-hij', 'sent', $4, $5, true) RETURNING id::text`,
    [start.toISOString(), new Date(start.getTime() + 30 * 60_000).toISOString(), leadId, values.email, values.phone],
  )
  return { leadId, eventId: ev.rows[0].id }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const m of MIGRATIONS) {
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
  await db.exec(`
    DELETE FROM meeting_reminders; DELETE FROM calendar_events; DELETE FROM projects;
    DELETE FROM client_leads; DELETE FROM outreach_leads; DELETE FROM contacts;
  `)
})

describe('firma od AI asistenta', () => {
  it('řekne ano → dostane kontakt s e-mailem a telefonem a fronta je čte z něj', async () => {
    const id = await ingest()
    const contact = await contactOf(id)
    expect(contact).toMatchObject({ email: 'jan@example.cz', phone: '+420777000001', source: 'growth-os' })

    const row = (await loadOutreachQueue()).rows.find((r) => r.id === id)
    expect(row?.contactId).toBe(contact.id)
    expect(row?.email).toBe('jan@example.cz')
  })

  it('firma, která nově řekla ano, je ve snímku mezi souhlasy jen jednou (rozbor se spustí sám, R-158)', async () => {
    const at = () => new Date(Date.now() + ++tick * 1000).toISOString()
    expect((await ingestOutreachLeads(snapshot({ status: 'no_answer', updated_at: at() }))).consented).toEqual([])
    const second = await ingestOutreachLeads(snapshot({ updated_at: at() }))
    const id = (await db.query<{ id: string }>(`SELECT id::text FROM outreach_leads WHERE external_id = 'vizeon-outreach:1'`)).rows[0].id
    expect(second.consented).toEqual([(await contactOf(id)).id])
    // Další snímek téže firmy (i s jiným telefonem) už nový souhlas není.
    expect((await ingestOutreachLeads(snapshot({ updated_at: at(), phone: '+420777000009' }))).consented).toEqual([])
  })

  it('bez souhlasu (nezvedl) do Kontaktů nejde', async () => {
    const id = await ingest({ status: 'no_answer' })
    expect(await contactOf(id)).toBeUndefined()
    expect((await db.query(`SELECT 1 FROM contacts`)).rows).toHaveLength(0)
  })

  it('kontakt se stejným telefonem bez e-mailu si e-mail od Growth OS vezme', async () => {
    await db.query(`INSERT INTO contacts (display_name, phone) VALUES ('Jan Test', '+420777000001')`)
    const id = await ingest()
    const contact = await contactOf(id)
    expect(contact.email).toBe('jan@example.cz')
    expect((await db.query(`SELECT 1 FROM contacts`)).rows).toHaveLength(1)
  })

  it('oprava v Kontaktech má přednost: další snímek se starým e-mailem ji nepřepíše', async () => {
    const id = await ingest()
    const contact = await contactOf(id)
    const saved = await saveContactFields(contact.id, {
      display_name: 'Jan Test',
      company: null,
      email: 'majitel@example.cz',
      phone: '+420777000001',
      ico: null,
      dic: null,
      note: null,
    })
    expect(saved.ok).toBe(true)

    await ingest({ attempts: 2 }) // Growth OS pořád posílá jan@example.cz
    expect((await contactOf(id)).email).toBe('majitel@example.cz')
    expect((await loadOutreachSource(id))?.email).toBe('majitel@example.cz')
  })

  it('nový e-mail od Growth OS nahradí ten, který poslal minule', async () => {
    const id = await ingest()
    await ingest({ email: 'novy@example.cz' })
    expect((await contactOf(id)).email).toBe('novy@example.cz')
  })

  it('e-mail z pozvánky na schůzku si kontakt zapamatuje, když žádný neměl', async () => {
    const id = await ingest({ email: null })
    expect((await contactOf(id)).email).toBeNull()
    const result = await scheduleOutreachMeeting(
      {
        outreachId: id,
        startsAt: inDays(2).toISOString(),
        minutes: 30,
        sendInvite: true,
        inviteTo: 'zadany@example.cz',
        subject: 'Naše schůzka',
        intro: 'Dobrý den.',
      },
      {
        createMeet: vi.fn(async () => ({ googleEventId: 'g-1', meetUrl: 'https://meet.google.com/abc-defg-hij' })),
        deleteMeet: vi.fn(async () => {}),
      },
    )
    expect(result.ok).toBe(true)
    expect((await contactOf(id)).email).toBe('zadany@example.cz')
    // A Hovory, kam schůzka zapsala kontakt, ho mají taky.
    const lead = await db.query<{ email: string | null }>(`SELECT email FROM client_leads`)
    expect(lead.rows[0].email).toBe('zadany@example.cz')
  })
})

describe('propsání z kontaktu', () => {
  it('nový e-mail a telefon v kontaktu: Hovory, zakázka i budoucí schůzka se přepíšou', async () => {
    const contactId = (await ensureContact({ name: 'Jan Test', email: 'stary@example.cz', phone: '+420777000001' }))!
    const { leadId, eventId } = await clientWithMeeting(contactId, { email: 'stary@example.cz', phone: '+420777000001' })

    await db.query(`UPDATE contacts SET email = 'novy@example.cz', phone = '+420777000002' WHERE id = $1`, [contactId])
    await propagateContact(contactId, { email: 'stary@example.cz', phone: '+420777000001' })

    const lead = (await db.query<{ email: string; phone: string }>(`SELECT email, phone FROM client_leads WHERE id = $1`, [leadId])).rows[0]
    expect(lead).toEqual({ email: 'novy@example.cz', phone: '+420777000002' })
    const project = (await db.query<{ client_email: string; client_phone: string }>(`SELECT client_email, client_phone FROM projects`)).rows[0]
    expect(project).toEqual({ client_email: 'novy@example.cz', client_phone: '+420777000002' })
    const ev = (await db.query<{ invite_to: string; meeting_phone: string }>(`SELECT invite_to, meeting_phone FROM calendar_events WHERE id = $1`, [eventId])).rows[0]
    expect(ev).toEqual({ invite_to: 'novy@example.cz', meeting_phone: '+420777000002' })
  })

  it('jinou ručně zadanou adresu nechá být, prázdnou doplní', async () => {
    const contactId = (await ensureContact({ name: 'Jan Test', email: 'stary@example.cz' }))!
    await db.query(
      `INSERT INTO client_leads (company_name, email, contact_id) VALUES ('A', 'kancelar@example.cz', $1), ('B', NULL, $1)`,
      [contactId],
    )
    await db.query(`UPDATE contacts SET email = 'novy@example.cz' WHERE id = $1`, [contactId])
    await propagateContact(contactId, { email: 'stary@example.cz', phone: null })

    const rows = (await db.query<{ company_name: string; email: string }>(`SELECT company_name, email FROM client_leads ORDER BY company_name`)).rows
    expect(rows).toEqual([
      { company_name: 'A', email: 'kancelar@example.cz' },
      { company_name: 'B', email: 'novy@example.cz' },
    ])
  })

  it('telefon zapsaný v Hovorech jinak („777 000 001") se pozná jako stará hodnota', async () => {
    const contactId = (await ensureContact({ name: 'Jan Test', phone: '+420777000001' }))!
    await db.query(`INSERT INTO client_leads (company_name, phone, contact_id) VALUES ('A', '777 000 001', $1)`, [contactId])
    await db.query(`UPDATE contacts SET phone = '+420777000009' WHERE id = $1`, [contactId])
    await propagateContact(contactId, { email: null, phone: '+420777000001' })
    expect((await db.query<{ phone: string }>(`SELECT phone FROM client_leads`)).rows[0].phone).toBe('+420777000009')
  })

  it('schůzka bez telefonu: telefon doplněný v kontaktu přidá i SMS připomínky', async () => {
    const contactId = (await ensureContact({ name: 'Jan Test', email: 'jan@example.cz' }))!
    const { eventId } = await clientWithMeeting(contactId, { email: 'jan@example.cz', phone: null })

    await absorbIntoContact(contactId, { email: null, phone: '777 000 001' })

    const ev = (await db.query<{ meeting_phone: string }>(`SELECT meeting_phone FROM calendar_events WHERE id = $1`, [eventId])).rows[0]
    expect(ev.meeting_phone).toBe('+420777000001')
    const sms = await db.query(`SELECT kind FROM meeting_reminders WHERE event_id = $1 AND channel = 'sms' AND status = 'pending'`, [eventId])
    expect(sms.rows.length).toBeGreaterThan(0)
  })

  it('e-mail, který už má jiný kontakt, se nepřepíše ani nespadne', async () => {
    await ensureContact({ name: 'Eva', email: 'sdileny@example.cz' })
    const jan = (await ensureContact({ name: 'Jan', phone: '+420777000001' }))!
    await expect(absorbIntoContact(jan, { email: 'sdileny@example.cz', phone: null })).resolves.toBeUndefined()
    const row = (await db.query<{ email: string | null }>(`SELECT email FROM contacts WHERE id = $1`, [jan])).rows[0]
    expect(row.email).toBeNull()
  })

  it('úprava v Hovorech: kontakt si vezme novou hodnotu jen místo té staré', async () => {
    const contactId = (await ensureContact({ name: 'Jan Test', email: 'stary@example.cz' }))!
    await absorbIntoContact(contactId, { email: 'novy@example.cz', phone: null }, { email: 'stary@example.cz', phone: null })
    expect((await db.query<{ email: string }>(`SELECT email FROM contacts WHERE id = $1`, [contactId])).rows[0].email).toBe('novy@example.cz')

    // Kontakt mezitím někdo opravil ručně — jiná stará hodnota z Hovorů ho nepřepíše.
    await absorbIntoContact(contactId, { email: 'jiny@example.cz', phone: null }, { email: 'stary@example.cz', phone: null })
    expect((await db.query<{ email: string }>(`SELECT email FROM contacts WHERE id = $1`, [contactId])).rows[0].email).toBe('novy@example.cz')
  })

  it('sloučený kontakt: propis jde přes kořen na celou rodinu', async () => {
    const root = (await ensureContact({ name: 'Jan', email: 'jan@example.cz' }))!
    const twin = (await ensureContact({ name: 'Jan Test', phone: '+420777000001' }))!
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [root, twin])
    await db.query(`INSERT INTO client_leads (company_name, contact_id) VALUES ('A', $1)`, [twin])
    await propagateContact(twin)
    expect((await db.query<{ email: string }>(`SELECT email FROM client_leads`)).rows[0].email).toBe('jan@example.cz')
  })
})

describe('našeptávač kontaktů', () => {
  it('najde podle jména, e-mailu i telefonu zapsaného s mezerami', async () => {
    await ensureContact({ name: 'Jan Novák', company: 'Topenářství', email: 'jan@example.cz', phone: '+420777123456' })
    expect((await suggestContacts('nová'))[0]).toMatchObject({ name: 'Jan Novák', phone: '+420777123456', email: 'jan@example.cz' })
    expect(await suggestContacts('jan@ex')).toHaveLength(1)
    expect(await suggestContacts('777 123')).toHaveLength(1)
    expect(await suggestContacts('j')).toEqual([])
  })

  it('sloučené kontakty nenabízí', async () => {
    const root = (await ensureContact({ name: 'Jan Novák', email: 'jan@example.cz' }))!
    const twin = (await ensureContact({ name: 'Jan Novák', phone: '+420777123456' }))!
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [root, twin])
    expect((await suggestContacts('Novák')).map((c) => c.id)).toEqual([root])
  })
})

describe('migrace 130 nad existujícími daty', () => {
  it('propojí firmu, založí kontakt firmě se souhlasem a doplní Hovory', async () => {
    // Stav před migrací: firma převzatá do Hovorů bez e-mailu, druhá se souhlasem bez kontaktu.
    const contact = await db.query<{ id: string }>(`INSERT INTO contacts (display_name, email) VALUES ('Jan', 'jan@example.cz') RETURNING id::text`)
    const lead = await db.query<{ id: string }>(
      `INSERT INTO client_leads (company_name, contact_id) VALUES ('Topenářství', $1) RETURNING id::text`,
      [contact.rows[0].id],
    )
    await db.query(
      `INSERT INTO outreach_leads (external_id, source_updated_at, company_name, phone, email, status, client_lead_id)
       VALUES ('vizeon-outreach:a', now(), 'Topenářství', '+420777000001', NULL, 'accepted', $1),
              ('vizeon-outreach:b', now(), 'Zámečnictví', '+420777000002', 'zam@example.cz', 'demo_ready', NULL)`,
      [lead.rows[0].id],
    )

    await db.exec(fs.readFileSync(path.join(ROOT, 'migrations', '130_kontakt_jeden_zdroj.sql'), 'utf8'))

    const firms = (
      await db.query<{ external_id: string; email: string | null; phone: string | null }>(
        `SELECT o.external_id, c.email, c.phone FROM outreach_leads o JOIN contacts c ON c.id = o.contact_id ORDER BY o.external_id`,
      )
    ).rows
    expect(firms).toEqual([
      { external_id: 'vizeon-outreach:a', email: 'jan@example.cz', phone: '+420777000001' },
      { external_id: 'vizeon-outreach:b', email: 'zam@example.cz', phone: '+420777000002' },
    ])
    const hovor = (await db.query<{ email: string; phone: string }>(`SELECT email, phone FROM client_leads`)).rows[0]
    expect(hovor).toEqual({ email: 'jan@example.cz', phone: '+420777000001' })
  })

  it('syncOutreachContact u firmy bez telefonu i e-mailu nic nezaloží', async () => {
    await db.query(
      `INSERT INTO outreach_leads (external_id, source_updated_at, company_name, status) VALUES ('vizeon-outreach:c', now(), 'Bez údajů', 'accepted')`,
    )
    const id = (await db.query<{ id: string }>(`SELECT id::text FROM outreach_leads`)).rows[0].id
    // Jméno firmy kontakt neurčí — bez telefonu a e-mailu by vznikla duplicita s každým stejnojmenným.
    expect(await syncOutreachContact(id)).toBeNull()
    expect((await db.query(`SELECT 1 FROM contacts`)).rows).toHaveLength(0)
  })
})
