import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePortalMoneyTables } from '@/lib/__tests__/helpers/portal-money-tables'
import { prepareConsultationTables } from '@/lib/__tests__/helpers/consultation-tables'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { setPortalDriverForTests, type PortalDriver, type PortalRow } from '@/lib/portal/db'
import type { VizeonMail } from '@/lib/admin/vizeon-mail'

let db: PGlite

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))

import { loadClientOverview, waitingItems, type OverviewProject } from '@/lib/portal/overview'
import { loadClientSurvey } from '@/lib/portal/survey'
import { listClientThreads } from '@/lib/portal/chat'
import { submitSurveyAnswers } from '@/lib/admin/survey-answers'
import { flushPhaseEmails, phaseEmail, sendPhaseEmailIfDue } from '@/lib/admin/phase-email'
import { surveySchema } from '@/lib/feedback-schema'

// KP16 (R-121, R-123, R-128): přehled klienta. Migrace 125 dvakrát po sobě
// nad PGlite, klient čte jako role portal_app, admin vlastníkem tabulek.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MA2 = 'aaaaaaaa-0000-4000-8000-000000000a02'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PA2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const PX = 'cccccccc-0000-4000-8000-0000000000c1'

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

async function phase(project: string, position: number, name: string, status: 'waiting' | 'running' | 'done', due: string | null = null) {
  const rows = await db.query<{ id: string }>(
    `INSERT INTO project_phases (project_id, position, name, status, due_date, done_at)
     VALUES ($1, $2, $3, $4, $5::date, CASE WHEN $4 = 'done' THEN now() END) RETURNING id::text`,
    [project, position, name, status, due],
  )
  return rows.rows[0].id
}

async function task(project: string, phaseId: string, body: string) {
  await db.query('INSERT INTO project_phase_tasks (project_id, phase_id, position, body) VALUES ($1, $2, 0, $3)', [project, phaseId, body])
}

