import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Retence dat klientů (D-K10, R-076, migrace 098): dokončená zakázka bez
// pohybu 3 roky přijde o aktivitu, požadavky, zprávy a slovní hodnocení.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const C = 'aaaaaaaa-0000-4000-8000-000000000001'
const M = 'aaaaaaaa-0000-4000-8000-0000000000f1'
const OLD = 'aaaaaaaa-0000-4000-8000-0000000000a1' // hotová, 4 roky bez pohybu
const RECENT_MSG = 'aaaaaaaa-0000-4000-8000-0000000000a2' // hotová, ale zpráva před rokem
const OPEN = 'aaaaaaaa-0000-4000-8000-0000000000a3' // rozpracovaná, stará
const hashOf = (c: string) => c.repeat(64).slice(0, 64)

let db: PGlite
const count = async (sqlText: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(sqlText, params)).rows[0].n)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      created_at timestamptz DEFAULT now(), updated_at timestamptz
    )
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  for (const f of ['092_client_requests.sql', '093_project_activity.sql', '095_portal_schema.sql', '096_portal_requests_messages.sql']) {
    await db.exec(read('migrations', f))
  }
  // idempotence
  await db.exec(read('migrations', '098_client_retention.sql'))
  await db.exec(read('migrations', '098_client_retention.sql'))

  const ago = (years: number) => `now() - interval '${years} years'`
  await db.query(
    `INSERT INTO projects (id, client_name, status, price, created_at, updated_at) VALUES
      ($1, 'Stará', 'paid', 1000, ${ago(5)}, ${ago(4)}),
      ($2, 'Se zprávou', 'done', 2000, ${ago(5)}, ${ago(4)}),
      ($3, 'Rozpracovaná', 'in_progress', 3000, ${ago(5)}, ${ago(4)})`,
    [OLD, RECENT_MSG, OPEN],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient')", [C])
  await db.query("INSERT INTO portal.members (id, client_id, clerk_user_id) VALUES ($1, $2, 'user_1')", [M, C])
  for (const p of [OLD, RECENT_MSG, OPEN]) {
    await db.query('SELECT portal.link_project($1, $2)', [C, p])
    await db.query(
      `INSERT INTO project_activity (project_id, status, title, body, published_at, created_at, updated_at)
       VALUES ($1, 'published', 'Hotovo', 'Text', ${ago(4)}, ${ago(4)}, ${ago(4)})`,
      [p],
    )
    await db.query(`INSERT INTO client_requests (project_id, raw_text, created_at) VALUES ($1, 'Změňte barvu', ${ago(4)})`, [p])
    await db.query(`INSERT INTO client_feedback (project_id, nps, content) VALUES ($1, 9, 'Spokojenost')`, [p])
    await db.query(
      `INSERT INTO portal.requests (client_id, project_id, member_id, source, body, created_at) VALUES ($1, $2, $3, 'text', 'Změňte barvu', ${ago(4)})`,
      [C, p, M],
    )
  }
  await db.query(`INSERT INTO portal.messages (client_id, project_id, author, body, created_at) VALUES ($1, $2, 'client', 'Stará zpráva', ${ago(4)})`, [C, OLD])
  await db.query(`INSERT INTO portal.messages (client_id, project_id, author, body, created_at) VALUES ($1, $2, 'client', 'Nedávná zpráva', ${ago(1)})`, [C, RECENT_MSG])
  await db.query(
    `INSERT INTO portal.invites (client_id, code_hash, expires_at, used_at) VALUES
      ($1, $2, now() - interval '200 days', now() - interval '210 days'),
      ($1, $3, now() + interval '10 days', NULL)`,
    [C, hashOf('a'), hashOf('b')],
  )
})

afterAll(async () => {
  await db.close()
})

describe('purge_client_retention', () => {
  it('odmítne lhůtu kratší než rok', async () => {
    await expect(db.query('SELECT public.purge_client_retention(0)')).rejects.toThrow(/aspoň 1 rok/)
  })

  it('smaže obsah jen u dokončené zakázky bez pohybu 3 roky', async () => {
    const { rows } = await db.query<{ r: Record<string, number> }>('SELECT public.purge_client_retention(3) AS r')
    expect(rows[0].r).toMatchObject({ projects: 1, activity: 1, requests: 2, messages: 1, feedback_texts: 1, invites: 1 })

    // stará hotová zakázka: obsah pryč, zakázka a číselné hodnocení zůstávají
    expect(await count('SELECT count(*) AS n FROM projects WHERE id = $1 AND price = 1000', [OLD])).toBe(1)
    expect(await count('SELECT count(*) AS n FROM project_activity WHERE project_id = $1', [OLD])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM portal.activity WHERE project_id = $1', [OLD])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM client_requests WHERE project_id = $1', [OLD])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM portal.requests WHERE project_id = $1', [OLD])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM portal.messages WHERE project_id = $1', [OLD])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM client_feedback WHERE project_id = $1 AND nps = 9 AND content IS NULL', [OLD])).toBe(1)

    // nedávná zpráva lhůtu posouvá, rozpracovaná zakázka se nemaže vůbec
    for (const p of [RECENT_MSG, OPEN]) {
      expect(await count('SELECT count(*) AS n FROM project_activity WHERE project_id = $1', [p])).toBe(1)
      expect(await count('SELECT count(*) AS n FROM client_requests WHERE project_id = $1', [p])).toBe(1)
      expect(await count('SELECT count(*) AS n FROM client_feedback WHERE project_id = $1 AND content IS NOT NULL', [p])).toBe(1)
    }
    // platná pozvánka zůstává, stará použitá zmizela
    expect(await count('SELECT count(*) AS n FROM portal.invites')).toBe(1)
  })

  it('opakovaný běh už nic nenajde', async () => {
    const { rows } = await db.query<{ r: Record<string, number> }>('SELECT public.purge_client_retention(3) AS r')
    expect(rows[0].r).toMatchObject({ activity: 0, requests: 0, messages: 0, feedback_texts: 0, invites: 0 })
  })
})
