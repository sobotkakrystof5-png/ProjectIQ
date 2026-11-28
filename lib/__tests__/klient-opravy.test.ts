import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePortalMoneyTables } from '@/lib/__tests__/helpers/portal-money-tables'
import { prepareConsultationTables } from '@/lib/__tests__/helpers/consultation-tables'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'

/**
 * Opravy z testu klientského prostoru 2026-11-27 (R-156, migrace 143 a 144).
 *
 * Tabulka `projects` má tady stejný tvar jako na produkci: `updated_at` bez
 * výchozí hodnoty a s NULL. Ostatní testy prostoru ji mají `NOT NULL DEFAULT
 * now()`, a proto chybu pozvání čerstvé zakázky nechytily.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({
  getAdminSession: async () => ({ email: 'admin@example.cz' }),
  adminActorEmail: async () => 'admin@example.cz',
  requireAuth: async () => ({ user: { email: 'admin@example.cz' } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))

import { inviteToClientSpace } from '@/app/portal-admin-actions'
import { addIsoDays, getPragueTodayISO, pragueWallClockToISO } from '@/lib/prague-time'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const PNEW = 'cccccccc-0000-4000-8000-0000000000c1'

const ENV = { PORTAL_INVITE_PEPPER: 'p'.repeat(40), NEXT_PUBLIC_APP_URL: 'https://www.zakaziq.cz', ADMIN_EMAIL: 'admin@example.cz' }
const saved: Record<string, string | undefined> = {}

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
const one = async <T,>(sqlText: string, params: unknown[] = []) => (await db.query<T>(sqlText, params)).rows[0]

const DAY = addIsoDays(getPragueTodayISO(), 3)
const [Y, M, D] = DAY.split('-').map(Number)
const at = (h: number, m = 0) => pragueWallClockToISO(Y, M, D, h, m)

const book = (startsAt: string) =>
  asClient<{ id: string }>(A, 'SELECT portal.book_consultation($1, $2, $3, $4) AS id', [PA, MA, startsAt, 'Projít návrh webu'])
const cancel = (id: string) => asClient(A, 'SELECT portal.cancel_consultation($1, $2)', [id, MA])
const move = (id: string, startsAt: string) => asClient(A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, startsAt])

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  delete process.env.VIZEON_RESEND_API_KEY
  db = new PGlite()
  // Jako produkce: updated_at bez výchozí hodnoty (žádný INSERT ho nenastavuje).
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, service_type text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      created_at timestamptz DEFAULT now(), updated_at timestamptz
    )
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  await db.exec(read('migrations', '018_notifications.sql'))
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  await db.exec(read('migrations', '095_portal_schema.sql'))
  await preparePortalMoneyTables(db)
  await prepareConsultationTables(db)
  // Bez 143 nemá zakázka výchozí čas úpravy — řádek „před migrací".
  await db.query(`INSERT INTO projects (id, client_name, service_type) VALUES ($1, 'Kavárna Novák s.r.o.', 'Web')`, [PNEW])
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
    await db.exec(read('migrations', '143_portal_zakazka_nazev.sql'))
    await db.exec(read('migrations', '144_konzultace_vratit.sql'))
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }

  await db.query(
    `INSERT INTO projects (id, client_name, client_email, service_type) VALUES
      ($1, 'Firma A', 'a@example.cz', 'Web'), ($2, 'Firma A', 'a@example.cz', NULL)`,
    [PA, PB],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Firma A')", [A])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [A, PB])
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, role) VALUES ($1, $2, 'sb-a', 'jana@example.cz', 'owner')`,
    [MA, A],
  )
  // Pozvání musí jít celé, nebo vůbec: ovladač drží skutečnou transakci.
  setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
}, 90_000)

afterAll(async () => {
  setAdminDbForTests(null)
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await db.close()
})

describe('migrace 143: zakázka v prostoru klienta', () => {
  it('nová zakázka dostane čas úpravy sama', async () => {
    const row = await one<{ updated_at: Date | null }>(
      `INSERT INTO projects (client_name) VALUES ('Nová') RETURNING updated_at`,
    )
    expect(row.updated_at).not.toBeNull()
  })

  it('zakázka bez času úpravy (z doby před migrací) jde propojit i pozvat', async () => {
    expect((await one<{ updated_at: Date | null }>('SELECT updated_at FROM projects WHERE id = $1', [PNEW])).updated_at).toBeNull()
    const res = await inviteToClientSpace(PNEW, { email: 'jan@example.cz' })
    expect(res.success).toBe(true)
    const linked = await one<{ name: string; updated_at: Date | null }>('SELECT name, updated_at FROM portal.projects WHERE id = $1', [PNEW])
    expect(linked.name).toBe('Kavárna Novák s.r.o. · Web')
    expect(linked.updated_at).not.toBeNull()
    await db.exec('DELETE FROM portal.invites')
    await db.query('DELETE FROM portal.projects WHERE id = $1', [PNEW])
    await db.query("DELETE FROM portal.clients WHERE name = 'Kavárna Novák s.r.o.'")
  })

  it('změna propojené zakázky bez času úpravy neshodí uložení', async () => {
    await db.query('UPDATE projects SET updated_at = NULL WHERE id = $1', [PA])
    expect(await code(db.query(`UPDATE projects SET status = 'in_progress' WHERE id = $1`, [PA]))).toBe('ok')
    expect((await one<{ status: string }>('SELECT status FROM portal.projects WHERE id = $1', [PA])).status).toBe('in_progress')
  })

  it('dvě zakázky jedné firmy rozliší druh práce; bez druhu zůstane jméno firmy', async () => {
    const names = (await asClient<{ id: string; name: string }>(A, 'SELECT id, name FROM portal.projects ORDER BY name')).map((r) => r.name)
    expect(names).toEqual(['Firma A', 'Firma A · Web'])
    await db.query(`UPDATE projects SET service_type = '  E-shop ' WHERE id = $1`, [PB])
    expect((await one<{ name: string }>('SELECT name FROM portal.projects WHERE id = $1', [PB])).name).toBe('Firma A · E-shop')
    await db.query('UPDATE projects SET service_type = NULL WHERE id = $1', [PB])
  })

  it('opakovaná migrace přejmenuje i zakázky propojené dřív', async () => {
    await db.query(`UPDATE portal.projects SET name = 'Firma A' WHERE id = $1`, [PA])
    await db.exec(read('migrations', '143_portal_zakazka_nazev.sql'))
    expect((await one<{ name: string }>('SELECT name FROM portal.projects WHERE id = $1', [PA])).name).toBe('Firma A · Web')
  })
})

describe('pozvání do prostoru je jedna transakce', () => {
  it('když pozvánka selže, nezůstane prázdná firma ani propojená zakázka', async () => {
    const before = Number((await one<{ n: number }>('SELECT count(*)::int AS n FROM portal.clients')).n)
    await db.exec(`
      CREATE FUNCTION public.test_invites_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$;
      CREATE TRIGGER invites_fail BEFORE INSERT ON portal.invites FOR EACH ROW EXECUTE FUNCTION public.test_invites_fail();
    `)
    try {
      const res = await inviteToClientSpace(PNEW, { company: 'Kavárna Novák', email: 'jan@example.cz' })
      expect(res).toEqual({ success: false, error: 'Klienta se nepodařilo pozvat. Zkuste to prosím znovu.' })
    } finally {
      await db.exec('DROP TRIGGER invites_fail ON portal.invites; DROP FUNCTION public.test_invites_fail()')
    }
    expect(Number((await one<{ n: number }>('SELECT count(*)::int AS n FROM portal.clients')).n)).toBe(before)
    expect(await one('SELECT 1 FROM portal.projects WHERE id = $1', [PNEW])).toBeUndefined()
  })

  it('potvrzení „prostor jiné firmy" ukáže název bez dvojité tečky', async () => {
    await inviteToClientSpace(PNEW, { company: 'Kavárna Novák s.r.o.', email: 'jan@example.cz' })
    await db.query(`INSERT INTO projects (id, client_name) VALUES ('cccccccc-0000-4000-8000-0000000000c2', 'Kavárna Novák s.r.o.')`)
    const ask = await inviteToClientSpace('cccccccc-0000-4000-8000-0000000000c2', { email: 'jan@example.cz' })
    expect(ask.success).toBe(false)
    if (ask.success) return
    expect(ask.error).toBe('Tenhle e-mail už má prostor firmy Kavárna Novák s.r.o. Zakázku tam uvidí všichni lidé z toho prostoru.')
  })
})

describe('migrace 144: zrušení a „Vrátit" u konzultace', () => {
  beforeEach(async () => {
    await db.exec(`
      DELETE FROM client_leads; DELETE FROM calendar_events; DELETE FROM consultation_slots;
      DELETE FROM client_availability; DELETE FROM consultation_cancellations;
    `)
    await db.query(
      `INSERT INTO client_availability (day, start_time, end_time, slot_minutes) VALUES ($1::date, '10:00', '16:00', 30)`,
      [DAY],
    )
  })

  it('„Vrátit" po zrušení převezme počet přesunů, takže strop pěti platí dál', async () => {
    const [{ id }] = await book(at(14))
    await db.query('UPDATE consultation_slots SET move_count = 5 WHERE id = $1', [id])
    expect(await code(move(id, at(15)))).toBe('P0429')

    await cancel(id)
    const [{ id: again }] = await book(at(14))
    expect((await one<{ move_count: number }>('SELECT move_count FROM consultation_slots WHERE id = $1', [again])).move_count).toBe(5)
    expect(await code(move(again, at(15)))).toBe('P0429')
  })

  it('zrušené rezervace se počítají do limitu deseti za hodinu', async () => {
    for (let i = 0; i < 10; i++) {
      const [{ id }] = await book(at(10 + Math.floor(i / 2), (i % 2) * 30))
      await cancel(id)
    }
    expect(await code(book(at(15, 30)))).toBe('P0429')
  })

  it('zrušení si nepamatuje nic o člověku, jen zakázku a počet', async () => {
    const cols = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'consultation_cancellations' ORDER BY ordinal_position`,
    )).rows.map((r) => r.column_name)
    expect(cols).toEqual(['id', 'project_id', 'move_count', 'cancelled_at'])
  })

  it('klient do tabulky zrušení nevidí', async () => {
    expect(await code(asClient(A, 'SELECT * FROM public.consultation_cancellations'))).toBe('42501')
  })
})
