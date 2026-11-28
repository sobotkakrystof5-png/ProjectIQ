import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

let db: PGlite

vi.mock('server-only', () => ({}))
vi.setConfig({ testTimeout: 30_000 })
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { createDevice } from '@/lib/admin/voice/devices'
import { GET as LIST, POST as CREATE } from '@/app/api/public/voice/meetings/route'
import { DELETE, GET as DETAIL, PATCH } from '@/app/api/public/voice/meetings/[id]/route'
import { GET as CONTACTS } from '@/app/api/public/voice/meetings/[id]/contacts/route'
import { POST as TURN } from '@/app/api/public/voice/meetings/[id]/turns/route'
import { POST as FINISH } from '@/app/api/public/voice/meetings/[id]/finish/route'
import { POST as SUMMARIZE } from '@/app/api/public/voice/meetings/[id]/summary/route'

// ZakazIQ Voice — schůzky (R-151): celý tok přes skutečné route handlery,
// PGlite s migracemi 138 a 139, podvržený přepis (OpenAI) a Claude.

const ROOT = path.resolve(__dirname, '../../../../../..')
const M4A_HEAD = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]
const m4a = () => {
  const bytes = new Uint8Array(1024)
  bytes.set(M4A_HEAD)
  return new Blob([bytes], { type: 'audio/mp4' })
}

let key = ''
let otherKey = ''
let fetchMock: ReturnType<typeof vi.fn>
/** Texty, které „řekne" přepis, postupně. */
let sttTexts: string[] = []
const isClaude = (url: unknown) => String(url).startsWith('https://api.anthropic.com/')
const sttCalls = () => fetchMock.mock.calls.filter((c) => !isClaude(c[0])).length
let claudeBody = ''

const SUMMARY = {
  title: 'Nový web pro Ateliér Horák',
  summary: 'Domluvili jsme nový web.',
  agreements: ['Cena 40 000 Kč.'],
  my_steps: ['Pošlu návrh do pátku.'],
  client_steps: ['Pošlete fotky.'],
  open_questions: [],
  internal_notes: [],
}

