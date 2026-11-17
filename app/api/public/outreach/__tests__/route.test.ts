import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ingest = vi.fn()

vi.mock('@/lib/admin/outreach', () => ({ ingestOutreachLeads: (...a: unknown[]) => ingest(...a) }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: vi.fn(async () => false),
  recordApiRequest: vi.fn(async () => {}),
}))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn(async () => {}) }))

import { POST } from '../route'
import { createNotification } from '@/lib/notifications'

const KEY = 'test-growth-key'

function request(body: unknown, auth: string | null = `Bearer ${KEY}`): NextRequest {
  return new NextRequest('https://www.zakaziq.cz/api/public/outreach', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = {
  version: 1,
  leads: [{ external_id: 'vizeon-outreach:1', updated_at: '2026-11-17T08:00:00Z', company: 'Firma', status: 'accepted' }],
}

beforeEach(() => {
  vi.stubEnv('GROWTH_OS_API_KEY', KEY)
  ingest.mockReset()
  vi.mocked(createNotification).mockClear()
})

describe('POST /api/public/outreach', () => {
  it('bez klíče nebo se špatným klíčem odmítne a nic neuloží', async () => {
    expect((await POST(request(valid, null))).status).toBe(401)
    expect((await POST(request(valid, 'Bearer jiny'))).status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('bez nastavené proměnné odmítne všechno', async () => {
    vi.stubEnv('GROWTH_OS_API_KEY', '')
    expect((await POST(request(valid))).status).toBe(401)
  })

  it('špatná data vrátí 400 s cestou k poli', async () => {
    const res = await POST(request({ version: 1, leads: [{ ...valid.leads[0], demo: { url: 'javascript:x' } }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('demo.url')
    expect((await POST(request('{nejson'))).status).toBe(400)
  })

  it('uloží dávku a události pošle do zvonku, nejvýš pět jednotlivě', async () => {
    ingest.mockResolvedValue({
      received: 1,
      saved: 1,
      events: Array.from({ length: 7 }, (_, i) => ({ kind: 'do-fronty', company: `Firma ${i}`, reason: 'Chce ukázku' })),
    })
    const res = await POST(request(valid))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, received: 1, saved: 1 })
    expect(createNotification).toHaveBeenCalledTimes(6)
  })

  it('bez migrace 114 vrátí 503, ať Growth OS zkusí znovu', async () => {
    ingest.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
    expect((await POST(request(valid))).status).toBe(503)
  })
})
