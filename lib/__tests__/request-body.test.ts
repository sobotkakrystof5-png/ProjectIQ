import { describe, it, expect } from 'vitest'
import { readBodyLimited, readJsonLimited } from '@/lib/security/request-body'

// Veřejné routy nesmějí čtením těla vyčerpat pamět funkce. `content-length`
// na to nestačí — chunked požadavek ho neposílá. Audit 2026-11-14 doplnil
// `readJsonLimited` do veřejných API adminu, které dřív volala `req.json()`
// bez jakéhokoli stropu.

/** Požadavek bez `content-length` — tělo přijde po kouscích. */
function chunked(body: string): Request {
  const bytes = new TextEncoder().encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 1024) controller.enqueue(bytes.slice(i, i + 1024))
      controller.close()
    },
  })
  return new Request('https://example.test/api', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
}

describe('readBodyLimited', () => {
  it('pustí tělo do limitu', async () => {
    const r = await readBodyLimited(new Request('https://example.test/api', { method: 'POST', body: 'ahoj' }), 1024)
    expect(r.ok).toBe(true)
  })

  it('odmítne tělo přes limit podle content-length', async () => {
    const r = await readBodyLimited(new Request('https://example.test/api', { method: 'POST', body: 'x'.repeat(5000) }), 1024)
    expect(r.ok).toBe(false)
  })

  it('odmítne i tělo bez content-length (chunked)', async () => {
    const r = await readBodyLimited(chunked('x'.repeat(50_000)), 1024)
    expect(r.ok).toBe(false)
  })
})

describe('readJsonLimited', () => {
  it('vrátí rozparsovaný JSON do limitu', async () => {
    const r = await readJsonLimited(new Request('https://example.test/api', { method: 'POST', body: '{"a":1}' }), 1024)
    expect(r).toEqual({ ok: true, value: { a: 1 } })
  })

  it('hlásí too-large, ne invalid, když je tělo přes limit', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(50_000) })
    const r = await readJsonLimited(chunked(big), 1024)
    expect(r).toEqual({ ok: false, reason: 'too-large' })
  })

  it('hlásí invalid, když tělo není JSON', async () => {
    const r = await readJsonLimited(new Request('https://example.test/api', { method: 'POST', body: 'tohle není json' }), 1024)
    expect(r).toEqual({ ok: false, reason: 'invalid' })
  })
})
