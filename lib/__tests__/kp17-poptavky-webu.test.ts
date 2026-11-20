import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
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

import { POST } from '@/app/api/public/web-udalost/route'
import { issueWebKey, loadProjectWebLeads, revokeWebKey } from '@/lib/client-web/keys'
import { buildWebLeadStats, leadsLabel, webLeadsSummary } from '@/lib/client-web/stats'
import { loadProjectWebLeads as loadPortalWebLeads } from '@/lib/portal/web-leads'
import { loadClientOverview } from '@/lib/portal/overview'

// KP17 (D-K16, D-K20 = jen počet, R-129): poptávky z webu klienta. Migrace 126
// dvakrát po sobě nad PGlite, veřejný vstup přes skutečný route handler,
// klient čte jako role portal_app.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
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

function call(opts: { key?: string | null; body?: unknown; raw?: string; headers?: Record<string, string> }) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...opts.headers }
  if (opts.key) headers.authorization = `Bearer ${opts.key}`
  return POST(
    new NextRequest('http://localhost/api/public/web-udalost', {
      method: 'POST',
      headers,
      body: opts.raw ?? JSON.stringify(opts.body ?? { druh: 'poptavka' }),
    }),
  )
}

const events = async (project = PA) =>
  (await db.query<{ kind: string; is_test: boolean }>('SELECT kind, is_test FROM project_web_events WHERE project_id = $1 ORDER BY id', [project])).rows

/** Událost se zadaným časem (jen pro testy — přes vstup jde vždy „teď"). */
const eventAt = (project: string, kind: 'poptavka' | 'objednavka', at: string, isTest = false) =>
  db.query('INSERT INTO project_web_events (project_id, kind, is_test, created_at) VALUES ($1, $2, $3, ' + at + ')', [project, kind, isTest])

