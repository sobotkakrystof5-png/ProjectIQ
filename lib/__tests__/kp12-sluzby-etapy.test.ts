import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { preparePortalMoneyTables } from '@/lib/__tests__/helpers/portal-money-tables'
import { prepareConsultationTables } from '@/lib/__tests__/helpers/consultation-tables'
import {
  addDays,
  currentPhaseIndex,
  draftsFromTemplate,
  phaseDraftsSchema,
  progressFromPhases,
  serviceSchema,
  tasksFromLines,
} from '@/lib/admin/phase-model'
import {
  createService,
  createSuggestedServices,
  deleteService,
  initProjectPhases,
  loadProjectPhases,
  loadServices,
  projectHasPhases,
  restoreService,
  saveService,
  setPhaseDueDate,
  setPhaseStatus,
} from '@/lib/admin/phases'

// KP12 (R-121, D-K14): služby a etapy zakázky. Migrace 121 dvakrát po sobě nad
// PGlite, šablona se kopíruje (její změna běžící zakázku nemění), postup v %
// z etap, projekce do portal jen u propojené zakázky a „Mám hotovo" jen u
// vlastního úkolu.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const PX = 'cccccccc-0000-4000-8000-0000000000c1' // zakázka bez klienta

let db: PGlite

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

const progressOf = async (id: string) =>
  Number((await db.query<{ progress: number }>('SELECT progress FROM projects WHERE id = $1', [id])).rows[0].progress)

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
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }

  await db.query(
    `INSERT INTO projects (id, client_name, description, status, progress, notes) VALUES
      ($1, 'Firma A', 'Web A', 'in_progress', 40, 'TAJNÁ POZNÁMKA A'),
      ($2, 'Firma B', 'Web B', 'new', 10, 'TAJNÁ POZNÁMKA B'),
      ($3, 'Nikoho', NULL, 'new', 25, NULL)`,
    [PA, PB, PX],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query(
    "INSERT INTO portal.members (id, client_id, clerk_user_id, email) VALUES ($1, $2, 'sa', 'a@example.cz'), ($3, $4, 'sb', 'b@example.cz')",
    [MA, A, MB, B],
  )
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
}, 60_000)

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

