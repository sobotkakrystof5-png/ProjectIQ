import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pozvání klienta do prostoru z detailu zakázky (KP11, R-121, D-K12).
 *
 * Jedno tlačítko najde nebo založí klienta, propojí zakázku a vytvoří pozvánku
 * vázanou na e-mail. Heslo si klient nastaví sám. E-mail odchází po odkladu
 * a „Zpět" ho musí stihnout zastavit: odeslání si proto stav čte znovu.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (dir: string, file: string) => fs.readFileSync(path.join(ROOT, dir, file), 'utf8')

let db: PGlite
const afterQueue: (() => Promise<void>)[] = []

vi.mock('@/lib/auth', () => ({
  getAdminSession: async () => ({ email: 'admin@example.cz' }),
  adminActorEmail: async () => 'admin@example.cz',
  requireAuth: async () => ({ user: { email: 'admin@example.cz' } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => afterQueue.push(fn) }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { inviteToClientSpace, undoClientSpaceInvite } from '@/app/portal-admin-actions'
import { deliverPortalInvite, loadProjectPortalAccess } from '@/lib/portal/project-access'
import { renderPortalInviteEmail } from '@/lib/portal/invite-email'
import type { VizeonMail } from '@/lib/admin/vizeon-mail'

const PA = '00000000-0000-4000-8000-0000000000a1'
const PB = '00000000-0000-4000-8000-0000000000b1'
const PC = '00000000-0000-4000-8000-0000000000c1'

const ENV = {
  PORTAL_INVITE_PEPPER: 'p'.repeat(40),
  NEXT_PUBLIC_APP_URL: 'https://www.zakaziq.cz',
  VIZEON_RESEND_API_KEY: 'test-klic',
  ADMIN_EMAIL: 'admin@example.cz',
}
const saved: Record<string, string | undefined> = {}

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
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
  await db.exec(read('migrations', '018_notifications.sql'))
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  await db.exec(read('migrations', '095_portal_schema.sql'))
  await db.exec(read('migrations', '096_portal_requests_messages.sql'))
  await db.exec(read('migrations', '113_portal_supabase_auth.sql'))
  setAdminDbForTests(pgliteAdminDriver(db))
}, 60_000)

afterAll(async () => {
  setAdminDbForTests(null)
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await db.close()
})

beforeEach(async () => {
  afterQueue.length = 0
  await db.exec(`
    DELETE FROM notifications;
    DELETE FROM portal.invites; DELETE FROM portal.members; DELETE FROM portal.projects; DELETE FROM portal.clients;
    DELETE FROM projects;
  `)
  await db.query(
    `INSERT INTO projects (id, client_name, client_email, description) VALUES
      ($1, 'Kavárna Novák', 'jan@example.cz', 'Web pro kavárnu <b>'),
      ($2, 'Kavárna Novák', 'jan@example.cz', 'E-shop'),
      ($3, 'Jiná firma', 'eva@example.cz', NULL)`,
    [PA, PB, PC],
  )
})

const count = async (table: string, where = 'true') =>
  Number(((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0] as { n: number }).n)

describe('pozvání do klientského prostoru z detailu zakázky', () => {
  it('založí klienta, propojí zakázku a vytvoří pozvánku vázanou na e-mail; heslo nikdo nezná', async () => {
    const res = await inviteToClientSpace(PA, { company: 'Kavárna Novák s.r.o.', email: ' Jan@Example.cz ' })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.mode).toBe('invite')
    expect(res.email).toBe('jan@example.cz')
    expect(res.emailScheduled).toBe(true)
    expect(res.unlinkOnUndo).toBe(true)
    expect(res.url).toMatch(/^https:\/\/www\.zakaziq\.cz\/klient\/pozvanka\/zi_[A-Za-z0-9]+$/)
    expect(afterQueue).toHaveLength(1)

    const client = (await db.query(`SELECT name FROM portal.clients`)).rows as { name: string }[]
    expect(client).toEqual([{ name: 'Kavárna Novák s.r.o.' }])
    expect(await count('portal.projects', `id = '${PA}'`)).toBe(1)
    const invite = (await db.query(`SELECT email, role, code_hash FROM portal.invites`)).rows as { email: string; role: string; code_hash: string }[]
    expect(invite).toHaveLength(1)
    expect(invite[0].email).toBe('jan@example.cz')
    expect(invite[0].role).toBe('owner')
    // V databázi je jen otisk, ne kód z odkazu.
    expect(res.url).not.toContain(invite[0].code_hash)
  })

  it('e-mail administrace odmítne', async () => {
    const res = await inviteToClientSpace(PA, { email: 'ADMIN@example.cz' })
    expect(res).toEqual({ success: false, error: 'Tenhle e-mail patří administraci. Zadejte e-mail klienta.' })
    expect(await count('portal.clients')).toBe(0)
  })

  it('druhou zakázku stejného člověka připojí do jeho prostoru až po potvrzení; platí jen nejnovější pozvánka', async () => {
    await inviteToClientSpace(PA, { company: 'Kavárna Novák', email: 'jan@example.cz' })
    const clientId = ((await db.query(`SELECT id FROM portal.clients`)).rows[0] as { id: string }).id
    // Bez potvrzení nic nepřipojí: zakázka by jinak potichu skončila v prostoru jiné firmy.
    const ask = await inviteToClientSpace(PB, { email: 'jan@example.cz' })
    expect(ask).toEqual({
      success: false,
      error: 'Tenhle e-mail už má prostor firmy Kavárna Novák. Zakázku tam uvidí všichni lidé z toho prostoru.',
      confirmClient: { id: clientId, name: 'Kavárna Novák' },
    })
    expect(await count('portal.projects')).toBe(1)
    // Potvrzení jiného prostoru, než ke kterému e-mail patří, nepomůže.
    const wrong = await inviteToClientSpace(PB, { email: 'jan@example.cz', confirmClientId: '00000000-0000-4000-8000-000000000999' })
    expect(wrong.success).toBe(false)
    expect(await count('portal.projects')).toBe(1)

    const res = await inviteToClientSpace(PB, { email: 'jan@example.cz', confirmClientId: clientId })
    expect(res.success).toBe(true)
    expect(await count('portal.clients')).toBe(1)
    expect(await count('portal.projects')).toBe(2)
    expect(await count('portal.invites', 'revoked_at IS NULL')).toBe(1)
  })

  it('kdo už v prostoru je, dostane jen zprávu o nové zakázce, ne pozvánku', async () => {
    await inviteToClientSpace(PA, { email: 'jan@example.cz' })
    const clientId = ((await db.query(`SELECT id FROM portal.clients`)).rows[0] as { id: string }).id
    await db.query(`UPDATE portal.invites SET used_at = now()`)
    await db.query(
      `INSERT INTO portal.members (client_id, clerk_user_id, email, name, role) VALUES ($1, 'u-jan', 'jan@example.cz', 'Jan Novák', 'owner')`,
      [clientId],
    )
    const res = await inviteToClientSpace(PB, { email: 'jan@example.cz', confirmClientId: clientId })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.mode).toBe('new_project')
    expect(res.inviteId).toBeNull()
    expect(res.url).toBe(`https://www.zakaziq.cz/klient/projekt/${PB}`)
    expect(await count('portal.invites', 'used_at IS NULL')).toBe(0)

    // Stejná zakázka podruhé: člověk ji už vidí, nic se neposílá.
    const again = await inviteToClientSpace(PB, { email: 'jan@example.cz' })
    expect(again).toEqual({ success: false, error: 'Tenhle člověk už v prostoru je a zakázku vidí.' })
  })

  it('další člověk do existujícího prostoru dostane pozvánku jako člen', async () => {
    await inviteToClientSpace(PA, { email: 'jan@example.cz' })
    const clientId = ((await db.query(`SELECT id FROM portal.clients`)).rows[0] as { id: string }).id
    await db.query(
      `INSERT INTO portal.members (client_id, clerk_user_id, email, name, role) VALUES ($1, 'u-jan', 'jan@example.cz', 'Jan Novák', 'owner')`,
      [clientId],
    )
    const res = await inviteToClientSpace(PA, { email: 'petra@example.cz' })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.unlinkOnUndo).toBe(false)
    const role = (await db.query(`SELECT role FROM portal.invites WHERE email = 'petra@example.cz'`)).rows[0] as { role: string }
    expect(role.role).toBe('member')
  })

  it('„Zpět" zruší pozvánku, odpojí zakázku a smaže čerstvě založeného prázdného klienta', async () => {
    const res = await inviteToClientSpace(PA, { email: 'jan@example.cz' })
    if (!res.success) throw new Error(res.error)
    const back = await undoClientSpaceInvite(PA, res.inviteId, res.unlinkOnUndo)
    expect(back.success).toBe(true)
    expect(await count('portal.invites', 'revoked_at IS NULL')).toBe(0)
    expect(await count('portal.projects')).toBe(0)
    expect(await count('portal.clients')).toBe(0)
  })

  it('„Zpět" u dalšího člověka nechá prostor i zakázku na místě', async () => {
    await inviteToClientSpace(PA, { email: 'jan@example.cz' })
    const res = await inviteToClientSpace(PA, { email: 'petra@example.cz' })
    if (!res.success) throw new Error(res.error)
    await undoClientSpaceInvite(PA, res.inviteId, res.unlinkOnUndo)
    expect(await count('portal.clients')).toBe(1)
    expect(await count('portal.projects')).toBe(1)
  })
})

