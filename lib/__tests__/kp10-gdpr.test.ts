import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePortalMoneyTables } from '@/lib/__tests__/helpers/portal-money-tables'
import { prepareConsultationTables } from '@/lib/__tests__/helpers/consultation-tables'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { setPortalDriverForTests, type PortalDriver, type PortalRow } from '@/lib/portal/db'

let db: PGlite

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))

// KP10 (R-131): GDPR v klientském prostoru — export a výmaz údajů člena
// a doplněná retence. Migrace 127 dvakrát po sobě nad PGlite.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const MA2 = 'aaaaaaaa-0000-4000-8000-000000000a02'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PA2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const portalDriver: PortalDriver = {
  async transaction(queries) {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE portal_app')
      const out: PortalRow[][] = []
      for (const q of queries) out.push((await db.query(q.text, [...q.params])).rows as PortalRow[])
      await db.exec('COMMIT')
      return out
    } catch (err) {
      await db.exec('ROLLBACK')
      throw err
    }
  },
}

async function asClient<T = Record<string, unknown>>(clientId: string, sqlText: string, params: unknown[] = []) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE portal_app')
    await db.query("SELECT set_config('app.client_id', $1, true)", [clientId])
    const res = await db.query<T>(sqlText, params)
    await db.exec('COMMIT')
    return res.rows
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? 'bez kódu')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, focus text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      survey_token uuid DEFAULT gen_random_uuid(), project_type text NOT NULL DEFAULT 'client',
      lead_pending boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE project_surveys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      nps smallint, improve_text text, reference_text text, completed_at timestamptz
    );
    CREATE TABLE api_requests (endpoint text NOT NULL, ip text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  await db.exec(read('migrations', '095_portal_schema.sql'))
  await preparePortalMoneyTables(db)
  await prepareConsultationTables(db)
  for (let i = 0; i < 2; i++) {
    await db.exec(read('migrations', '095_portal_schema.sql'))
    await db.exec(read('migrations', '096_portal_requests_messages.sql'))
    await db.exec(read('migrations', '113_portal_supabase_auth.sql'))
    await db.exec(read('migrations', '121_sluzby_a_etapy.sql'))
    await db.exec(read('migrations', '122_portal_penize_faktury.sql'))
    await db.exec(read('migrations', '123_konzultace_z_volna.sql'))
    await db.exec(read('migrations', '124_chat_s_klientem.sql'))
    await db.exec(read('migrations', '125_prehled_klienta.sql'))
    await db.exec(read('migrations', '126_poptavky_z_webu.sql'))
    await db.exec(read('migrations', '127_gdpr_klientsky_prostor.sql'))
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }
  await db.query(
    `INSERT INTO projects (id, client_name, description, status) VALUES
      ($1, 'Web A', 'Web pro kavárnu', 'in_progress'), ($2, 'Logo A', 'Logo', 'in_progress'),
      ($3, 'Web B', 'Web B', 'in_progress')`,
    [PA, PA2, PB],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA2])
  await db.query('SELECT portal.link_project($1, $2)', [B, PB])
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, name, role) VALUES
      ($1, $2, 'sb-a', 'Jana@Example.cz', 'Jana', 'owner'), ($3, $2, 'sb-a2', 'petr@example.cz', 'Petr', 'member'),
      ($4, $5, 'sb-b', 'eva@example.cz', 'Eva', 'owner')`,
    [MA, A, MA2, MB, B],
  )
  setAdminDbForTests(pgliteAdminDriver(db))
  setPortalDriverForTests(portalDriver)
}, 60_000)

afterAll(async () => {
  setAdminDbForTests(null)
  setPortalDriverForTests(null)
  await db.close()
})

import { purgeClientRetention } from '@/lib/client-retention'

const ATTACH = '11111111-2222-4333-8444-555555555555'
const PATH = 'aaaaaaaa-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-0000000000a1/11111111-2222-4333-8444-555555555555'

const one = async <T,>(sqlText: string, params: unknown[] = []) => (await db.query<T>(sqlText, params)).rows[0]

/** Člen Jana (MA) má zprávu s přílohou, požadavek, konzultaci, úkol a pozvánky. */
async function seedJana() {
  const msg = await one<{ id: string }>(
    `INSERT INTO portal.messages (client_id, project_id, author, member_id, author_name, body)
     VALUES ($1, $2, 'client', $3, 'Jana', 'Moje telefonní číslo je 777 123 456') RETURNING id::text`,
    [A, PA, MA],
  )
  await db.query(
    `INSERT INTO portal.message_attachments (id, client_id, project_id, message_id, storage_path, mime, size_bytes, filename)
     VALUES ($1, $2, $3, $4, $5, 'image/png', 100, 'obcanka.png')`,
    [ATTACH, A, PA, msg.id, PATH],
  )
  await db.query(
    `INSERT INTO portal.messages (client_id, project_id, author, member_id, author_name, body, reply_to)
     VALUES ($1, $2, 'client', $3, 'Petr', 'Souhlasím s Janou', $4), ($1, $2, 'admin', NULL, 'Kryštof', 'Díky, upravím to', NULL)`,
    [A, PA, MA2, msg.id],
  )
  const req = await one<{ id: string }>(`INSERT INTO client_requests (project_id, source, raw_text) VALUES ($1, 'text', 'Změnit logo') RETURNING id::text`, [PA])
  await db.query(
    `INSERT INTO portal.requests (client_id, project_id, member_id, source, body, admin_request_id) VALUES ($1, $2, $3, 'text', 'Změnit logo', $4)`,
    [A, PA, MA, req.id],
  )
  await db.query(
    `INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish, client_email, portal_member_id)
     VALUES ($1, now() + interval '3 days', 'meet', 'Probrat ceník', 'jana@example.cz', $2)`,
    [PA, MA],
  )
  await db.query(
    `INSERT INTO portal.invites (client_id, code_hash, email, expires_at, used_at, used_by) VALUES
      ($1, repeat('a', 64), 'jana@example.cz', now() + interval '1 day', now(), $2),
      ($1, repeat('b', 64), 'JANA@example.cz', now() + interval '1 day', NULL, NULL),
      ($1, repeat('c', 64), 'petr@example.cz', now() + interval '1 day', NULL, NULL)`,
    [A, MA],
  )
  return { messageId: msg.id, requestId: req.id }
}

beforeEach(async () => {
  await db.exec(`
    DELETE FROM portal.message_attachments; DELETE FROM portal.messages; DELETE FROM portal.requests;
    DELETE FROM client_requests; DELETE FROM consultation_slots; DELETE FROM portal.invites; DELETE FROM storage_deletions;
    DELETE FROM project_surveys; DELETE FROM portal.thread_state;
  `)
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, name, role) VALUES ($1, $2, 'sb-a', 'Jana@Example.cz', 'Jana', 'owner')
     ON CONFLICT (id) DO NOTHING`,
    [MA, A],
  )
  await db.query("DELETE FROM portal.members WHERE clerk_user_id = 'sb-a' AND client_id = $1", [B])
})