describe('model etap', () => {
  it('termíny ze šablony jdou od začátku podle typické délky, etapa bez délky neposouvá', () => {
    const drafts = draftsFromTemplate(
      [
        { name: 'Návrh', description: '', typicalDays: 7, tasks: ['Dodat texty'] },
        { name: 'Schválení', description: '', typicalDays: null, tasks: [] },
        { name: 'Vývoj', description: '', typicalDays: 14, tasks: [] },
      ],
      '2026-11-30',
    )
    expect(drafts.map((d) => d.dueDate)).toEqual(['2026-12-07', null, '2026-12-21'])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('postup z etap a aktuální etapa', () => {
    expect(progressFromPhases([])).toBeNull()
    expect(progressFromPhases([{ status: 'done' }, { status: 'waiting' }, { status: 'running' }])).toBe(33)
    expect(currentPhaseIndex([{ status: 'done' }, { status: 'waiting' }, { status: 'running' }])).toBe(2)
    expect(currentPhaseIndex([{ status: 'done' }, { status: 'waiting' }])).toBe(1)
    expect(currentPhaseIndex([{ status: 'done' }])).toBe(-1)
  })

  it('úkoly z řádků a meze vstupu', () => {
    expect(tasksFromLines(' Dodat texty \n\n Fotky\n')).toEqual(['Dodat texty', 'Fotky'])
    expect(phaseDraftsSchema.safeParse([]).success).toBe(false)
    expect(phaseDraftsSchema.safeParse([{ name: ' ', description: '', dueDate: null, tasks: [] }]).success).toBe(false)
    expect(phaseDraftsSchema.safeParse([{ name: 'A', description: '', dueDate: '2026-02-30', tasks: [] }]).success).toBe(false)
    expect(serviceSchema.safeParse({ name: 'Web', active: true, phases: [{ name: 'A', description: '', typicalDays: 400, tasks: [] }] }).success).toBe(false)
  })
})

describe('služby v Nastavení', () => {
  it('navržené služby se založí prázdné a podruhé se nezdvojí', async () => {
    expect(await createSuggestedServices()).toBe(4)
    expect(await createSuggestedServices()).toBe(0)
    const services = await loadServices()
    expect(services?.map((s) => s.name)).toEqual(['Web', 'E-shop', 'Design', 'Automatizace'])
    expect(services?.every((s) => s.phases.length === 0)).toBe(true)
  })

  it('stejný název podruhé neprojde', async () => {
    await expect(createService(' web ')).rejects.toMatchObject({ code: '23505' })
  })

  it('smazání jde vrátit se stejnými etapami', async () => {
    const id = await createService('Logo')
    await saveService(id, { name: 'Logo', active: true, phases: [{ name: 'Skici', description: 'Tři směry', typicalDays: 5, tasks: ['Poslat ukázky'] }] })
    const snapshot = await deleteService(id)
    expect((await loadServices())?.some((s) => s.id === id)).toBe(false)
    await restoreService(id, snapshot!)
    const back = (await loadServices())?.find((s) => s.id === id)
    expect(back?.phases).toEqual([{ name: 'Skici', description: 'Tři směry', typicalDays: 5, tasks: ['Poslat ukázky'] }])
  })
})

describe('etapy zakázky', () => {
  it('etapy jsou kopie — změna šablony běžící zakázku nemění', async () => {
    const web = (await loadServices())!.find((s) => s.name === 'Web')!
    await saveService(web.id, {
      name: 'Web',
      active: true,
      phases: [
        { name: 'Návrh', description: 'Rozvržení stránek', typicalDays: 7, tasks: ['Dodat texty', 'Poslat logo'] },
        { name: 'Spuštění', description: '', typicalDays: 3, tasks: [] },
      ],
    })
    const template = (await loadServices())!.find((s) => s.id === web.id)!
    expect(await initProjectPhases(PA, draftsFromTemplate(template.phases, '2026-12-01'))).toBe(2)

    await saveService(web.id, { name: 'Web', active: true, phases: [{ name: 'Úplně jinak', description: '', typicalDays: 1, tasks: [] }] })

    const phases = await loadProjectPhases(PA)
    expect(phases?.map((p) => [p.name, p.dueDate])).toEqual([['Návrh', '2026-12-08'], ['Spuštění', '2026-12-11']])
    expect(phases?.[0].tasks.map((t) => t.body)).toEqual(['Dodat texty', 'Poslat logo'])
    expect(await projectHasPhases(PA)).toBe(true)
    expect(await projectHasPhases(PX)).toBe(false)
  })

  it('druhé založení etap neudělá nic', async () => {
    expect(await initProjectPhases(PA, [{ name: 'Navíc', description: '', dueDate: null, tasks: [] }])).toBe(0)
    expect((await loadProjectPhases(PA))?.length).toBe(2)
  })

  it('postup v % počítají etapy (D-K14) a propíše se klientovi', async () => {
    expect(await progressOf(PA)).toBe(0)
    const [first] = (await loadProjectPhases(PA))!
    const res = await setPhaseStatus(first.id, 'done')
    expect(res).toEqual({ projectId: PA, previous: 'waiting' })
    expect(await progressOf(PA)).toBe(50)
    const portal = await asClient<{ progress: number }>(A, 'SELECT progress FROM portal.projects WHERE id = $1', [PA])
    expect(portal[0].progress).toBe(50)
    expect((await loadProjectPhases(PA))![0].doneAt).not.toBeNull()

    // „Zpět" vrátí stav i procenta.
    await setPhaseStatus(first.id, res!.previous)
    expect(await progressOf(PA)).toBe(0)
    expect((await loadProjectPhases(PA))![0].doneAt).toBeNull()
  })

  it('zakázka bez etap si nechá ruční %', async () => {
    expect(await progressOf(PX)).toBe(25)
  })

  it('změna termínu vrací předchozí pro „Zpět" a propíše se', async () => {
    const [first] = (await loadProjectPhases(PA))!
    expect(await setPhaseDueDate(first.id, '2026-12-24')).toEqual({ projectId: PA, previous: '2026-12-08' })
    const rows = await asClient<{ due_date: string | Date }>(A, 'SELECT due_date FROM portal.phases WHERE id = $1', [first.id])
    expect(String(rows[0].due_date instanceof Date ? rows[0].due_date.toISOString().slice(0, 10) : rows[0].due_date).slice(0, 10)).toBe('2026-12-24')
  })
})

describe('klientský prostor', () => {
  it('klient vidí etapy svojí zakázky, bez interních sloupců', async () => {
    const phases = await asClient<Record<string, unknown>>(A, 'SELECT * FROM portal.phases ORDER BY position')
    expect(phases.map((p) => p.name)).toEqual(['Návrh', 'Spuštění'])
    expect(Object.keys(phases[0]).sort()).toEqual(
      ['client_id', 'description', 'done_at', 'due_date', 'id', 'name', 'position', 'project_id', 'status'].sort(),
    )
    const tasks = await asClient<Record<string, unknown>>(A, 'SELECT * FROM portal.phase_tasks')
    expect(tasks).toHaveLength(2)
    expect(Object.keys(tasks[0])).not.toContain('client_done_by')
  })

  it('cizí klient ani nikdo bez kontextu etapy nevidí', async () => {
    expect(await asClient(B, 'SELECT * FROM portal.phases')).toHaveLength(0)
    expect(await asClient(B, 'SELECT * FROM portal.phase_tasks')).toHaveLength(0)
    expect(await asClient(null, 'SELECT * FROM portal.phases')).toHaveLength(0)
  })

  it('nepropojená zakázka do prostoru nejde; po propojení se etapy dokopírují', async () => {
    await initProjectPhases(PB, [{ name: 'Rozbor', description: '', dueDate: null, tasks: ['Vyplnit dotazník'] }])
    expect((await db.query('SELECT 1 FROM portal.phases WHERE project_id = $1', [PB])).rows).toHaveLength(0)
    await db.query('SELECT portal.link_project($1, $2)', [B, PB])
    expect((await asClient<{ name: string }>(B, 'SELECT name FROM portal.phases')).map((p) => p.name)).toEqual(['Rozbor'])
    expect(await asClient(B, 'SELECT * FROM portal.phase_tasks')).toHaveLength(1)
  })

  it('klient nemůže do etap zapisovat ani číst záznam o označení', async () => {
    await expect(asClient(A, "UPDATE portal.phases SET name = 'x'")).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'UPDATE portal.phase_tasks SET done_at = now()')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM portal.task_marks')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM public.project_phases')).rejects.toThrow(/permission denied/)
  })

  it('„Mám hotovo" jen u vlastního úkolu, podruhé nic nezmění, jde vrátit', async () => {
    const [task] = await asClient<{ id: string }>(A, 'SELECT id FROM portal.phase_tasks ORDER BY position LIMIT 1')
    const first = await asClient<{ task_project: string; changed: boolean }>(A, 'SELECT * FROM portal.submit_task_state($1, $2, true)', [task.id, MA])
    expect(first[0]).toEqual({ task_project: PA, changed: true })
    const admin = await db.query<{ client_done_at: string | null; client_done_by: string | null }>(
      'SELECT client_done_at, client_done_by FROM project_phase_tasks WHERE id = $1', [task.id],
    )
    expect(admin.rows[0].client_done_at).not.toBeNull()
    expect(admin.rows[0].client_done_by).toBe(MA)
    expect((await asClient<{ done_at: string | null }>(A, 'SELECT done_at FROM portal.phase_tasks WHERE id = $1', [task.id]))[0].done_at).not.toBeNull()

    const again = await asClient<{ changed: boolean }>(A, 'SELECT * FROM portal.submit_task_state($1, $2, true)', [task.id, MA])
    expect(again[0].changed).toBe(false)

    const undo = await asClient<{ changed: boolean }>(A, 'SELECT * FROM portal.submit_task_state($1, $2, false)', [task.id, MA])
    expect(undo[0].changed).toBe(true)
    expect((await loadProjectPhases(PA))![0].tasks[0].clientDoneAt).toBeNull()
  })

  it('cizí úkol ani cizí člen neprojdou', async () => {
    const [taskA] = await asClient<{ id: string }>(A, 'SELECT id FROM portal.phase_tasks LIMIT 1')
    await expect(asClient(B, 'SELECT * FROM portal.submit_task_state($1, $2, true)', [taskA.id, MB])).rejects.toMatchObject({ code: 'P0002' })
    await expect(asClient(A, 'SELECT * FROM portal.submit_task_state($1, $2, true)', [taskA.id, MB])).rejects.toMatchObject({ code: 'P0002' })
    await expect(asClient(null, 'SELECT * FROM portal.submit_task_state($1, $2, true)', [taskA.id, MA])).rejects.toMatchObject({ code: 'P0002' })
  })

  it('smazání zakázky vezme etapy i v prostoru', async () => {
    await db.query('DELETE FROM projects WHERE id = $1', [PB])
    expect((await db.query('SELECT 1 FROM project_phases WHERE project_id = $1', [PB])).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM portal.phases WHERE project_id = $1', [PB])).rows).toHaveLength(0)
  })
})
