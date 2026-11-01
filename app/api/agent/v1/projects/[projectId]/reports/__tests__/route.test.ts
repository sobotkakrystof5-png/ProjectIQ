import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const sqlMock = vi.fn()
const limitedMock = vi.fn()
const recordMock = vi.fn()
const notifyMock = vi.fn()
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sqlMock(...a) }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: (...a: unknown[]) => limitedMock(...a),
  recordApiRequest: (...a: unknown[]) => recordMock(...a),
}))
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => notifyMock(...a) }))

import { generateAgentKey } from '@/lib/agent-keys'
import { POST } from '../route'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

function call(opts: { projectId?: string; key?: string | null; body?: unknown; raw?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' }
  if (opts.key) headers.authorization = `Bearer ${opts.key}`
  const req = new NextRequest('http://localhost/api/agent/v1/projects/x/reports', {
    method: 'POST',
    headers,
    body: opts.raw ?? JSON.stringify(opts.body ?? { title: 'Nový kontakt', body: 'Přidali jsme stránku.' }),
  })
  return POST(req, { params: Promise.resolve({ projectId: opts.projectId ?? PROJECT }) })
}

/** DB: klíč patří projektu `owner`; INSERT vrací id; ostatní dotazy vrací jméno klienta. */
function db(owner: string, key: ReturnType<typeof generateAgentKey>, revoked = false) {
  const inserts: unknown[][] = []
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    if (text.includes('FROM project_agent_keys')) {
      return [{ id: 'key1', project_id: owner, key_hash: key.hash, revoked_at: revoked ? new Date() : null }]
    }
    if (text.includes('INSERT INTO project_activity')) {
      inserts.push(values)
      return [{ id: 'act1' }]
    }
    if (text.includes('FROM projects')) return [{ client_name: 'Novák', business: 'vizeon' }]
    return []
  })
  return inserts
}

beforeEach(() => {
  sqlMock.mockReset()
  limitedMock.mockReset().mockResolvedValue(false)
  recordMock.mockReset().mockResolvedValue(undefined)
  notifyMock.mockReset().mockResolvedValue(undefined)
  process.env.AGENT_KEY_PEPPER = 'p'.repeat(40)
})

describe('POST /api/agent/v1/projects/{id}/reports', () => {
  it('uloží koncept, nic nepublikuje a odpověď neobsahuje klíč', async () => {
    const key = generateAgentKey()
    const inserts = db(PROJECT, key)
    const res = await call({ key: key.key })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toEqual({ ok: true, id: 'act1' })
    expect(JSON.stringify(json)).not.toContain(key.key)
    const sqlText = (sqlMock.mock.calls.find((c) => (c[0] as TemplateStringsArray).join('?').includes('INSERT INTO project_activity'))![0] as TemplateStringsArray).join('?')
    expect(sqlText).toContain("'draft'")
    expect(sqlText).toContain("'claude_code'")
    expect(sqlText).not.toContain("'published'")
    expect(inserts).toHaveLength(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(notifyMock.mock.calls)).not.toContain(key.key)
  })

  it('klíč jiného projektu nic nezapíše', async () => {
    const key = generateAgentKey()
    const inserts = db(OTHER, key)
    const res = await call({ key: key.key })
    expect(res.status).toBe(401)
    expect(inserts).toHaveLength(0)
  })

  it('zneplatněný klíč nic nezapíše', async () => {
    const key = generateAgentKey()
    const inserts = db(PROJECT, key, true)
    expect((await call({ key: key.key })).status).toBe(401)
    expect(inserts).toHaveLength(0)
  })

  it('bez klíče nebo s cizím id projektu je odpověď stejná jako u špatného klíče', async () => {
    const key = generateAgentKey()
    db(PROJECT, key)
    const noKey = await call({ key: null })
    const badId = await call({ key: key.key, projectId: 'není-uuid' })
    expect(noKey.status).toBe(401)
    expect(badId.status).toBe(401)
    expect(await noKey.json()).toEqual(await badId.json())
  })

  it('omezuje počet volání a počítá i neúspěšná', async () => {
    const key = generateAgentKey()
    db(PROJECT, key)
    limitedMock.mockResolvedValue(true)
    expect((await call({ key: key.key })).status).toBe(429)
    limitedMock.mockResolvedValue(false)
    await call({ key: null })
    expect(recordMock).toHaveBeenCalled()
  })

  it('omezuje i počet hlášení na klíč', async () => {
    const key = generateAgentKey()
    const inserts = db(PROJECT, key)
    limitedMock.mockImplementation(async (endpoint: string) => String(endpoint).startsWith('agent_report_key:'))
    expect((await call({ key: key.key })).status).toBe(429)
    expect(inserts).toHaveLength(0)
  })

  it('hlídá délky a tvar', async () => {
    const key = generateAgentKey()
    db(PROJECT, key)
    expect((await call({ key: key.key, body: { title: 'a'.repeat(161), body: 'x' } })).status).toBe(400)
    expect((await call({ key: key.key, body: { title: 'a', body: 'b'.repeat(4001) } })).status).toBe(400)
    expect((await call({ key: key.key, body: { title: 'a', body: 'b', kind: 'jine' } })).status).toBe(400)
    expect((await call({ key: key.key, raw: 'není json' })).status).toBe(400)
  })

  it('zakryje citlivý řetězec a uloží příznak', async () => {
    const key = generateAgentKey()
    const inserts = db(PROJECT, key)
    const res = await call({ key: key.key, body: { title: 'Hotovo', body: 'Klíč sk-abcdefghijklmnopqrstu jsme nastavili.' } })
    expect(res.status).toBe(201)
    const values = inserts[0]
    expect(values.join(' ')).not.toContain('sk-abcdefghijklmnopqrstu')
    expect(values).toContain(true)
  })

  it('bez pepře odpoví 503 a nic nezapíše', async () => {
    delete process.env.AGENT_KEY_PEPPER
    expect((await call({ key: 'x' })).status).toBe(503)
    expect(sqlMock).not.toHaveBeenCalled()
  })
})