describe('export údajů člena', () => {
  it('obsahuje jeho zprávy, přílohy, požadavky, konzultace a pozvánky — nic cizího', async () => {
    await seedJana()
    const { e } = await one<{ e: Record<string, unknown[] | Record<string, unknown>> }>('SELECT public.portal_export_member($1) AS e', [MA])
    expect(e.clen).toMatchObject({ email: 'Jana@Example.cz', jmeno: 'Jana', firma: 'Klient A' })
    expect(e.zpravy).toHaveLength(1)
    expect(JSON.stringify(e.zpravy)).toContain('obcanka.png')
    expect(JSON.stringify(e)).not.toContain('Souhlasím s Janou')
    expect(JSON.stringify(e)).not.toContain('Díky, upravím to')
    expect(e.pozadavky).toHaveLength(1)
    expect(JSON.stringify(e.konzultace)).toContain('Probrat ceník')
    // Pozvánky na její e-mail bez ohledu na velikost písmen, ne Petrova.
    expect(e.pozvanky).toHaveLength(2)
  })

  it('neznámý člen = chyba, ne prázdný export', async () => {
    expect(await code(db.query('SELECT public.portal_export_member($1)', ['00000000-0000-4000-8000-000000000000']))).toBe('P0002')
  })
})

describe('výmaz na žádost', () => {
  it('smaže jeho zprávy i s přílohou, požadavky, pozvánky a téma konzultace; cizí nechá', async () => {
    const { requestId } = await seedJana()
    const { r } = await one<{ r: Record<string, unknown> }>('SELECT public.portal_erase_member($1) AS r', [MA])
    expect(r).toMatchObject({ auth_user_id: 'sb-a', auth_user_used_elsewhere: false, messages: 1, attachments: 1, invites: 2, consultations: 1 })

    const bodies = (await db.query<{ body: string; reply_to: string | null }>('SELECT body, reply_to FROM portal.messages ORDER BY body')).rows
    expect(bodies.map((b) => b.body)).toEqual(['Díky, upravím to', 'Souhlasím s Janou'])
    expect(bodies.every((b) => b.reply_to === null)).toBe(true)
    // Soubor ve Storage čeká ve frontě na ranní úklid.
    expect((await db.query('SELECT path FROM storage_deletions')).rows).toEqual([{ path: PATH }])
    expect((await db.query('SELECT 1 FROM client_requests WHERE id = $1', [requestId])).rows).toEqual([])
    expect((await db.query('SELECT 1 FROM portal.requests')).rows).toEqual([])
    expect((await db.query("SELECT email FROM portal.invites")).rows).toEqual([{ email: 'petr@example.cz' }])
    const slot = await one<{ client_wish: string | null; client_email: string | null; portal_member_id: string | null }>(
      'SELECT client_wish, client_email, portal_member_id FROM consultation_slots',
    )
    expect(slot).toEqual({ client_wish: '', client_email: null, portal_member_id: null })
    expect((await db.query('SELECT 1 FROM portal.members WHERE id = $1', [MA])).rows).toEqual([])
    // V projekci pro klienta nezůstalo téma ani autor.
    const proj = await one<{ topic: string; member_id: string | null }>('SELECT topic, member_id FROM portal.consultations')
    expect(proj).toEqual({ topic: '', member_id: null })
  })

  it('s ponecháním zpráv zůstane text firmě, jméno autora zmizí', async () => {
    await seedJana()
    await db.query('SELECT public.portal_erase_member($1, true)', [MA])
    const kept = await one<{ author_name: string | null; member_id: string | null }>(
      "SELECT author_name, member_id FROM portal.messages WHERE body LIKE 'Moje telefonní%'",
    )
    expect(kept).toEqual({ author_name: null, member_id: null })
    expect((await db.query('SELECT 1 FROM storage_deletions')).rows).toEqual([])
  })

  it('účet Supabase sdílený s jiným prostorem se nemá mazat', async () => {
    await db.query(
      `INSERT INTO portal.members (client_id, clerk_user_id, email, name, role) VALUES ($1, 'sb-a', 'jana@example.cz', 'Jana', 'member')`,
      [B],
    )
    const { r } = await one<{ r: Record<string, unknown> }>('SELECT public.portal_erase_member($1) AS r', [MA])
    expect(r.auth_user_used_elsewhere).toBe(true)
  })

  it('klient funkce spustit nesmí', async () => {
    expect(await code(asClient(A, 'SELECT public.portal_export_member($1)', [MA]))).toBe('42501')
    expect(await code(asClient(A, 'SELECT public.portal_erase_member($1)', [MA]))).toBe('42501')
  })
})

