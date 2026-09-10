import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const insertedRows: { id: string; lead_id: string }[] = []

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async () => {
    const row = { id: 'db-row-1', lead_id: 'lead_test_001' }
    insertedRows.push(row)
    return [row]
  }),
}))

vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: vi.fn(async () => false),
  recordApiRequest: vi.fn(async () => {}),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
}))

import { POST } from '../route'
import { sql } from '@/lib/db'
import { createNotification } from '@/lib/notifications'

const API_KEY = 'test-shared-secret'

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    source: 'vizeon-lead-agent',
    version: 1,
    section: 'vizeon',
    lead_id: 'lead_test_001',
    received_at: '2026-09-10T09:00:00+00:00',
    client: {
      name: 'Testovací Jan',
      email: 'test@example.cz',
      phone: null,
      company: 'Test s.r.o.',
      service: 'eshop',
      budget: '150000-250000',
      deadline: null,
      message: 'Testovací poptávka.',
    },
    analysis: {
      lead_score: 88,
      priority: 'HIGH',
      score_breakdown: { budget: 25 },
      company_type: 'sme',
      industry: 'ecommerce',
      digital_maturity: 'high',
      project_complexity: 'medium',
      clarity_of_request: 'high',
      summary: 'Testovací shrnutí.',
      communication_strategy: {
        tone: 'věcný',
        style: 'stručný',
        focus: ['sklad'],
        avoid: ['fráze'],
      },
    },
    ...overrides,
  }
}

function makeRequest(body: unknown, authHeader = `Bearer ${API_KEY}`) {
  return new NextRequest('http://localhost/api/public/agent-leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/public/agent-leads', () => {
  beforeEach(() => {
    process.env.VIZEON_AGENT_API_KEY = API_KEY
    insertedRows.length = 0
    vi.mocked(sql).mockClear()
    vi.mocked(createNotification).mockClear()
  })

  it('accepts a valid request and stores the lead', async () => {
    const res = await POST(makeRequest(validPayload()))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.lead.lead_id).toBe('lead_test_001')
    expect(sql).toHaveBeenCalledTimes(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('rejects a wrong or missing API key with 401 and never touches the DB', async () => {
    const res = await POST(makeRequest(validPayload(), 'Bearer wrong-key'))
    expect(res.status).toBe(401)
    expect(sql).not.toHaveBeenCalled()

    const resNoHeader = await POST(makeRequest(validPayload(), ''))
    expect(resNoHeader.status).toBe(401)
  })

  it('rejects a payload missing a required field with 4xx and never touches the DB', async () => {
    const payload = validPayload()
    delete (payload.client as any).email

    const res = await POST(makeRequest(payload))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(sql).not.toHaveBeenCalled()
  })

  it('sends the same lead_id twice as an idempotent upsert, not a duplicate insert', async () => {
    const payload = validPayload()

    const first = await POST(makeRequest(payload))
    const second = await POST(makeRequest(payload))

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(sql).toHaveBeenCalledTimes(2)

    // Idempotence se garantuje unikátním indexem na lead_id v DB (ON CONFLICT
    // DO UPDATE) — tady ověřujeme, že se pokaždé posílá stejný upsert dotaz,
    // ne prostý INSERT, který by při druhém volání spadl na duplicitě.
    for (const call of vi.mocked(sql).mock.calls) {
      const queryText = (call[0] as TemplateStringsArray).join('?')
      expect(queryText).toContain('ON CONFLICT')
      expect(queryText).toContain('lead_id')
    }

    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(firstBody.lead.lead_id).toBe(secondBody.lead.lead_id)
  })
})