beforeAll(async () => {
  process.env.AGENT_KEY_PEPPER = 'p'.repeat(40)
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, focus text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      survey_token uuid DEFAULT gen_random_uuid(), project_type text NOT NULL DEFAULT 'client',
      lead_pending boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE project_surveys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      nps smallint, completed_at timestamptz
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
      ($1, $2, 'sb-a', 'jana@example.cz', 'Jana', 'owner'), ($3, $4, 'sb-b', 'eva@example.cz', 'Eva', 'owner')`,
    [MA, A, MB, B],
  )
  setAdminDbForTests(pgliteAdminDriver(db))
  setPortalDriverForTests(portalDriver)
}, 60_000)

afterAll(async () => {
  setAdminDbForTests(null)
  setPortalDriverForTests(null)
  await db.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM project_web_events; DELETE FROM project_web_keys; DELETE FROM api_requests;')
})

describe('migrace 126', () => {
  it('události nenesou nic o lidech — jen zakázku, klíč, druh a čas', async () => {
    const cols = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'project_web_events' ORDER BY ordinal_position",
    )
    expect(cols.rows.map((c) => c.column_name)).toEqual(['id', 'project_id', 'key_id', 'kind', 'is_test', 'created_at'])
    expect(await code(eventAt(PA, 'jiny' as 'poptavka', 'now()'))).toBe('23514')
  })

  it('klient nemá přístup k událostem ani ke klíčům', async () => {
    expect(await code(asClient(A, 'SELECT * FROM project_web_events'))).toBe('42501')
    expect(await code(asClient(A, 'SELECT * FROM project_web_keys'))).toBe('42501')
  })

  it('smazání zakázky vezme klíč i události s sebou', async () => {
    const tmp = 'cccccccc-0000-4000-8000-0000000000c1'
    await db.query("INSERT INTO projects (id, client_name) VALUES ($1, 'Dočasná')", [tmp])
    await issueWebKey(tmp, 'admin')
    await eventAt(tmp, 'poptavka', 'now()')
    await db.query('DELETE FROM projects WHERE id = $1', [tmp])
    const left = await db.query('SELECT 1 FROM project_web_events WHERE project_id = $1 UNION ALL SELECT 1 FROM project_web_keys WHERE project_id = $1', [tmp])
    expect(left.rows).toEqual([])
  })
})

describe('POST /api/public/web-udalost', () => {
  it('uloží událost a odpověď nic neprozradí', async () => {
    const key = await issueWebKey(PA, 'admin')
    const res = await call({ key, body: { druh: 'objednavka' } })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(await events()).toEqual([{ kind: 'objednavka', is_test: false }])
    const used = await db.query<{ used: boolean }>('SELECT last_used_at IS NOT NULL AS used FROM project_web_keys WHERE project_id = $1', [PA])
    expect(used.rows[0].used).toBe(true)
  })

  it('z prohlížeče (hlavička Origin) neprojde, ani se správným klíčem', async () => {
    const key = await issueWebKey(PA, 'admin')
    const res = await call({ key, headers: { origin: 'https://kavarna.cz' } })
    expect(res.status).toBe(403)
    expect(await events()).toEqual([])
  })

  it('špatný, cizí tvar i zneplatněný klíč dostanou stejnou odpověď', async () => {
    const key = await issueWebKey(PA, 'admin')
    const statuses = [
      (await call({ key: null })).status,
      (await call({ key: 'zk_web_nesmysl' })).status,
      (await call({ key: key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A') })).status,
      (await call({ key: key.replace('zk_web_', 'zk_agent_') })).status,
    ]
    await revokeWebKey(PA, 'admin')
    statuses.push((await call({ key })).status)
    expect(statuses).toEqual([401, 401, 401, 401, 401])
    expect(await events()).toEqual([])
  })

  it('otočení klíče: starý přestane platit, nový funguje', async () => {
    const old = await issueWebKey(PA, 'admin')
    const fresh = await issueWebKey(PA, 'admin')
    expect((await call({ key: old })).status).toBe(401)
    expect((await call({ key: fresh })).status).toBe(202)
  })

  it('odmítne špatný druh, pole navíc, rozbitý JSON i velké tělo', async () => {
    const key = await issueWebKey(PA, 'admin')
    expect((await call({ key, body: { druh: 'spam' } })).status).toBe(400)
    expect((await call({ key, body: { druh: 'poptavka', email: 'jan@example.cz' } })).status).toBe(400)
    expect((await call({ key, raw: '{"druh":' })).status).toBe(400)
    expect((await call({ key, raw: JSON.stringify({ druh: 'poptavka', x: 'a'.repeat(2000) }) })).status).toBe(413)
    expect((await call({ key, headers: { 'content-length': '5000' } })).status).toBe(413)
    expect(await events()).toEqual([])
  })

  it('limit na klíč: šedesát za hodinu, pak 429', async () => {
    const key = await issueWebKey(PA, 'admin')
    const keyId = (await db.query<{ id: string }>('SELECT id::text FROM project_web_keys WHERE project_id = $1 AND revoked_at IS NULL', [PA])).rows[0].id
    await db.query(`INSERT INTO api_requests (endpoint, ip) SELECT $1, 'key' FROM generate_series(1, 60)`, [`web_event_key:${keyId}`])
    expect((await call({ key })).status).toBe(429)
    expect(await events()).toEqual([])
  })

  it('limit na IP platí i pro hádání klíčů', async () => {
    await db.query(`INSERT INTO api_requests (endpoint, ip) SELECT 'web_event_ip', '1.2.3.4' FROM generate_series(1, 300)`)
    expect((await call({ key: 'zk_web_nesmysl' })).status).toBe(429)
  })

  it('bez pepře vstup nic nepřijme', async () => {
    const key = await issueWebKey(PA, 'admin')
    const saved = process.env.AGENT_KEY_PEPPER
    process.env.AGENT_KEY_PEPPER = ''
    try {
      expect((await call({ key })).status).toBe(503)
    } finally {
      process.env.AGENT_KEY_PEPPER = saved
    }
  })
})

describe('čísla v adminu a v prostoru', () => {
  it('zkušební událost se uloží, ale do čísel nejde', async () => {
    const key = await issueWebKey(PA, 'admin')
    expect((await call({ key, body: { druh: 'poptavka', test: true } })).status).toBe(202)
    expect(await events()).toEqual([{ kind: 'poptavka', is_test: true }])
    const admin = await loadProjectWebLeads(PA)
    expect(admin?.stats.total).toBe(0)
    expect(admin?.lastTestAt).not.toBeNull()
    expect(admin?.lastEventAt).toBeNull()
    const portal = await loadPortalWebLeads(A, MA, PA)
    expect(portal?.total).toBe(0)
    expect(portal?.months).toHaveLength(12)
  })

  it('klient vidí měsíce svých napojených zakázek, cizí ne', async () => {
    await issueWebKey(PA, 'admin')
    await issueWebKey(PB, 'admin')
    await eventAt(PA, 'poptavka', 'now()')
    await eventAt(PA, 'poptavka', 'now()')
    await eventAt(PA, 'objednavka', "now() - interval '1 month'")
    await eventAt(PB, 'poptavka', 'now()')

    const a = await loadPortalWebLeads(A, MA, PA)
    expect(a).toMatchObject({ thisMonth: 2, lastMonth: 1, total: 3, hasOrders: true, hasRequests: true })
    // Zakázka bez napojení sekci nemá.
    expect(await loadPortalWebLeads(A, MA, PA2)).toBeNull()
    // Klient A přes svou funkci cizí zakázku neuvidí, ani když zná její id.
    expect(await loadPortalWebLeads(A, MA, PB)).toBeNull()
    const ids = await asClient<{ project_id: string }>(A, 'SELECT DISTINCT project_id::text FROM portal.web_lead_months($1)', [MA])
    expect(ids.map((r) => r.project_id)).toEqual([PA])
    // Cizí člen = chyba, ne prázdná data jiného klienta.
    expect(await code(asClient(A, 'SELECT * FROM portal.web_lead_months($1)', [MB]))).toBe('P0002')

    const overview = await loadClientOverview(A, MA, [])
    const byId = new Map(overview.projects.map((p) => [p.project.id, p.webLeads]))
    expect(byId.get(PA)?.total).toBe(3)
    expect(byId.get(PA2)).toBeNull()
  })

  it('měsíc se počítá v pražském čase', async () => {
    await issueWebKey(PA, 'admin')
    const start = "(date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')"
    await eventAt(PA, 'poptavka', `${start} - interval '30 minutes'`)
    await eventAt(PA, 'poptavka', `${start} + interval '30 minutes'`)
    const stats = await loadPortalWebLeads(A, MA, PA)
    expect([stats?.lastMonth, stats?.thisMonth]).toEqual([1, 1])
    const admin = await loadProjectWebLeads(PA)
    expect([admin?.stats.lastMonth, admin?.stats.thisMonth]).toEqual([1, 1])
  })

  it('starší než 12 měsíců se nepočítá; zneplatněný klíč s historií sekci nechá', async () => {
    await issueWebKey(PA, 'admin')
    await eventAt(PA, 'poptavka', "now() - interval '13 months'")
    await eventAt(PA, 'poptavka', "now() - interval '2 months'")
    await revokeWebKey(PA, 'admin')
    const stats = await loadPortalWebLeads(A, MA, PA)
    expect(stats?.total).toBe(1)
    await db.query('DELETE FROM project_web_events WHERE created_at > now() - interval \'1 year\'')
    // Zbyla jen událost mimo okno a klíč je pryč → zakázka sekci nemá.
    expect(await loadPortalWebLeads(A, MA, PA)).toBeNull()
  })

  it('admin vidí platný klíč jen jako začátek, nikdy celý', async () => {
    const key = await issueWebKey(PA, 'admin')
    const admin = await loadProjectWebLeads(PA)
    expect(admin?.key?.prefixMask).toMatch(/^zk_web_[A-Za-z0-9]{4}…$/)
    expect(JSON.stringify(admin)).not.toContain(key)
  })
})

describe('výpočet čísel', () => {
  it('doplní prázdné měsíce, zahodí cizí okno a nesmysly', () => {
    const s = buildWebLeadStats(
      [
        { month: '2026-11', poptavky: 3, objednavky: 1 },
        { month: '2026-01', poptavky: 2, objednavky: 0 },
        { month: '2025-11', poptavky: 9, objednavky: 9 },
        { month: 'nesmysl', poptavky: 5, objednavky: 5 },
        { month: '2026-10', poptavky: -4, objednavky: 'x' },
      ],
      '2026-11',
    )
    expect(s.months.map((m) => m.month)).toEqual([
      '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ])
    expect(s).toMatchObject({ thisMonth: 4, lastMonth: 0, total: 6, hasOrders: true })
  })

  it('přelom roku a české tvary', () => {
    expect(buildWebLeadStats([], '2027-01').months[0].month).toBe('2026-02')
    expect([1, 3, 5, 1200].map(leadsLabel)).toEqual(['1 poptávka', '3 poptávky', '5 poptávek', '1 200 poptávek'])
    expect(webLeadsSummary(buildWebLeadStats([], '2026-11'))).toContain('zatím žádná')
    expect(webLeadsSummary(buildWebLeadStats([{ month: '2026-03', poptavky: 4, objednavky: 0 }], '2026-11'))).toContain('březen 2026')
  })
})