describe('retence po třech letech (doplněná)', () => {
  it('maže téma konzultace, slovní části dotazníku a stav čtení; známky a čas nechá', async () => {
    const old = 'cccccccc-0000-4000-8000-0000000000c9'
    await db.query("INSERT INTO projects (id, client_name, status, updated_at) VALUES ($1, 'Stará', 'done', now() - interval '4 years') ON CONFLICT (id) DO NOTHING", [old])
    await db.query('SELECT portal.link_project($1, $2)', [A, old])
    await db.query("UPDATE projects SET updated_at = now() - interval '4 years' WHERE id = $1", [old])
    await db.query(
      `INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish) VALUES ($1, now() - interval '4 years', 'meet', 'Staré téma')`,
      [old],
    )
    await db.query("INSERT INTO project_surveys (project_id, nps, improve_text, reference_text) VALUES ($1, 9, 'Rychleji', 'Skvělá práce')", [old])
    await db.query("INSERT INTO portal.thread_state (project_id, client_id, side, last_read_at) VALUES ($1, $2, 'client', now())", [old, A])
    const run = await purgeClientRetention()
    expect(run.consultation_topics).toBe(1)
    const slot = await one<{ client_wish: string | null; scheduled_at: string }>('SELECT client_wish, scheduled_at FROM consultation_slots WHERE project_id = $1', [old])
    expect(slot.client_wish).toBe('')
    expect(slot.scheduled_at).toBeTruthy()
    expect(await one('SELECT nps, improve_text, reference_text FROM project_surveys WHERE project_id = $1', [old])).toEqual({ nps: 9, improve_text: null, reference_text: null })
    expect((await db.query('SELECT 1 FROM portal.thread_state WHERE project_id = $1', [old])).rows).toEqual([])
  })
})
