import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AI leady v Hovorech (AD16) proti skutečnému Postgresu (PGlite).
 *
 * Co se hlídá:
 * - do pruhu jdou **jen nevyřízené**, nejvyšší skóre nahoře,
 * - shrnutí od modelu zůstane oddělené od toho, co napsal člověk,
 * - přepis do Hovorů založí kontakt i řádek a podruhé nic nezdvojí,
 * - „Nezajímavé" lead schová, „Zpět" ho vrátí,
 * - bez migrace 112 se pruh ukáže taky, jen si vyřízení nezapamatuje.
 */

const ROOT = path.resolve(__dirname, '../..')

let db: PGlite

vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/app/calls-actions', () => ({ convertLeadToProject: async () => {} }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { loadAgentLeads } from '@/lib/admin/agent-leads'
import { convertAgentLeadToCall, dismissAgentLead, restoreAgentLead } from '@/app/agent-leads-actions'
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
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE client_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text, phone text, email text,
  lead_status text NOT NULL DEFAULT 'new',
  next_action text, notes text, estimated_value numeric,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE TABLE agent_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  source text NOT NULL DEFAULT 'agent',
  payload_version integer NOT NULL DEFAULT 1,
  lead_origin text NOT NULL DEFAULT 'vizeon',
  received_at timestamptz NOT NULL DEFAULT now(),
  client_name text NOT NULL, client_email text NOT NULL,
  client_phone text, client_company text, client_service text NOT NULL,
  client_budget text, client_deadline text, client_message text,
  lead_score integer NOT NULL, priority text NOT NULL,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_type text NOT NULL DEFAULT 'firma', industry text NOT NULL DEFAULT 'gastro',
  digital_maturity text NOT NULL DEFAULT 'nízká',
  project_complexity text NOT NULL DEFAULT 'střední',
  clarity_of_request text NOT NULL DEFAULT 'jasné',
  summary text NOT NULL,
  communication_strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
`

/** Z migrace 112 jen to, co se týká AI leadů. */
function migration112(): string {
  const raw = fs.readFileSync(path.join(ROOT, 'migrations', '112_hodnoceni_a_predani.sql'), 'utf8')
  return raw
    .split(';')
    .filter((statement) => /agent_leads/.test(statement) && !/ANALYZE/.test(statement))
    .join(';') + ';'
}

async function seed(): Promise<void> {
  await db.query(
    `INSERT INTO agent_leads (lead_id, client_name, client_email, client_phone, client_company,
                              client_service, client_budget, client_message, lead_score, priority,
                              summary, communication_strategy)
     VALUES
       ('a-1', 'Jan Novák', 'jan@example.cz', '+420777123456', 'Kavárna U lípy', 'Web na míru',
        '40–60 tisíc', 'Potřebujeme web i objednávky.', 87, 'HIGH',
        'Rozjetá kavárna, web nemá, rozhoduje majitel.',
        '{"tone":"přátelský","style":"stručně","focus":["rychlost"],"avoid":["žargon"]}'::jsonb),
       ('a-2', 'Petra Malá', 'petra@example.cz', NULL, NULL, 'Oprava webu', NULL, NULL, 42, 'LOW',
        'Drobná oprava, rozpočet neuvedla.', '{}'::jsonb)`,
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(migration112())
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM client_leads; DELETE FROM contacts; DELETE FROM agent_leads;')
  await seed()
})

describe('pruh AI leadů', () => {
  it('ukáže nevyřízené podle skóre a drží odhad modelu zvlášť', async () => {
    const strip = await loadAgentLeads()
    expect(strip.total).toBe(2)
    expect(strip.rows.map((r) => r.score)).toEqual([87, 42])

    const prvni = strip.rows[0]
    expect(prvni.priority).toBe('HIGH')
    expect(prvni.clientMessage).toBe('Potřebujeme web i objednávky.')
    expect(prvni.summary).toBe('Rozjetá kavárna, web nemá, rozhoduje majitel.')
    expect(prvni.strategy.focus).toEqual(['rychlost'])
    // Prázdná strategie nesmí nic shodit.
    expect(strip.rows[1].strategy).toEqual({})
  })

  it('přepis do Hovorů založí kontakt i řádek a podruhé nic nezdvojí', async () => {
    const { rows } = await loadAgentLeads()
    const first = await convertAgentLeadToCall(rows[0].id)
    expect(first.ok).toBe(true)

    const leads = await db.query<{ company_name: string; email: string; notes: string; contact_id: string | null }>(
      `SELECT company_name, email, notes, contact_id::text AS contact_id FROM client_leads`,
    )
    expect(leads.rows).toHaveLength(1)
    expect(leads.rows[0].company_name).toBe('Kavárna U lípy')
    expect(leads.rows[0].contact_id).not.toBeNull()
    // V poznámce je poznat, co je od člověka a co odhad modelu.
    expect(leads.rows[0].notes).toContain('Z formuláře: Potřebujeme web i objednávky.')
    expect(leads.rows[0].notes).toContain('Shrnutí od AI (odhad, ne fakt):')

    // Z pruhu zmizel a druhé kliknutí vrátí týž kontakt.
    expect((await loadAgentLeads()).total).toBe(1)
    const second = await convertAgentLeadToCall(rows[0].id)
    expect(second).toEqual(first)
    expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(1)
  })

  it('„Nezajímavé" lead schová a „Zpět" ho vrátí', async () => {
    const { rows } = await loadAgentLeads()
    await dismissAgentLead(rows[1].id)
    expect((await loadAgentLeads()).total).toBe(1)

    await restoreAgentLead(rows[1].id)
    expect((await loadAgentLeads()).total).toBe(2)
    // Nic se nezaložilo — jen se to schovalo.
    expect((await db.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(0)
  })
})

describe('bez migrace 112', () => {
  let stara: PGlite

  beforeAll(async () => {
    stara = new PGlite()
    await stara.exec(SCHEMA)
    await stara.query(
      `INSERT INTO agent_leads (lead_id, client_name, client_email, client_service, lead_score, priority, summary)
       VALUES ('a-3', 'Jan Novák', 'jan@example.cz', 'Web', 70, 'MEDIUM', 'Shrnutí.')`,
    )
  })

  afterAll(async () => {
    await stara.close()
    setAdminDbForTests(pgliteAdminDriver(db))
  })

  it('pruh se ukáže a vyřízení se jen nezapamatuje', async () => {
    setAdminDbForTests(pgliteAdminDriver(stara))
    const strip = await loadAgentLeads()
    expect(strip.total).toBe(1)

    const result = await convertAgentLeadToCall(strip.rows[0].id)
    expect(result.ok).toBe(true)
    // Kontakt v Hovorech je, razítko se zapsat nemělo kam.
    expect((await stara.query(`SELECT 1 FROM client_leads`)).rows).toHaveLength(1)
    expect((await loadAgentLeads()).total).toBe(1)
  })
})