describe('odeslání pozvánky po odkladu', () => {
  async function invited() {
    const res = await inviteToClientSpace(PA, { email: 'jan@example.cz' })
    if (!res.success) throw new Error(res.error)
    const clientId = ((await db.query(`SELECT id FROM portal.clients`)).rows[0] as { id: string }).id
    return {
      res,
      job: {
        mode: res.mode,
        projectId: PA,
        clientId,
        inviteId: res.inviteId,
        email: res.email,
        url: res.url,
        projectTitle: 'Web pro kavárnu <b>',
        expiresAt: new Date('2026-12-02T10:00:00Z'),
      } as const,
    }
  }

  it('pošle e-mail jednou s klíčem proti dvojímu odeslání a bez hesla', async () => {
    const { job } = await invited()
    const send = vi.fn(async (_mail: VizeonMail) => ({ ok: true as const, id: 'm1' }))
    expect(await deliverPortalInvite(job, send)).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    const mail = send.mock.calls[0][0]
    expect(mail.to).toBe('jan@example.cz')
    expect(mail.idempotencyKey).toBe(`portal-invite-${job.inviteId}`)
    expect(mail.html).toContain('Web pro kavárnu &lt;b&gt;')
    expect(mail.text).toContain(job.url)
    expect(mail.text).toContain('Heslo si nastavíte sami')
  })

  it('po „Zpět" nic neodejde', async () => {
    const { res, job } = await invited()
    await undoClientSpaceInvite(PA, res.inviteId, res.unlinkOnUndo)
    const send = vi.fn(async (_mail: VizeonMail) => ({ ok: true as const, id: 'm1' }))
    expect(await deliverPortalInvite(job, send)).toBe('cancelled')
    expect(send).not.toHaveBeenCalled()
  })

  it('když e-mail neodejde, přijde oznámení bez odkazu s kódem', async () => {
    const { job } = await invited()
    const send = vi.fn(async (_mail: VizeonMail) => ({ ok: false as const, error: 'Resend 500' }))
    expect(await deliverPortalInvite(job, send)).toBe('failed')
    const rows = (await db.query(`SELECT type, body, link FROM notifications`)).rows as { type: string; body: string; link: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('portal_invite_failed')
    expect(rows[0].link).toBe(`/dashboard/${PA}`)
    expect(rows[0].body).not.toContain('/klient/pozvanka/')
  })
})

describe('stav prostoru u zakázky', () => {
  it('bez prostoru vrátí prázdný stav, s pozvánkou klienta a čekající pozvánku', async () => {
    expect(await loadProjectPortalAccess(PC)).toEqual({ available: true, client: null, members: [], pending: [] })
    await inviteToClientSpace(PA, { company: 'Kavárna Novák', email: 'jan@example.cz' })
    const access = await loadProjectPortalAccess(PA)
    expect(access?.client?.name).toBe('Kavárna Novák')
    expect(access?.members).toEqual([])
    expect(access?.pending.map((p) => p.email)).toEqual(['jan@example.cz'])
  })
})

describe('e-mail s pozvánkou', () => {
  it('odmítne odkaz bez https', () => {
    expect(() =>
      renderPortalInviteEmail({ kind: 'new_project', projectTitle: 'Web', url: 'http://zakaziq.cz/klient' }),
    ).toThrow()
  })

  it('zpráva o nové zakázce nemluví o hesle ani o platnosti odkazu', () => {
    const mail = renderPortalInviteEmail({ kind: 'new_project', projectTitle: 'E-shop', url: 'https://www.zakaziq.cz/klient/projekt/x' })
    expect(mail.subject).toBe('Nová zakázka ve vašem prostoru')
    expect(mail.text).not.toContain('platí do')
  })
})
