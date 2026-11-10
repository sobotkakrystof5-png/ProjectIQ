import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Oddělení klientů v schématu portal (KP05, migrace 095) proti PGlite:
// migrace dvakrát po sobě, práva a RLS jako role portal_app, triggery.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const PX = 'cccccccc-0000-4000-8000-0000000000c1' // zakázka bez klienta
const hashOf = (c: string) => c.repeat(64).slice(0, 64)

let db: PGlite

/** Dotaz jako portal_app s kontextem klienta (jako lib/portal/db.ts). */
async function asClient<T = Record<string, unknown>>(clientId: string | null, sqlText: string, params: unknown[] = []) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE portal_app')
    await db.query("SELECT set_config('app.client_id', $1, true)", [clientId ?? ''])
    const res = await db.query<T>(sqlText, params)
    await db.exec('COMMIT')
    return res.rows
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}

// PGlite + migrace trvají na vytíženém stroji nebo v CI déle než výchozích 10 s.
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  for (let i = 0; i < 2; i++) {
    // idempotence: obě migrace dvakrát po sobě
    await db.exec(read('migrations', '095_portal_schema.sql'))
    await db.exec(read('migrations', '096_portal_requests_messages.sql'))
    await db.exec(read('migrations', '101_portal_supabase_auth.sql'))
    await db.exec(read('migrations', '104_portal_auth_stav.sql'))
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }

  await db.query(
    `INSERT INTO projects (id, client_name, client_email, description, status, progress, price, notes) VALUES
      ($1, 'Firma A', 'a@example.cz', 'Web A', 'in_progress', 40, 50000, 'TAJNÁ POZNÁMKA A'),
      ($2, 'Firma B', 'b@example.cz', 'Web B', 'new', 0, 70000, 'TAJNÁ POZNÁMKA B'),
      ($3, 'Nikoho', NULL, NULL, 'new', 0, 1, NULL)`,
    [PA, PB, PX],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [B, PB])
  await db.query(
    `INSERT INTO project_activity (project_id, status, title, body, published_at) VALUES
      ($1, 'published', 'Hotovo A', 'Text A', now()),
      ($1, 'draft', 'Koncept A', 'Tajný koncept A', NULL),
      ($2, 'published', 'Hotovo B', 'Text B', now())`,
    [PA, PB],
  )
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('role portal_app a schéma public', () => {
  it('nemá žádná práva do public (zakázky, aktivita)', async () => {
    await expect(asClient(A, 'SELECT * FROM public.projects')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM public.project_activity')).rejects.toThrow(/permission denied/)
  })

  it('nevidí pozvánky ani nemůže zapisovat do projekcí', async () => {
    await expect(asClient(A, 'SELECT * FROM portal.invites')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, "UPDATE portal.projects SET name = 'x'")).rejects.toThrow(/permission denied/)
    await expect(asClient(A, "DELETE FROM portal.activity")).rejects.toThrow(/permission denied/)
  })
})

describe('oddělení klientů', () => {
  it('klient A vidí jen svoji zakázku a aktivitu', async () => {
    const projects = await asClient<{ id: string }>(A, 'SELECT id FROM portal.projects')
    expect(projects.map((p) => p.id)).toEqual([PA])
    const activity = await asClient<{ title: string }>(A, 'SELECT title FROM portal.activity')
    expect(activity.map((a) => a.title)).toEqual(['Hotovo A'])
  })

  it('klient B nevidí nic z A, ani když se zeptá přímo na jeho id', async () => {
    expect(await asClient(B, 'SELECT * FROM portal.projects WHERE id = $1', [PA])).toHaveLength(0)
    expect(await asClient(B, 'SELECT * FROM portal.activity WHERE project_id = $1', [PA])).toHaveLength(0)
    expect(await asClient(B, 'SELECT * FROM portal.clients WHERE id = $1', [A])).toHaveLength(0)
  })

  it('bez kontextu klienta (nebo s prázdným) není vidět nic', async () => {
    expect(await asClient(null, 'SELECT * FROM portal.projects')).toHaveLength(0)
    expect(await asClient(null, 'SELECT * FROM portal.activity')).toHaveLength(0)
    expect(await asClient(null, 'SELECT * FROM portal.clients')).toHaveLength(0)
  })

  it('projekce neobsahuje cenu, poznámky, e-mail ani token', async () => {
    const cols = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'portal' AND table_name IN ('projects','activity','clients','members')",
    )
    const names = cols.rows.map((c) => c.column_name)
    for (const forbidden of ['price', 'notes', 'client_email', 'public_token', 'contains_sensitive', 'source', 'published_by']) {
      expect(names, forbidden).not.toContain(forbidden)
    }
    const all = JSON.stringify(await asClient(A, 'SELECT * FROM portal.projects'))
    expect(all).not.toContain('TAJNÁ')
    expect(all).not.toContain('a@example.cz')
  })
})

