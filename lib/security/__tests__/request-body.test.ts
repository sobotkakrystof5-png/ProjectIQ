import { describe, expect, it } from 'vitest'
import { readBodyLimited, readFormDataLimited } from '../request-body'

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

describe('readFormDataLimited', () => {
  function multipart(audio: string) {
    const form = new FormData()
    form.append('audio', new Blob([audio], { type: 'audio/webm' }), 'a.webm')
    return new Request('https://example.test/transcribe', { method: 'POST', body: form })
  }

  it('rozebere formulář pod limitem', async () => {
    const result = await readFormDataLimited(multipart('nahravka'), 4096)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const file = result.form.get('audio')
      expect(file).toBeInstanceOf(Blob)
      expect(await (file as Blob).text()).toBe('nahravka')
    }
  })

  it('odmítne obří formulář, i když content-length chybí (chunked)', async () => {
    const chunked = new Request('https://example.test/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      duplex: 'half',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 10; i += 1) controller.enqueue(new Uint8Array(1024))
          controller.close()
        },
      }),
    } as RequestInit & { duplex: 'half' })
    expect(await readFormDataLimited(chunked, 2048)).toEqual({ ok: false, reason: 'too-large' })
  })

  it('odmítne obsah, který není formulář', async () => {
    const request = new Request('https://example.test/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: 'to neni multipart',
    })
    expect(await readFormDataLimited(request, 4096)).toEqual({ ok: false, reason: 'invalid' })
  })
})
