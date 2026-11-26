import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

let db: PGlite
/** Databáze bez migrace 136 — zakládá se v beforeAll, uvnitř testu by PGlite pod zátěží přetáhla limit 5 s. */
let emptyDb: PGlite

vi.mock('server-only', () => ({}))
// PGlite a první požadavek na routu jsou pod zátěží celé sady pomalé (známé u testů nad PGlite).
vi.setConfig({ testTimeout: 30_000 })
// Limity požadavků (`lib/api-rate-limit.ts`) jdou přes `lib/db` → tatáž PGlite.
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { createDevice, revokeDevice } from '@/lib/admin/voice/devices'
import { POST } from '@/app/api/public/voice/dictate/route'
import { GET as CONFIG } from '@/app/api/public/voice/config/route'

// ZakazIQ Voice (R-148, VO02): veřejný vstup diktátu přes skutečný route
// handler, PGlite s migrací 136 a podvržený Groq.

const ROOT = path.resolve(__dirname, '../../../../../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/136_zakaziq_voice.sql'), 'utf8')
const GROQ_VERBOSE = fs.readFileSync(path.join(ROOT, 'lib/__tests__/fixtures/voice-groq-verbose.json'), 'utf8')

const M4A_HEAD = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]
const m4a = (size = 2048) => {
  const bytes = new Uint8Array(size)
  bytes.set(M4A_HEAD)
  return new Blob([bytes], { type: 'audio/mp4' })
}

let key = ''
let deviceId = ''
let fetchMock: ReturnType<typeof vi.fn>

const meta = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  startedAt: new Date(Date.now() - 10_000).toISOString(),
  durationMs: 6500,
  speechMs: 6000,
  mode: 'hold',
  app: { bundleId: 'com.apple.mail', name: 'Mail', titleHint: null },
  ...over,
})

function request(opts: { meta?: unknown; audio?: Blob | null; auth?: string | null; headers?: Record<string, string> } = {}) {
  const form = new FormData()
  const m = opts.meta === undefined ? meta() : opts.meta
  if (m !== null) form.append('meta', typeof m === 'string' ? m : JSON.stringify(m))
  const audio = opts.audio === undefined ? m4a() : opts.audio
  if (audio) form.append('audio', audio, 'diktat.m4a')
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const auth = opts.auth === undefined ? key : opts.auth
  if (auth) headers.authorization = `Bearer ${auth}`
  return new NextRequest('http://localhost/api/public/voice/dictate', { method: 'POST', body: form, headers })
}

const groqOk = () =>
  new Response(GROQ_VERBOSE, { status: 200, headers: { 'content-type': 'application/json' } })

beforeAll(async () => {
  db = new PGlite()
  emptyDb = new PGlite()
  // PGlite startuje až prvním dotazem; ať se to nestane uvnitř testu.
  await emptyDb.query('SELECT 1')
  await db.exec(`CREATE TABLE api_requests (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, endpoint text NOT NULL, ip text NOT NULL, created_at timestamptz DEFAULT now())`)
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
  process.env.AGENT_KEY_PEPPER = 'p'.repeat(40)
  const res = await createDevice('MacBook', 'test')
  if (!res.ok) throw new Error('zařízení')
  key = res.key
  deviceId = res.device.id
  await db.exec(`INSERT INTO voice_terms (kind, term, heard_as) VALUES ('term', 'Prvotka', '{"prvotko"}')`)
  await db.exec(`INSERT INTO voice_terms (kind, term, expansion) VALUES ('snippet', 'můj podpis', 'S pozdravem')`)
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db?.close()
  await emptyDb?.close()
})