function reply(url: unknown, init?: RequestInit): Response {
  if (isClaude(url)) {
    claudeBody = String(init?.body)
    return new Response(
      JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'test', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: JSON.stringify(SUMMARY) }],
        usage: { input_tokens: 4000, output_tokens: 300 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(JSON.stringify({ text: sttTexts.shift() ?? '' }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const headers = (k: string | null = key, extra: Record<string, string> = {}) => ({ ...(k ? { authorization: `Bearer ${k}` } : {}), ...extra })
const json = (url: string, body: unknown, k: string | null = key, method = 'POST') =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers(k) } })

function turnReq(id: string, meta: Record<string, unknown>, k = key) {
  const form = new FormData()
  form.append('meta', JSON.stringify(meta))
  form.append('audio', m4a(), 'promluva.m4a')
  return new NextRequest(`http://localhost/api/public/voice/meetings/${id}/turns`, { method: 'POST', body: form, headers: headers(k) })
}

const body = async (res: Response) => (await res.json()) as Record<string, any>

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE api_requests (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, endpoint text NOT NULL, ip text NOT NULL, created_at timestamptz DEFAULT now())`)
  await db.exec(`CREATE TABLE contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, company text, email text, phone text,
    merged_into uuid, last_seen_at timestamptz)`)
  await db.exec(`CREATE TABLE client_leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid)`)
  await db.exec(`CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid)`)
  await db.exec(`CREATE TABLE consultation_slots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid)`)
  await db.exec(`CREATE TABLE calendar_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
    lead_id uuid, project_id uuid, consultation_slot_id uuid, invite_to text)`)
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations/018_notifications.sql'), 'utf8'))
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations/138_zakaziq_voice.sql'), 'utf8'))
  const m139 = fs.readFileSync(path.join(ROOT, 'migrations/139_voice_schuzky.sql'), 'utf8')
  await db.exec(m139)
  await db.exec(m139) // idempotentní
  setAdminDbForTests(pgliteAdminDriver(db))
  process.env.AGENT_KEY_PEPPER = 'p'.repeat(40)
  const a = await createDevice('MacBook', 'test')
  const b = await createDevice('Jiný Mac', 'test')
  if (!a.ok || !b.ok) throw new Error('zařízení')
  key = a.key
  otherKey = b.key
  await db.exec(`INSERT INTO voice_terms (kind, term, heard_as) VALUES ('term', 'Prvotka', '{"prvotko"}')`)
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db?.close()
})

beforeEach(async () => {
  process.env.OPENAI_API_KEY = 'sk-test'
  process.env.VOICE_STT_PROVIDER = 'openai'
  delete process.env.GROQ_API_KEY
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  sttTexts = []
  fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => reply(url, init))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await db.exec(`DELETE FROM api_requests; DELETE FROM voice_meetings; DELETE FROM calendar_events; DELETE FROM client_leads; DELETE FROM contacts`)
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.VOICE_STT_PROVIDER
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const startedAt = () => new Date(Date.now() - 60_000).toISOString()
const createBody = (id: string) => ({ id, startedAt: startedAt(), title: null, app: { bundleId: 'com.google.Chrome', name: 'Google Chrome' } })

describe('schůzky přes /api/public/voice/meetings', () => {
  it('celý tok: založení, promluvy dvou stran, ozvěna, konec, shrnutí, smazání', async () => {
    const id = crypto.randomUUID()
    expect((await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))).status).toBe(200)
    expect((await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))).status).toBe(200)

    sttTexts = ['Dobrý den, tady Kryštof z prvotko.', 'Dobrý den, cena bude čtyřicet tisíc.', 'cena bude čtyřicet tisíc']
    const r1 = await TURN(turnReq(id, { track: 'me', idx: 0, startMs: 0, durationMs: 3000, speechMs: 2500 }), ctx(id))
    expect(r1.status).toBe(200)
    expect((await body(r1)).text).toBe('Dobrý den, tady Kryštof z Prvotka.')
    await TURN(turnReq(id, { track: 'other', idx: 0, startMs: 4000, durationMs: 5000, speechMs: 4000 }), ctx(id))
    // Ozvěna: mikrofon slyšel druhou stranu z reproduktorů.
    await TURN(turnReq(id, { track: 'me', idx: 1, startMs: 4300, durationMs: 4500, speechMs: 3000 }), ctx(id))
    // Ticho: přepis se nevolá.
    await TURN(turnReq(id, { track: 'other', idx: 1, startMs: 12_000, durationMs: 2000, speechMs: 100 }), ctx(id))
    expect(sttCalls()).toBe(3)

    // Opakované odeslání téže promluvy z fronty se neplatí znovu.
    const again = await TURN(turnReq(id, { track: 'me', idx: 0, startMs: 0, durationMs: 3000, speechMs: 2500 }), ctx(id))
    expect((await body(again)).text).toBe('Dobrý den, tady Kryštof z Prvotka.')
    expect(sttCalls()).toBe(3)

    const fin = await FINISH(json(`http://localhost/api/public/voice/meetings/${id}/finish`, { endedAt: new Date().toISOString(), durationMs: 60_000 }), ctx(id))
    expect(fin.status).toBe(200)
    const meeting = (await body(fin)).meeting
    expect(meeting.status).toBe('done')
    expect(meeting.blocks.map((b: { label: string }) => b.label)).toEqual(['Kryštof', 'Klient'])
    expect(meeting.transcript).toBe('[0:00] Kryštof: Dobrý den, tady Kryštof z Prvotka.\n\n[0:04] Klient: Dobrý den, cena bude čtyřicet tisíc.')
    // Kontrola po schůzce: obě strany slyšet, jedna promluva z mikrofonu byla ozvěna.
    expect(meeting.check).toEqual({ meTurns: 1, otherTurns: 1, echoTurns: 1 })

    const sum = await SUMMARIZE(json(`http://localhost/api/public/voice/meetings/${id}/summary`, {}), ctx(id))
    expect(sum.status).toBe(200)
    const summarized = (await body(sum)).meeting
    expect(summarized.summary.agreements).toEqual(['Cena 40 000 Kč.'])
    expect(summarized.title).toBe('Nový web pro Ateliér Horák')
    expect(summarized.summaryText).toContain('Co udělám já\n- Pošlu návrh do pátku.')
    expect(claudeBody).toContain('<prepis>')
    expect(claudeBody).not.toContain('cena bude čtyřicet tisíc\n') // ozvěna se modelu neposílá

    const list = await body(await LIST(new NextRequest('http://localhost/api/public/voice/meetings', { headers: headers() })))
    expect(list.meetings).toHaveLength(1)
    expect(list.meetings[0].hasSummary).toBe(true)

    const del = await DELETE(new NextRequest(`http://localhost/api/public/voice/meetings/${id}`, { method: 'DELETE', headers: headers() }), ctx(id))
    expect(del.status).toBe(200)
    expect((await db.query('SELECT count(*)::int AS n FROM voice_meeting_turns')).rows[0]).toEqual({ n: 0 })
  })

  it('cizí zařízení schůzku nevidí, nepřidá do ní promluvu a nesmaže ji', async () => {
    const id = crypto.randomUUID()
    await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))
    expect((await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id), otherKey))).status).toBe(404)
    expect((await DETAIL(new NextRequest(`http://localhost/x/${id}`, { headers: headers(otherKey) }), ctx(id))).status).toBe(404)
    sttTexts = ['podvržené']
    expect((await TURN(turnReq(id, { track: 'other', idx: 0, startMs: 0, durationMs: 2000, speechMs: 1500 }, otherKey), ctx(id))).status).toBe(404)
    expect(sttCalls()).toBe(0)
    expect((await DELETE(new NextRequest(`http://localhost/x/${id}`, { method: 'DELETE', headers: headers(otherKey) }), ctx(id))).status).toBe(404)
  })

  it('bez klíče 401, s hlavičkou Origin 403, nesmyslná meta 400', async () => {
    const id = crypto.randomUUID()
    expect((await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id), null))).status).toBe(401)
    const withOrigin = new NextRequest('http://localhost/api/public/voice/meetings', {
      method: 'POST', body: JSON.stringify(createBody(id)), headers: { ...headers(), origin: 'https://evil.example' },
    })
    expect((await CREATE(withOrigin)).status).toBe(403)
    await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))
    const bad = await TURN(turnReq(id, { track: 'oba', idx: 0, startMs: 0, durationMs: 2000, speechMs: 1500 }), ctx(id))
    expect(bad.status).toBe(400)
  })

  it('selhaný přepis se při dalším odeslání zkusí znovu', async () => {
    const id = crypto.randomUUID()
    await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 500 }))
    const failed = await TURN(turnReq(id, { track: 'me', idx: 0, startMs: 0, durationMs: 2000, speechMs: 1500 }), ctx(id))
    expect(failed.status).toBe(502)
    sttTexts = ['Teď už to jde.']
    const retried = await TURN(turnReq(id, { track: 'me', idx: 0, startMs: 0, durationMs: 2000, speechMs: 1500 }), ctx(id))
    expect((await body(retried)).text).toBe('Teď už to jde.')
  })

  it('kontakt z Macu: návrh z kalendáře, hledání bez e-mailu, přiřazení a odpojení', async () => {
    const id = crypto.randomUUID()
    await CREATE(json('http://localhost/api/public/voice/meetings', createBody(id)))
    const [{ root }] = (await db.query<{ root: string }>(
      `INSERT INTO contacts (display_name, company, email) VALUES ('Jan Horák', 'Ateliér Horák', 'jan@horak.example') RETURNING id::text AS root`,
    )).rows
    const [{ old }] = (await db.query<{ old: string }>(
      `INSERT INTO contacts (display_name, email, merged_into) VALUES ('J. Horák', 'stary@horak.example', $1) RETURNING id::text AS old`, [root],
    )).rows
    await db.query(`INSERT INTO contacts (display_name, email) VALUES ('Petra Nováková', 'petra@example.cz')`)
    // Událost v kalendáři ve stejný čas, přes Hovory na sloučený kontakt.
    const [{ lead }] = (await db.query<{ lead: string }>(`INSERT INTO client_leads (contact_id) VALUES ($1) RETURNING id::text AS lead`, [old])).rows
    await db.query(
      `INSERT INTO calendar_events (title, starts_at, ends_at, lead_id) VALUES ('Schůzka', now() - interval '65 minutes', now() - interval '5 minutes', $1)`, [lead],
    )
    // Událost o den dřív se nenavrhne.
    await db.query(`INSERT INTO calendar_events (title, starts_at, ends_at, invite_to) VALUES ('Včera', now() - interval '1 day', now() - interval '23 hours', 'petra@example.cz')`)

    const url = (q = '') => new NextRequest(`http://localhost/api/public/voice/meetings/${id}/contacts${q}`, { headers: headers() })
    const first = await body(await CONTACTS(url(), ctx(id)))
    expect(first.suggested).toEqual([{ id: root, name: 'Jan Horák', company: 'Ateliér Horák' }])
    expect(first.results).toEqual([])
    const found = await body(await CONTACTS(url('?q=petra'), ctx(id)))
    expect(found.results).toEqual([{ id: expect.any(String), name: 'Petra Nováková', company: null }])
    expect(JSON.stringify(found)).not.toContain('@')
    expect((await body(await CONTACTS(url('?q=p'), ctx(id)))).results).toEqual([])
    expect((await CONTACTS(new NextRequest(`http://localhost/x?q=petra`, { headers: headers(otherKey) }), ctx(id))).status).toBe(404)

    const patch = (contactId: unknown, k: string | null = key) =>
      PATCH(json(`http://localhost/api/public/voice/meetings/${id}`, { contactId }, k, 'PATCH'), ctx(id))
    // Sloučený kontakt se nahradí tím, do kterého patří.
    const assigned = await patch(old)
    expect(assigned.status).toBe(200)
    expect((await body(assigned)).meeting.contactName).toBe('Jan Horák')
    expect((await db.query(`SELECT contact_id::text AS c FROM voice_meetings WHERE id = $1`, [id])).rows[0]).toEqual({ c: root })
    expect((await patch(crypto.randomUUID())).status).toBe(404)
    expect((await body(await patch(crypto.randomUUID()))).code).toBe('CONTACT_NOT_FOUND')
    expect((await patch(root, otherKey)).status).toBe(404)
    expect((await patch('neni-uuid')).status).toBe(400)
    const detached = await patch(null)
    expect((await body(detached)).meeting.contactName).toBeNull()
  })
})
