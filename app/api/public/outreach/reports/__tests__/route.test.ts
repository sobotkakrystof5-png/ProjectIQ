import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ingest = vi.fn()

vi.mock('@/lib/admin/outreach-reports', () => ({ ingestOutreachReport: (...a: unknown[]) => ingest(...a) }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: vi.fn(async () => false),
  recordApiRequest: vi.fn(async () => {}),
}))

import { POST } from '../route'

const KEY = 'test-growth-key'

function request(body: unknown, auth: string | null = `Bearer ${KEY}`): NextRequest {
  return new NextRequest('https://www.zakaziq.cz/api/public/outreach/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = {
  version: 1,
  report: {
    date: '2026-11-17',
    round: null,
    generated_at: '2026-11-17T17:00:00Z',
    subject: 'Hovory 17. 11.',
    stats: { calls: 1, connected: 1, accepted: 1 },
  },
  calls: [
    {
      external_id: 'vizeon-call:1',
      lead_external_id: 'vizeon-outreach:1',
      company: 'Firma',
      result: 'SOUHLAS',
      transcript: [{ role: 'user', t: 1, text: 'Dobrý den' }],
    },
  ],
}

beforeEach(() => {
  vi.stubEnv('GROWTH_OS_API_KEY', KEY)
  ingest.mockReset()
})

describe('POST /api/public/outreach/reports', () => {
  it('bez klíče nebo se špatným klíčem odmítne a nic neuloží', async () => {
    expect((await POST(request(valid, null))).status).toBe(401)
    expect((await POST(request(valid, 'Bearer jiny'))).status).toBe(401)
    vi.stubEnv('GROWTH_OS_API_KEY', '')
    expect((await POST(request(valid))).status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('špatná data vrátí 400 s cestou k poli', async () => {
    const res = await POST(request({ ...valid, report: { ...valid.report, date: '17. 11.' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('report.date')
    const role = await POST(request({ ...valid, calls: [{ ...valid.calls[0], transcript: [{ role: 'system', text: 'x' }] }] }))
    expect(role.status).toBe(400)
    expect((await POST(request('{nejson'))).status).toBe(400)
  })

  it('uloží report a vrátí počet hovorů', async () => {
    ingest.mockResolvedValue({ calls: 1 })
    const res = await POST(request(valid))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, saved: 1 })
    expect(ingest.mock.calls[0][0].report.date).toBe('2026-11-17')
  })

  it('bez migrace 116 vrátí 503, ať Growth OS zkusí znovu', async () => {
    ingest.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
    expect((await POST(request(valid))).status).toBe(503)
  })
})
