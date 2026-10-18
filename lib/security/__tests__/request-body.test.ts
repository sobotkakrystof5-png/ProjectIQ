import { describe, expect, it } from 'vitest'
import { readBodyLimited } from '../request-body'

function requestWithChunks(chunks: string[]) {
  return new Request('https://example.test/webhook', {
    method: 'POST',
    duplex: 'half',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    }),
  } as RequestInit & { duplex: 'half' })
}

describe('readBodyLimited', () => {
  it('povolí tělo pod limitem bez content-length', async () => {
    const result = await readBodyLimited(requestWithChunks(['{"type":', '"test"}']), 32)
    expect(result.ok).toBe(true)
    if (result.ok) expect(new TextDecoder().decode(result.bytes)).toBe('{"type":"test"}')
  })

  it('odmítne chunked tělo, jakmile překročí limit', async () => {
    const result = await readBodyLimited(requestWithChunks(['1234', '5678']), 7)
    expect(result).toEqual({ ok: false })
  })

  it('odmítne obsah podle content-length ještě před čtením', async () => {
    const request = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: 'x',
    })
    const result = await readBodyLimited(request, 10)
    expect(result).toEqual({ ok: false })
  })
})