describe('triggery: do portal jde jen schválené', () => {
  it('koncept se klientovi neukáže, po schválení ano, po zamítnutí zmizí', async () => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO project_activity (project_id, status, title, body) VALUES ($1, 'draft', 'Nový koncept', 'Text') RETURNING id",
      [PA],
    )
    const id = rows[0].id
    const titles = async () => (await asClient<{ title: string }>(A, 'SELECT title FROM portal.activity ORDER BY title')).map((r) => r.title)
    expect(await titles()).not.toContain('Nový koncept')

    await db.query("UPDATE project_activity SET status = 'published', published_at = now() WHERE id = $1", [id])
    expect(await titles()).toContain('Nový koncept')

    await db.query("UPDATE project_activity SET status = 'rejected' WHERE id = $1", [id])
    expect(await titles()).not.toContain('Nový koncept')
  })

  it('aktivita nepropojené zakázky se do portal nedostane', async () => {
    await db.query("INSERT INTO project_activity (project_id, status, title, body, published_at) VALUES ($1, 'published', 'Nikoho', 'x', now())", [PX])
    const { rows } = await db.query("SELECT count(*)::int AS n FROM portal.activity WHERE project_id = $1", [PX])
    expect((rows[0] as { n: number }).n).toBe(0)
  })

  it('změna zakázky se přenese, ale jen vybrané sloupce', async () => {
    await db.query("UPDATE projects SET status = 'review', progress = 90, price = 99999, notes = 'NOVÁ TAJNÁ' WHERE id = $1", [PA])
    const [row] = await asClient<{ status: string; progress: number }>(A, 'SELECT status, progress FROM portal.projects')
    expect(row).toEqual({ status: 'review', progress: 90 })
  })

  it('smazání zakázky smaže projekci i aktivitu', async () => {
    await db.query("INSERT INTO projects (id, client_name) VALUES ('dddddddd-0000-4000-8000-0000000000d1', 'Dočasná')")
    await db.query("SELECT portal.link_project($1, 'dddddddd-0000-4000-8000-0000000000d1')", [A])
    await db.query("INSERT INTO project_activity (project_id, status, title, body, published_at) VALUES ('dddddddd-0000-4000-8000-0000000000d1', 'published', 'Z', 'z', now())")
    await db.query("DELETE FROM projects WHERE id = 'dddddddd-0000-4000-8000-0000000000d1'")
    const p = await db.query("SELECT count(*)::int AS n FROM portal.projects WHERE id = 'dddddddd-0000-4000-8000-0000000000d1'")
    const a = await db.query("SELECT count(*)::int AS n FROM portal.activity WHERE project_id = 'dddddddd-0000-4000-8000-0000000000d1'")
    expect((p.rows[0] as { n: number }).n + (a.rows[0] as { n: number }).n).toBe(0)
  })

  it('zakázku nejde přiřadit druhému klientovi a neexistující vůbec', async () => {
    await expect(db.query('SELECT portal.link_project($1, $2)', [B, PA])).rejects.toThrow(/jinému klientovi/)
    await expect(db.query('SELECT portal.link_project($1, $2)', [A, '99999999-0000-4000-8000-000000000009'])).rejects.toThrow(/neexistuje/)
  })

  it('opětovné propojení téhož klienta je bez chyby (idempotence)', async () => {
    await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  })
})