beforeEach(async () => {
  process.env.AGENT_KEY_PEPPER = 'p'.repeat(40)
  process.env.GROQ_API_KEY = 'gsk_test'
  delete process.env.OPENAI_API_KEY
  delete process.env.VOICE_STT_PROVIDER
  fetchMock = vi.fn(async () => groqOk())
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await db.exec(`DELETE FROM api_requests; DELETE FROM voice_dictations; UPDATE voice_settings SET value = 'true' WHERE key = 'store_text'`)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const body = async (res: Response) => (await res.json()) as Record<string, unknown>

describe('POST /api/public/voice/dictate', () => {
  it('přepíše, zahodí halucinaci, opraví slovník, zapíše diktát bez zvuku', async () => {
    const m = meta()
    const res = await POST(request({ meta: m }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await body(res)).toEqual({
      ok: true,
      id: m.id,
      status: 'ok',
      text: 'Dobrý den, posílám nabídku na nový web pro Prvotka.',
      words: 9,
      guards: ['segments'],
    })
    const row = (await db.query<Record<string, unknown>>(`SELECT * FROM voice_dictations WHERE id = $1`, [m.id])).rows[0]
    expect(row).toMatchObject({
      device_id: deviceId,
      status: 'ok',
      category: 'email',
      app_name: 'Mail',
      words: 9,
      dictionary_fixes: 1,
      stt_provider: 'groq',
      stt_model: 'whisper-large-v3-turbo',
      guards: ['segments'],
    })
    expect(Number(row.cost_usd)).toBeGreaterThan(0)
    expect(Number(row.total_ms)).toBeGreaterThanOrEqual(0)
    expect(String(row.raw_text)).toContain('Titulky vytvořil')
    // Titulek okna (titleHint) se neukládá nikde.
    expect(JSON.stringify(row)).not.toContain('titleHint')
    const used = await db.query<{ uses: number }>(`SELECT uses FROM voice_terms WHERE term = 'Prvotka'`)
    expect(used.rows[0].uses).toBeGreaterThanOrEqual(1)
    const device = await db.query<{ last_used_at: unknown }>(`SELECT last_used_at FROM voice_devices WHERE id = $1`, [deviceId])
    expect(device.rows[0].last_used_at).not.toBeNull()
  })

  it('stejné id podruhé vrátí uložený výsledek bez nového přepisu', async () => {
    const m = meta()
    const first = await body(await POST(request({ meta: m })))
    const second = await body(await POST(request({ meta: m })))
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM voice_dictations`)
    expect(n.rows[0].n).toBe(1)
  })

  it('zrušený diktát (Esc) uloží jen čísla a nic nepřepisuje', async () => {
    const m = meta({ cancelled: true })
    expect(await body(await POST(request({ meta: m, audio: null })))).toMatchObject({ status: 'cancelled', text: '' })
    expect(fetchMock).not.toHaveBeenCalled()
    const row = (await db.query<{ status: string; raw_text: unknown }>(`SELECT status, raw_text FROM voice_dictations WHERE id = $1`, [m.id])).rows[0]
    expect(row).toEqual({ status: 'cancelled', raw_text: null })
  })

  it('G1: ticho se nepřepisuje', async () => {
    const res = await body(await POST(request({ meta: meta({ speechMs: 120 }) })))
    expect(res).toMatchObject({ status: 'empty', guards: ['no_speech'], words: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('„jen čísla": text se neuloží, Mac ho dostane', async () => {
    await db.exec(`UPDATE voice_settings SET value = 'false' WHERE key = 'store_text'`)
    const m = meta()
    expect(await body(await POST(request({ meta: m })))).toMatchObject({ status: 'ok', words: 9 })
    const row = (await db.query<Record<string, unknown>>(`SELECT raw_text, final_text, words FROM voice_dictations WHERE id = $1`, [m.id])).rows[0]
    expect(row).toEqual({ raw_text: null, final_text: null, words: 9 })
  })

  it('po selhání přepisu jde stejný diktát z fronty poslat znovu a přepíše se', async () => {
    process.env.OPENAI_API_KEY = 'sk_test'
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }))
    const m = meta()
    expect((await POST(request({ meta: m }))).status).toBe(502)
    fetchMock.mockImplementation(async () => groqOk())
    const again = await POST(request({ meta: m }))
    expect(again.status).toBe(200)
    expect(await body(again)).toMatchObject({ id: m.id, status: 'ok', words: 9 })
    const rows = await db.query<{ status: string }>(`SELECT status FROM voice_dictations WHERE id = $1`, [m.id])
    expect(rows.rows).toEqual([{ status: 'ok' }])
  })

  it('přepis selže u obou → 502 a diktát se stavem error', async () => {
    process.env.OPENAI_API_KEY = 'sk_test'
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }))
    const m = meta()
    const res = await POST(request({ meta: m }))
    expect(res.status).toBe(502)
    expect(await body(res)).toEqual({ ok: false, code: 'STT_FAILED' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const row = (await db.query<{ status: string; guards: string[] }>(`SELECT status, guards FROM voice_dictations WHERE id = $1`, [m.id])).rows[0]
    expect(row).toEqual({ status: 'error', guards: ['stt_failed'] })
  })

  it('bez klíče k přepisu → 503', async () => {
    delete process.env.GROQ_API_KEY
    const res = await POST(request())
    expect(res.status).toBe(503)
    expect(await body(res)).toEqual({ ok: false, code: 'NOT_CONFIGURED' })
  })

  it('bez klíče, se špatným a se zneplatněným klíčem → 401 bez rozdílu', async () => {
    expect((await POST(request({ auth: null }))).status).toBe(401)
    expect((await POST(request({ auth: 'zk_voice_AbCdEfGhIj_' + 'x'.repeat(32) }))).status).toBe(401)
    const other = await createDevice('Starý Mac', 'test')
    if (!other.ok) throw new Error('zařízení')
    await revokeDevice(other.device.id, 'test')
    const res = await POST(request({ auth: other.key }))
    expect(res.status).toBe(401)
    expect(await body(res)).toEqual({ ok: false, code: 'UNAUTHORIZED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('s hlavičkou Origin (prohlížeč) → 403', async () => {
    const res = await POST(request({ headers: { origin: 'https://example.com' } }))
    expect(res.status).toBe(403)
    expect(await body(res)).toEqual({ ok: false, code: 'ORIGIN_NOT_ALLOWED' })
  })

  it('velké tělo → 413', async () => {
    // Formulář jako hotové bajty: živý FormData by Node po přerušeném čtení dál
    // zapisoval do zavřeného proudu (jen artefakt testu, viz request-body.test.ts).
    const form = new FormData()
    form.append('meta', JSON.stringify(meta()))
    form.append('audio', m4a(4 * 1024 * 1024 + 70 * 1024), 'diktat.m4a')
    const serialized = new Response(form)
    const bytes = new Uint8Array(await serialized.arrayBuffer())
    const big = new NextRequest('http://localhost/api/public/voice/dictate', {
      method: 'POST',
      body: bytes,
      headers: { authorization: `Bearer ${key}`, 'content-type': serialized.headers.get('content-type') ?? '' },
    })
    const res = await POST(big)
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('špatný typ i podvržené bajty → 415', async () => {
    const fake = new Blob([new Uint8Array(2048)], { type: 'audio/mp4' })
    expect((await POST(request({ audio: fake }))).status).toBe(415)
    const text = new Blob(['ahoj'], { type: 'text/plain' })
    expect((await POST(request({ audio: text }))).status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('špatné meta → 400 (chybí pole, budoucnost, starší než 30 dní, neznámý klíč, není JSON)', async () => {
    for (const bad of [
      { ...meta(), id: 'neni-uuid' },
      meta({ startedAt: new Date(Date.now() + 3_600_000).toISOString() }),
      meta({ startedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() }),
      meta({ durationMs: 700_000 }),
      { ...meta(), navic: 1 },
      'tohle není JSON',
      null,
    ]) {
      const res = await POST(request({ meta: bad }))
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('nad limitem diktátů za hodinu → 429', async () => {
    await db.query(
      `INSERT INTO api_requests (endpoint, ip) SELECT $1, 'device' FROM generate_series(1, 400)`,
      [`voice_dictate:${deviceId}`],
    )
    const res = await POST(request())
    expect(res.status).toBe(429)
    expect(await body(res)).toEqual({ ok: false, code: 'RATE_LIMITED' })
  })

  it('bez tabulek ZakazIQ Voice → 503', async () => {
    setAdminDbForTests(pgliteAdminDriver(emptyDb))
    try {
      const res = await POST(request())
      expect(res.status).toBe(503)
      expect(await body(res)).toEqual({ ok: false, code: 'NOT_CONFIGURED' })
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
    }
  })

  it('text diktátu se nedostane do logu ani při chybě', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.OPENAI_API_KEY = 'sk_test'
    fetchMock.mockImplementationOnce(async () => new Response('{"error":"Dobrý den, posílám"}', { status: 400 }))
    await POST(request())
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/posílám|Prvotka|Dobrý den/)
  })
})

describe('GET /api/public/voice/config', () => {
  const get = (auth: string | null, origin?: string) =>
    CONFIG(
      new NextRequest('http://localhost/api/public/voice/config', {
        headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(origin ? { origin } : {}) },
      }),
    )

  it('vrátí zařízení, slovník, zkratky a styl', async () => {
    const res = await get(key)
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data).toMatchObject({
      ok: true,
      device: { name: 'MacBook' },
      cleanupEnabled: true,
      storeText: true,
      transcriptionReady: true,
      styles: { email: 'formal', ai_prompt: 'exact' },
    })
    expect(data.terms).toEqual([expect.objectContaining({ term: 'Prvotka', heardAs: ['prvotko'], source: 'manual' })])
    expect(data.snippets).toEqual([expect.objectContaining({ trigger: 'můj podpis', expansion: 'S pozdravem' })])
  })

  it('bez klíče 401, z prohlížeče 403', async () => {
    expect((await get(null)).status).toBe(401)
    expect((await get(key, 'https://example.com')).status).toBe(403)
  })
})
