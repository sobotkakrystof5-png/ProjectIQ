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

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))
vi.mock('@/lib/auth', () => ({ requireAuth: async () => undefined, getAdminSession: async () => ({ email: 'admin@example.cz' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }))
vi.mock('@/lib/client-request-ai', () => ({ summarizeClientRequest: vi.fn(async () => ({ error: 'off' })) }))

import { makeRequestFromMessages } from '@/app/dashboard/zpravy/actions'
import { listClientThreads, loadClientThread, clientChatStamp, totalUnread } from '@/lib/portal/chat'
import { loadAdminThread, notifyNewMessage, purgeDeletedAttachments } from '@/lib/admin/chat'
import { safeFilename, sniffMime } from '@/lib/chat/storage'

// KP15 (R-122, R-123, D-K17–D-K19): chat s klientem. Migrace 124 dvakrát po
// sobě nad PGlite, klient píše a čte jako role portal_app, admin vlastníkem.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const FILE_A = 'aaaaaaaa-0000-4000-8000-00000000f001'

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

/** Ovladač lib/portal/db nad PGlite jako role portal_app (stejně jako Neon s DATABASE_URL_PORTAL). */
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

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? 'bez kódu')

const post = (clientId: string, member: string, project: string, body: string, extra: { reply?: string | null; files?: unknown[] } = {}) =>
  asClient<{ id: string }>(clientId, `SELECT portal.post_message($1, $2, 'text', $3, $4, $5::jsonb)::text AS id`, [
    project, member, body, extra.reply ?? null, JSON.stringify(extra.files ?? []),
  ])

const adminPost = (project: string, body: string, kind = 'text') =>
  db.query<{ id: string }>(`SELECT portal_admin_post($1, $2, $3, NULL, NULL, '[]'::jsonb, 'Kryštof Sobotka')::text AS id`, [project, kind, body])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, focus text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
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
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }
  await db.query(`INSERT INTO projects (id, client_name) VALUES ($1, 'Web A'), ($2, 'Web B')`, [PA, PB])
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [B, PB])
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, name, role) VALUES
      ($1, $2, 'sb-a', 'jana@example.cz', 'Jana', 'owner'), ($3, $4, 'sb-b', 'petr@example.cz', NULL, 'owner')`,
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
  await db.exec('DELETE FROM portal.messages; DELETE FROM portal.thread_state; DELETE FROM storage_deletions; DELETE FROM client_requests;')
})

describe('zprávy a oddělení klientů', () => {
  it('klient píše jen do své zakázky a vlákno klienta A klient B nevidí', async () => {
    await post(A, MA, PA, 'Logo prosím menší')
    expect(await code(post(A, MA, PB, 'Cizí zakázka'))).toBe('P0002')
    expect(await code(post(A, MB, PA, 'Cizí člen'))).toBe('P0002')
    expect(await asClient(B, 'SELECT id FROM portal.messages')).toHaveLength(0)
    const thread = await loadClientThread(A, PA)
    expect(thread.messages.map((m) => [m.author, m.authorName, m.body])).toEqual([['client', 'Jana', 'Logo prosím menší']])
  })

  it('prázdná zpráva bez přílohy neprojde a příloha jde jen do vlastní složky', async () => {
    expect(await code(post(A, MA, PA, '   '))).toBe('P0001')
    const own = { id: FILE_A, path: `${A}/${PA}/${FILE_A}`, mime: 'image/png', size: 10, filename: 'screen.png' }
    const foreign = { ...own, id: 'aaaaaaaa-0000-4000-8000-00000000f002', path: `${B}/${PB}/aaaaaaaa-0000-4000-8000-00000000f002` }
    expect(await code(post(A, MA, PA, '', { files: [foreign] }))).toBe('P0001')
    await post(A, MA, PA, '', { files: [own] })
    expect(await asClient(B, 'SELECT id FROM portal.message_attachments')).toHaveLength(0)
    expect((await asClient(A, 'SELECT filename FROM portal.message_attachments')).map((r) => r.filename)).toEqual(['screen.png'])
    expect(await code(asClient(A, 'SELECT storage_path FROM portal.message_attachments'))).toBe('42501')
    // Soubor vydá jen úzká funkce, a jen svému klientovi.
    expect(await code(asClient(B, 'SELECT * FROM portal.attachment_file($1, $2)', [FILE_A, MB]))).toBe('P0002')
    const file = await asClient<{ storage_path: string }>(A, 'SELECT * FROM portal.attachment_file($1, $2)', [FILE_A, MA])
    expect(file[0].storage_path).toBe(own.path)
  })

  it('smazaná zpráva pošle soubor přílohy do fronty a cron ho smaže', async () => {
    const own = { id: FILE_A, path: `${A}/${PA}/${FILE_A}`, mime: 'application/pdf', size: 99, filename: 'nabidka.pdf' }
    await post(A, MA, PA, 'Posílám PDF', { files: [own] })
    await db.query('DELETE FROM portal.messages WHERE project_id = $1', [PA])
    const removed: string[][] = []
    expect(await purgeDeletedAttachments(async (paths) => { removed.push(paths) }, true)).toBe(1)
    expect(removed).toEqual([[own.path]])
    expect((await db.query('SELECT 1 FROM storage_deletions')).rows).toHaveLength(0)
  })

  it('citace jen na zprávu z téhož vlákna', async () => {
    const [{ id }] = await post(A, MA, PA, 'Původní')
    const [{ id: other }] = await post(B, MB, PB, 'Cizí')
    expect(await code(post(A, MA, PA, 'Odpověď na cizí', { reply: other }))).toBe('P0001')
    await post(A, MA, PA, 'Odpověď', { reply: id })
    const thread = await loadClientThread(A, PA)
    expect(thread.messages[1].replyTo).toMatchObject({ id, body: 'Původní' })
  })
})

describe('přečteno a nepřečtené', () => {
  it('dvě fajfky až když si zprávu přečte druhá strana; aktivitu admina klient nevidí', async () => {
    await post(A, MA, PA, 'Ahoj')
    let thread = await loadClientThread(A, PA)
    expect(thread.reads.otherReadAt).toBeNull()

    await db.query('SELECT portal_admin_touch($1, false)', [PA])
    thread = await loadClientThread(A, PA)
    expect(thread.reads.otherReadAt).toBeNull() // otevřené, ale karta nebyla vidět

    await db.query('SELECT portal_admin_touch($1, true)', [PA])
    thread = await loadClientThread(A, PA)
    expect(thread.reads.otherReadAt).not.toBeNull()
    expect(await code(asClient(A, `SELECT last_seen_at FROM portal.thread_state WHERE side = 'admin'`))).toBe('42501')

    const admin = await loadAdminThread(PA)
    expect(admin!.info.clientLastSeen).not.toBeNull()
  })

  it('počet nepřečtených sedí v seznamu i v součtu a zmizí po přečtení klientem', async () => {
    await adminPost(PA, 'Posílám návrh')
    await adminPost(PA, 'A ještě ceník')
    const threads = await listClientThreads(A)
    expect(threads.find((t) => t.projectId === PA)!.unread).toBe(2)
    expect(totalUnread(threads)).toBe(2)
    await asClient(A, 'SELECT portal.touch_thread($1, $2, true)', [PA, MA])
    expect(totalUnread(await listClientThreads(A))).toBe(0)
    expect(totalUnread(await listClientThreads(B))).toBe(0)
  })

  it('kdo napíše, přečetl celé vlákno a přečtení zapíše jméno člena', async () => {
    await adminPost(PA, 'Dotaz')
    await post(A, MA, PA, 'Odpověď')
    expect(totalUnread(await listClientThreads(A))).toBe(0)
    await db.query('SELECT portal_admin_touch($1, true)', [PA])
    const admin = await loadAdminThread(PA)
    expect(admin!.reads.otherReaderName).toBe('Jana')
  })

  it('otisk se nemění bez změny a změní se novou zprávou', async () => {
    const before = await clientChatStamp(A)
    expect(await clientChatStamp(A)).toBe(before)
    await adminPost(PA, 'Novinka')
    expect(await clientChatStamp(A)).not.toBe(before)
    expect(await clientChatStamp(B)).toBe(await clientChatStamp(B))
  })
})

describe('upozornění e-mailem', () => {
  it('neodejde, když má druhá strana chat otevřený, a nejvýš jednou za hodinu', async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: 'm' }))
    await asClient(A, 'SELECT portal.touch_thread($1, $2, false)', [PA, MA]) // klient má chat otevřený
    await notifyNewMessage(PA, 'admin', { body: 'Hotovo', attachments: 0 }, { send })
    expect(send).not.toHaveBeenCalled()

    await db.query(`UPDATE portal.thread_state SET last_seen_at = now() - interval '5 minutes' WHERE side = 'client'`)
    await notifyNewMessage(PA, 'admin', { body: 'Hotovo', attachments: 0 }, { send })
    await notifyNewMessage(PA, 'admin', { body: 'A ještě', attachments: 0 }, { send })
    expect(send).toHaveBeenCalledTimes(1)
    expect((send.mock.calls[0] as unknown as [{ to: string; text: string }])[0]).toMatchObject({ to: 'jana@example.cz' })
    expect((send.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain(`/klient/zpravy/${PA}`)
  })

  it('Kryštofovi zvonek u každé zprávy klienta, e-mail jen když schránku nemá otevřenou', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.cz'
    const notify = vi.fn(async () => {})
    const sendAdmin = vi.fn(async () => true)
    await db.query('SELECT portal_admin_touch($1, false)', [PA])
    await notifyNewMessage(PA, 'client', { body: 'Dotaz', attachments: 0 }, { notify, sendAdmin })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(sendAdmin).not.toHaveBeenCalled()
  })
})

describe('ke schválení a zadání', () => {
  it('klient odpoví na schválení jen jednou, cizí klient vůbec', async () => {
    const [{ id }] = (await adminPost(PA, 'Návrh úvodní stránky', 'approval')).rows
    expect(await code(asClient(B, `SELECT portal.answer_approval($1, $2, 'approved', '')`, [id, MB]))).toBe('P0002')
    expect(await code(asClient(A, `SELECT portal.answer_approval($1, $2, 'changes', '')`, [id, MA]))).toBe('P0001')
    await asClient(A, `SELECT portal.answer_approval($1, $2, 'changes', 'Logo vlevo')`, [id, MA])
    expect(await code(asClient(A, `SELECT portal.answer_approval($1, $2, 'approved', '')`, [id, MA]))).toBe('P0409')
    const thread = await loadClientThread(A, PA)
    expect(thread.messages.map((m) => [m.kind, m.approvalState, m.body])).toEqual([
      ['approval', 'changes', 'Návrh úvodní stránky'],
      ['approval_answer', null, 'Logo vlevo'],
    ])
    expect(thread.messages[1].replyTo?.id).toBe(id)
  })

  it('zadání jde udělat jen ze zpráv klienta téhle zakázky a stav se ukáže u zprávy', async () => {
    const [{ id: a1 }] = await post(A, MA, PA, 'Změňte barvu tlačítka')
    const [{ id: b1 }] = await post(B, MB, PB, 'Cizí')
    const [{ id: mine }] = (await adminPost(PA, 'Moje zpráva')).rows

    expect(await makeRequestFromMessages(PA, [a1, b1])).toMatchObject({ success: false })
    expect(await makeRequestFromMessages(PA, [mine])).toMatchObject({ success: false })
    const res = await makeRequestFromMessages(PA, [a1])
    expect(res.success).toBe(true)
    const req = await db.query<{ raw_text: string; project_id: string }>('SELECT raw_text, project_id::text FROM client_requests')
    expect(req.rows).toEqual([{ raw_text: 'Změňte barvu tlačítka', project_id: PA }])

    await db.query(`UPDATE client_requests SET status = 'done'`)
    const thread = await loadClientThread(A, PA)
    expect(thread.messages.find((m) => m.id === a1)!.requestStatus).toBe('done')
  })

  it('staré požadavky z doby před chatem zůstanou ve vlákně', async () => {
    await asClient(A, `SELECT * FROM portal.submit_request($1, $2, 'text', 'Starý požadavek z prostoru')`, [PA, MA])
    const thread = await loadClientThread(A, PA)
    expect(thread.messages.map((m) => [m.kind, m.body])).toContainEqual(['request', 'Starý požadavek z prostoru'])
  })
})

describe('soubory', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
  const text = (s: string) => new TextEncoder().encode(s)

  it('typ se pozná podle obsahu, ne podle přípony', () => {
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffMime(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp')
    expect(sniffMime(text('%PDF-1.7\n'))).toBe('application/pdf')
    expect(sniffMime(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffMime(text('<!doctype html><script>alert(1)</script>'))).toBeNull()
  })

  it('název souboru bez cesty a s příponou podle skutečného typu', () => {
    expect(safeFilename('../../etc/passwd', 'image/png')).toBe('passwd.png')
    expect(safeFilename('Návrh "webu".html', 'application/pdf')).toBe('Návrh webu.pdf')
    expect(safeFilename('', 'image/jpeg')).toBe('priloha.jpg')
  })
})