describe('pozvánky a přihlášení', () => {
  const invite = (hash: string, over: { email?: string | null; expires?: string; role?: string } = {}) =>
    db.query(
      `INSERT INTO portal.invites (client_id, code_hash, email, role, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [A, hash, over.email ?? null, over.role ?? 'member', over.expires ?? '2099-01-01T00:00:00Z'],
    )
  const redeem = async (hash: string, user: string, email = 'novy@example.cz') => {
    const res = await asClient<{ c: string | null }>(null, 'SELECT portal.redeem_invite_for_user($1, $2, $3, $4) AS c', [hash, user, email, 'Jana'])
    return res[0].c
  }

  it('platná pozvánka vytvoří člena a jde použít jen jednou', async () => {
    const h = hashOf('1')
    await invite(h)
    expect(await redeem(h, 'user_1')).toBe(A)
    expect(await redeem(h, 'user_2')).toBeNull()
    const members = await asClient<{ client_id: string }>(null, "SELECT * FROM portal.memberships_for_user('user_1')")
    expect(members.map((m) => m.client_id)).toEqual([A])
  })

  it('prošlá, zrušená, neznámá a cizí pozvánka nic nedá', async () => {
    const expired = hashOf('2')
    const revoked = hashOf('3')
    await invite(expired, { expires: '2020-01-01T00:00:00Z' })
    await invite(revoked)
    await db.query('UPDATE portal.invites SET revoked_at = now() WHERE code_hash = $1', [revoked])
    expect(await redeem(expired, 'user_3')).toBeNull()
    expect(await redeem(revoked, 'user_3')).toBeNull()
    expect(await redeem(hashOf('f'), 'user_3')).toBeNull()
    expect(await asClient(null, "SELECT * FROM portal.memberships_for_user('user_3')")).toHaveLength(0)
  })

  it('pozvánka vázaná na e-mail projde jen se shodným e-mailem (bez ohledu na velikost)', async () => {
    const h = hashOf('4')
    await invite(h, { email: 'Jana@Example.cz' })
    expect(await redeem(h, 'user_4', 'jiny@example.cz')).toBeNull()
    expect(await redeem(h, 'user_4', 'jana@example.cz')).toBe(A)
  })

  it('odebraný člen se nepřihlásí; archivovaný klient taky', async () => {
    const h = hashOf('5')
    await invite(h)
    await redeem(h, 'user_5')
    await db.query("UPDATE portal.members SET removed_at = now() WHERE user_id = 'user_5'")
    expect(await asClient(null, "SELECT * FROM portal.memberships_for_user('user_5')")).toHaveLength(0)

    const h2 = hashOf('6')
    await invite(h2)
    await db.query('UPDATE portal.clients SET archived_at = now() WHERE id = $1', [A])
    expect(await redeem(h2, 'user_6')).toBeNull()
    await db.query('UPDATE portal.clients SET archived_at = NULL WHERE id = $1', [A])
  })

  it('člen vidí členy jen svého klienta', async () => {
    const members = await asClient<{ client_id: string }>(A, 'SELECT client_id FROM portal.members')
    expect(new Set(members.map((m) => m.client_id))).toEqual(new Set([A]))
  })
})

describe('požadavky, zprávy a hodnocení (096)', () => {
  const MEMBER_A = 'aaaaaaaa-0000-4000-8000-0000000000e1'
  const MEMBER_B = 'bbbbbbbb-0000-4000-8000-0000000000e1'

  beforeAll(async () => {
    await db.query("INSERT INTO portal.members (id, client_id, user_id) VALUES ($1, $2, 'mu_a'), ($3, $4, 'mu_b')", [MEMBER_A, A, MEMBER_B, B])
  })

  it('požadavek se zapíše klientovi i adminovi a stav následuje práci admina', async () => {
    const [row] = await asClient<{ id: string; admin_request_id: string }>(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', 'Změňte prosím telefon v patičce.'])
    const admin = await db.query<{ raw_text: string; status: string }>('SELECT raw_text, status FROM client_requests WHERE id = $1', [row.admin_request_id])
    expect(admin.rows[0]).toEqual({ raw_text: 'Změňte prosím telefon v patičce.', status: 'new' })

    await db.query("UPDATE client_requests SET status = 'done' WHERE id = $1", [row.admin_request_id])
    const mine = await asClient<{ status: string }>(A, 'SELECT status FROM portal.requests WHERE id = $1', [row.id])
    expect(mine[0].status).toBe('done')
    expect(await asClient(B, 'SELECT * FROM portal.requests WHERE id = $1', [row.id])).toHaveLength(0)
  })

  it('cizí zakázka ani cizí člen neprojde', async () => {
    await expect(asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PB, MEMBER_A, 'text', 'Cizí zakázka'])).rejects.toThrow(/not_found/)
    await expect(asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_B, 'text', 'Cizí člen'])).rejects.toThrow(/not_found/)
    await expect(asClient(null, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', 'Bez klienta'])).rejects.toThrow(/not_found/)
  })

  it('hlídá délky a limit 5 požadavků za 30 minut', async () => {
    await expect(asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', 'ab'])).rejects.toThrow(/invalid/)
    await expect(asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', 'x'.repeat(3001)])).rejects.toThrow(/invalid/)
    for (let i = 0; i < 4; i++) await asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', `Požadavek číslo ${i}`])
    await expect(asClient(A, 'SELECT * FROM portal.submit_request($1, $2, $3, $4)', [PA, MEMBER_A, 'text', 'Šestý v řadě'])).rejects.toThrow(/rate_limited/)
  })

  it('klient nemůže zapisovat do tabulek přímo ani číst fronty admina', async () => {
    await expect(asClient(A, "INSERT INTO portal.requests (client_id, project_id, member_id, source, body) VALUES ($1, $2, $3, 'text', 'přímo')", [A, PA, MEMBER_A])).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM client_requests')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM client_feedback')).rejects.toThrow(/permission denied/)
  })

  it('zprávy: klient píše, admin odpovídá, klienti se nevidí navzájem', async () => {
    await asClient(A, 'SELECT portal.submit_message($1, $2, $3)', [PA, MEMBER_A, 'Dobrý den, kdy bude hotovo?'])
    await db.query("INSERT INTO portal.messages (client_id, project_id, author, body) VALUES ($1, $2, 'admin', 'Do pátku.')", [A, PA])
    const mine = await asClient<{ author: string }>(A, 'SELECT author FROM portal.messages ORDER BY created_at, author')
    expect(mine.map((m) => m.author).sort()).toEqual(['admin', 'client'])
    expect(await asClient(B, 'SELECT * FROM portal.messages')).toHaveLength(0)
    await expect(asClient(A, 'SELECT portal.submit_message($1, $2, $3)', [PA, MEMBER_A, '   '])).rejects.toThrow(/invalid/)
  })

  it('hodnocení jen u hotové zakázky, jednou na člena, a zapíše se i adminovi', async () => {
    await db.query("UPDATE projects SET status = 'in_progress' WHERE id = $1", [PA])
    await expect(asClient(A, 'SELECT portal.submit_feedback($1, $2, $3, $4)', [PA, MEMBER_A, 9, 'Super'])).rejects.toThrow(/not_done/)

    await db.query("UPDATE projects SET status = 'done' WHERE id = $1", [PA])
    await expect(asClient(A, 'SELECT portal.submit_feedback($1, $2, $3, $4)', [PA, MEMBER_A, 11, null])).rejects.toThrow(/invalid/)
    await asClient(A, 'SELECT portal.submit_feedback($1, $2, $3, $4)', [PA, MEMBER_A, 9, 'Super'])
    await expect(asClient(A, 'SELECT portal.submit_feedback($1, $2, $3, $4)', [PA, MEMBER_A, 8, null])).rejects.toThrow(/already_rated/)
    const admin = await db.query<{ nps: number }>('SELECT nps FROM client_feedback WHERE project_id = $1', [PA])
    expect(admin.rows).toEqual([{ nps: 9 }])
    expect(await asClient(B, 'SELECT * FROM portal.feedback')).toHaveLength(0)
  })

  it('odebraný člen už nic neodešle', async () => {
    await db.query('UPDATE portal.members SET removed_at = now() WHERE id = $1', [MEMBER_A])
    await expect(asClient(A, 'SELECT portal.submit_message($1, $2, $3)', [PA, MEMBER_A, 'Ještě tu jsem'])).rejects.toThrow(/not_found/)
  })
})

describe('stav přihlášení (portal.auth_state, R-081)', () => {
  const USER = '0b9f3c8e-1a2b-4c3d-8e9f-001122334455'
  const SESSION = '5a6b7c8d-9e0f-4a1b-8c2d-334455667788'

  it('bez schématu auth (mimo Supabase): relace platí, 2FA není', async () => {
    expect(await asClient(null, 'SELECT * FROM portal.auth_state($1, $2)', [USER, SESSION])).toEqual([{ session_ok: true, mfa_enrolled: false }])
  })

  it('se schématem auth: zrušená relace, prošlá relace a zapnuté 2FA', async () => {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);
      CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, status text NOT NULL);
    `)
    try {
      const state = () => asClient(null, 'SELECT * FROM portal.auth_state($1, $2)', [USER, SESSION])
      expect(await state()).toEqual([{ session_ok: false, mfa_enrolled: false }])

      await db.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)', [SESSION, USER])
      expect(await state()).toEqual([{ session_ok: true, mfa_enrolled: false }])

      await db.query("INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'unverified')", [USER])
      expect((await state())[0].mfa_enrolled).toBe(false)
      await db.query("INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'verified')", [USER])
      expect((await state())[0].mfa_enrolled).toBe(true)

      await db.query("UPDATE auth.sessions SET not_after = now() - interval '1 minute'")
      expect((await state())[0].session_ok).toBe(false)

      // Relace cizího uživatele ani nesmyslné id neprojdou.
      await db.query('UPDATE auth.sessions SET not_after = NULL')
      expect((await asClient(null, 'SELECT * FROM portal.auth_state($1, $2)', ['6c7d8e9f-0a1b-4c2d-9e3f-445566778899', SESSION]))[0].session_ok).toBe(false)
      expect(await asClient(null, 'SELECT * FROM portal.auth_state($1, $2)', ['user_x', 'nesmysl'])).toEqual([{ session_ok: false, mfa_enrolled: false }])
    } finally {
      await db.exec('DROP SCHEMA auth CASCADE')
    }
  })

  it('portal_app do schématu auth sám nevidí', async () => {
    await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz)')
    try {
      await expect(asClient(null, 'SELECT * FROM auth.sessions')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('DROP SCHEMA auth CASCADE')
    }
  })
})