const markDone = (phaseId: string) => db.query("UPDATE project_phases SET status = 'done', done_at = now() WHERE id = $1", [phaseId])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, focus text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      survey_token uuid DEFAULT gen_random_uuid(), project_type text NOT NULL DEFAULT 'client',
      lead_pending boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  // project_surveys tak, jak ji nechávají migrace 106 a 118 (jen sloupce, které dotazník zapisuje).
  await db.exec(`
    CREATE TABLE project_surveys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      nps smallint, rating_result smallint, rating_communication smallint, rating_schedule smallint, rating_value smallint,
      improve_text text, reference_text text, publish_mode text, reviewer_role text, consent boolean,
      completed_at timestamptz, detractor_alerted_at timestamptz, google_review_clicked_at timestamptz,
      followed_up_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE UNIQUE INDEX project_surveys_project_uq ON project_surveys (project_id) WHERE project_id IS NOT NULL;
  `)
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
      ($1, 'Web A', 'Web pro kavárnu', 'in_progress'), ($2, 'E-shop A', 'E-shop', 'done'),
      ($3, 'Web B', 'Web B', 'in_progress'), ($4, 'Bez prostoru', 'Bez prostoru', 'in_progress')`,
    [PA, PA2, PB, PX],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA2])
  await db.query('SELECT portal.link_project($1, $2)', [B, PB])
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, name, role) VALUES
      ($1, $2, 'sb-a', 'jana@example.cz', 'Jana', 'owner'),
      ($3, $2, 'sb-a2', 'Petr@Example.cz', 'Petr', 'member'),
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

beforeEach(async () => {
  await db.exec(`
    DELETE FROM project_phases; DELETE FROM project_phase_emails; DELETE FROM project_surveys;
    DELETE FROM portal.messages; DELETE FROM portal.thread_state;
  `)
})

describe('migrace 125', () => {
  it('etapy hotové před migrací se klientovi neposílají', async () => {
    await db.exec('ALTER TABLE project_phases DROP COLUMN client_notified_at')
    await phase(PA, 0, 'Návrh', 'done')
    await db.exec(read('migrations', '125_prehled_klienta.sql'))
    const rows = await db.query<{ notified: boolean }>('SELECT client_notified_at IS NOT NULL AS notified FROM project_phases')
    expect(rows.rows).toEqual([{ notified: true }])
    const send = vi.fn(async () => ({ ok: true as const, id: null }))
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
    // Druhý běh už nic nedoplní: etapu dokončenou mezi běhy nezatají.
    await phase(PA, 1, 'Vývoj', 'done')
    await db.exec(read('migrations', '125_prehled_klienta.sql'))
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('sent')
  })

  it('klient nemá právo na zabírání e-mailů ani na tabulku 24 h', async () => {
    expect(await code(asClient(A, `SELECT * FROM portal_phase_email_claim('${PA}')`))).toBe('42501')
    expect(await code(asClient(A, 'SELECT * FROM project_phase_emails'))).toBe('42501')
  })
})

describe('přehled klienta', () => {
  it('klient vidí jen své zakázky, etapy, úkoly a schválení', async () => {
    const a1 = await phase(PA, 0, 'Návrh', 'done')
    const a2 = await phase(PA, 1, 'Vývoj', 'running', '2026-12-12')
    await phase(PA, 2, 'Spuštění', 'waiting')
    await task(PA, a1, 'Úkol hotové etapy')
    await task(PA, a2, 'Dodat fotky')
    const b1 = await phase(PB, 0, 'Cizí etapa', 'running')
    await task(PB, b1, 'Cizí úkol')
    await db.query(`SELECT portal_admin_post($1, 'approval', 'Posílám návrh menu', NULL, NULL, '[]'::jsonb, 'Kryštof Sobotka')`, [PA])
    await db.query(`SELECT portal_admin_post($1, 'approval', 'Cizí návrh', NULL, NULL, '[]'::jsonb, 'Kryštof Sobotka')`, [PB])

    const threads = await listClientThreads(A)
    const overview = await loadClientOverview(A, MA, threads)
    expect(overview.projects.map((p) => p.project.id).sort()).toEqual([PA, PA2].sort())
    const web = overview.projects.find((p) => p.project.id === PA)!
    expect(web.current?.name).toBe('Vývoj')
    expect(web.current?.dueDate).toBe('2026-12-12')
    // Úkol hotové etapy už nečeká, cizí úkol ani cizí návrh tu nejsou.
    expect(overview.waiting.map((w) => w.kind)).toEqual(['approval', 'task', 'unread', 'survey'])
    expect(overview.waiting.find((w) => w.kind === 'task')).toMatchObject({ body: 'Dodat fotky', phaseName: 'Vývoj' })
    expect(JSON.stringify(overview)).not.toMatch(/Cizí/)

    const other = await loadClientOverview(B, MB, await listClientThreads(B))
    expect(other.projects.map((p) => p.project.id)).toEqual([PB])
    expect(JSON.stringify(other)).not.toMatch(/Dodat fotky|návrh menu/)
  })

  it('člen cizího klienta dotazník nedostane', async () => {
    expect(await code(asClient(A, 'SELECT * FROM portal.client_surveys($1)', [MB]))).toBe('P0002')
    const b = await asClient<{ project_id: string }>(B, 'SELECT project_id::text FROM portal.client_surveys($1)', [MB])
    expect(b).toEqual([])
  })

  it('pořadí „Čeká na vás": schválení, úkol, zprávy, faktura po splatnosti, hodnocení', () => {
    const base = (id: string, over: Partial<OverviewProject>): OverviewProject => ({
      project: { id, name: id, description: null, status: 'in_progress', statusLabel: '', progress: 0, deadline: null, projectUrl: null, lastActivity: null },
      phases: [], current: null, money: null, invoices: [], consultations: [], unread: 0, survey: null, webLeads: null, ...over,
    })
    const invoice = (state: 'overdue' | 'open') => ({
      id: `f-${state}`, number: '2026001', kind: 'issued' as const, issuedOn: '2026-11-01', dueOn: '2026-11-15', paidOn: null,
      amount: 1000, currency: 'CZK', state, hasPdf: true, payment: null,
    })
    const items = waitingItems(
      [
        base('x', { survey: { token: 't', nps: null, completed: false, googleReviewUrl: null }, invoices: [invoice('open'), invoice('overdue')] }),
        base('y', {
          unread: 2,
          phases: [{ id: 'p', name: 'Vývoj', description: null, dueDate: null, status: 'running', doneAt: null, tasks: [{ id: 't1', body: 'Fotky', doneAt: null }, { id: 't2', body: 'Hotovo', doneAt: '2026-11-01T00:00:00Z' }] }],
        }),
      ],
      [{ id: 'm', project_id: 'y', body: 'Návrh\n\nmenu' }],
    )
    expect(items.map((i) => i.kind)).toEqual(['approval', 'task', 'unread', 'invoice', 'survey'])
    expect(items[0]).toMatchObject({ body: 'Návrh menu' })
  })
})

describe('hodnocení přes dotazník R-119', () => {
  it('nabídne se jen u hotové zakázky a zapíše se jednou na zakázku', async () => {
    expect(await loadClientSurvey(A, MA, PA)).toBeNull()
    const survey = await loadClientSurvey(A, MA, PA2)
    expect(survey).toMatchObject({ completed: false, nps: null })
    const input = surveySchema.parse({ nps: 9, publish_mode: 'private' })
    expect((await submitSurveyAnswers(survey!.token, input)).status).toBe('saved')
    // Druhý člen téhož klienta už odpověď nepřepíše.
    expect((await submitSurveyAnswers(survey!.token, surveySchema.parse({ nps: 3 }))).status).toBe('completed')
    expect((await db.query('SELECT nps FROM project_surveys WHERE project_id = $1', [PA2])).rows).toEqual([{ nps: 9 }])
    expect(await loadClientSurvey(A, MA2, PA2)).toMatchObject({ completed: true, nps: 9 })
    const overview = await loadClientOverview(A, MA, await listClientThreads(A))
    expect(overview.waiting.some((w) => w.kind === 'survey')).toBe(false)
  })

  it('osobní zakázka ani nepotvrzená poptávka dotazník nemá', async () => {
    await db.query("UPDATE projects SET project_type = 'personal' WHERE id = $1", [PA2])
    expect(await loadClientSurvey(A, MA, PA2)).toBeNull()
    await db.query("UPDATE projects SET project_type = 'client', lead_pending = true WHERE id = $1", [PA2])
    expect(await loadClientSurvey(A, MA, PA2)).toBeNull()
    await db.query('UPDATE projects SET lead_pending = false WHERE id = $1', [PA2])
  })
})

describe('e-mail při dokončení etapy', () => {
  it('pošle se všem členům jednou a druhá etapa do 24 h počká', async () => {
    const p1 = await phase(PA, 0, 'Návrh <b>webu</b>', 'running')
    const p2 = await phase(PA, 1, 'Vývoj', 'waiting', '2026-12-12')
    await task(PA, p2, 'Dodat fotky')
    const sent: VizeonMail[] = []
    const send = vi.fn(async (mail: VizeonMail) => {
      sent.push(mail)
      return { ok: true as const, id: null }
    })

    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('skipped')
    await markDone(p1)
    await db.query("UPDATE project_phases SET status = 'running' WHERE id = $1", [p2])
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('sent')
    expect(sent.map((m) => m.to).sort()).toEqual(['jana@example.cz', 'petr@example.cz'])
    expect(sent[0].subject).toBe('Hotovo: Návrh <b>webu</b> · Web A')
    expect(sent[0].html).toContain('Návrh &lt;b&gt;webu&lt;/b&gt;')
    expect(sent[0].html).not.toContain('<b>webu</b>')
    expect(sent[0].text).toContain('Teď pracuji na etapě Vývoj, hotová by měla být do 12. prosince 2026.')
    expect(sent[0].text).toContain('- Dodat fotky')
    expect(sent[0].text).toContain(`/klient/projekt/${PA}`)

    // Opakované volání ani druhá hotová etapa ve stejný den e-mail nepošle.
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('skipped')
    await markDone(p2)
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('skipped')
    expect(await flushPhaseEmails({ send })).toBe(0)
    expect(sent).toHaveLength(2)

    // Po 24 hodinách ji dopošle ranní cron — a jen ji.
    await db.query("UPDATE project_phase_emails SET sent_at = now() - interval '25 hours'")
    expect(await flushPhaseEmails({ send })).toBe(1)
    expect(sent).toHaveLength(4)
    expect(sent[2].subject).toBe('Hotovo: Vývoj · Web A')
    expect(sent[2].text).toContain('Tím jsou hotové všechny etapy.')
  })

  it('vrácená etapa před odesláním e-mail nepošle', async () => {
    const p1 = await phase(PA, 0, 'Návrh', 'running')
    await markDone(p1)
    await db.query("UPDATE project_phases SET status = 'running', done_at = NULL WHERE id = $1", [p1])
    const send = vi.fn(async () => ({ ok: true as const, id: null }))
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('když e-mail neodejde, zabrání se vrátí a příště se zkusí znovu', async () => {
    const p1 = await phase(PA, 0, 'Návrh', 'running')
    await markDone(p1)
    const failing = vi.fn(async () => ({ ok: false as const, error: 'Resend nejede' }))
    expect(await sendPhaseEmailIfDue(PA, { send: failing })).toBe('failed')
    expect((await db.query('SELECT 1 FROM project_phase_emails')).rows).toHaveLength(0)
    const send = vi.fn(async () => ({ ok: true as const, id: null }))
    expect(await sendPhaseEmailIfDue(PA, { send })).toBe('sent')
  })

  it('zakázka mimo klientský prostor e-mail nedostane', async () => {
    const p = await phase(PX, 0, 'Návrh', 'running')
    await markDone(p)
    const send = vi.fn(async () => ({ ok: true as const, id: null }))
    expect(await sendPhaseEmailIfDue(PX, { send })).toBe('skipped')
    expect(await flushPhaseEmails({ send })).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('víc hotových etap najednou je v jednom e-mailu', () => {
    const mail = phaseEmail({ projectName: 'Web', done: ['Návrh', 'Vývoj'], next: null, tasks: [], link: 'https://www.zakaziq.cz/klient' })
    expect(mail.subject).toBe('Hotové etapy · Web')
    expect(mail.text).toContain('Hotové etapy: Návrh, Vývoj.')
    expect(mail.text).not.toContain('Od vás potřebuji')
  })
})
