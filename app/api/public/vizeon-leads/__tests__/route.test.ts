import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Kontaktní formulář vizeon.cz → nepotvrzená poptávka v adminu (R-136).

const afterCallbacks: (() => unknown)[] = []

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb)
  },
}))

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async () => [{ id: 'project-1' }]),
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
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { createNotification } from '@/lib/notifications'

const SECRET = 'vizeon-test-secret-0123456789abcdef'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    section: 'vizeon',
    source: 'web_contact_form',
    name: 'Testovací Jana',
    email: 'jana@example.cz',
    phone: '+420777123456',
    message: 'Zájem: Nový web\n\nChtěla bych nový web.',
    ...overrides,
  }
}

function request(body: unknown, headers: Record<string, string> = { 'x-vizeon-lead-signature': SECRET }) {
  return new NextRequest('http://localhost/api/public/vizeon-leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Hodnoty předané do tagged-template `sql` (bez SQL textu). */
const insertedValues = () => vi.mocked(sql).mock.calls[0].slice(1)

describe('POST /api/public/vizeon-leads', () => {
  beforeEach(() => {
    process.env.VIZEON_LEAD_WEBHOOK_SECRET = SECRET
    process.env.ALTENO_LEAD_WEBHOOK_SECRET = 'alteno-test-secret-0123456789abcdef'
    afterCallbacks.length = 0
    vi.mocked(sql).mockClear()
    vi.mocked(createNotification).mockClear()
    vi.mocked(isApiRateLimited).mockResolvedValue(false)
  })

  it('uloží poptávku jako nepotvrzenou zakázku z vizeon.cz', async () => {
    const res = await POST(request(payload()))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, id: 'project-1' })

    expect(sql).toHaveBeenCalledTimes(1)
    expect(insertedValues()).toEqual([
      'Testovací Jana',
      'jana@example.cz',
      '+420777123456',
      'Webový projekt',
      'Zájem: Nový web\n\nChtěla bych nový web.',
      'vizeon_web',
      'vizeon',
    ])
    expect(recordApiRequest).toHaveBeenCalledWith('vizeon_lead', expect.any(String))
  })

  it('oznámení do zvonku jde až po odpovědi', async () => {
    await POST(request(payload()))
    expect(createNotification).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'web_lead', title: 'Nová poptávka z vizeon.cz — Testovací Jana' }),
    )
  })

  it('bez podpisu nic neuloží', async () => {
    const res = await POST(request(payload(), {}))
    expect(res.status).toBe(401)
    expect(sql).not.toHaveBeenCalled()
  })

  it('klíč jiného webu neprojde', async () => {
    const res = await POST(request(payload(), { 'x-vizeon-lead-signature': process.env.ALTENO_LEAD_WEBHOOK_SECRET! }))
    expect(res.status).toBe(401)
    expect(sql).not.toHaveBeenCalled()
  })

  it('podpis v hlavičce jiného zdroje neprojde', async () => {
    const res = await POST(request(payload(), { 'x-alteno-lead-signature': SECRET }))
    expect(res.status).toBe(401)
    expect(sql).not.toHaveBeenCalled()
  })

  it('bez nastaveného klíče odmítne všechno', async () => {
    delete process.env.VIZEON_LEAD_WEBHOOK_SECRET
    const res = await POST(request(payload()))
    expect(res.status).toBe(401)
    expect(sql).not.toHaveBeenCalled()
  })

  it('poptávku označenou jako z jiného webu odmítne', async () => {
    const res = await POST(request(payload({ section: 'alteno' })))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(sql).not.toHaveBeenCalled()
  })

  it('neplatný e-mail vrátí VALIDATION_ERROR', async () => {
    const res = await POST(request(payload({ email: 'neni-email' })))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('rozbitý JSON vrátí INVALID_BODY', async () => {
    const res = await POST(request('{"name":'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_BODY')
  })

  it('při překročení limitu vrátí 429 a klíč neověřuje', async () => {
    vi.mocked(isApiRateLimited).mockResolvedValue(true)
    const res = await POST(request(payload()))
    expect(res.status).toBe(429)
    expect(isApiRateLimited).toHaveBeenCalledWith('vizeon_lead', expect.any(String), 1, 10)
    expect(sql).not.toHaveBeenCalled()
  })
})
