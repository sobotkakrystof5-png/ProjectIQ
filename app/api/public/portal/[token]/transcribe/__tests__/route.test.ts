import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const TOKEN = '0b9f6a52-3c2e-4d52-9a07-5d3b1d8a1111'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async () => [{ id: 'project-1' }]),
}))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: vi.fn(async () => false),
  recordApiRequest: vi.fn(async () => {}),
}))
vi.mock('@/lib/transcribe', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/transcribe')>()
  return {
    ...actual,
    isTranscriptionConfigured: vi.fn(() => true),
    transcribeAudio: vi.fn(async () => ({ text: 'Změňte telefon.' })),
  }
})

import { POST } from '../route'
import { sql } from '@/lib/db'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { isTranscriptionConfigured, transcribeAudio } from '@/lib/transcribe'

function request(audio?: Blob, headers: Record<string, string> = {}) {
  const form = new FormData()
  if (audio) form.append('audio', audio, 'nahravka')
  return new NextRequest(`http://localhost/api/public/portal/${TOKEN}/transcribe`, {
    method: 'POST',
    body: form,
    headers,
  })
}

const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) })
const webm = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })

beforeEach(() => {
  vi.mocked(sql).mockClear()
  vi.mocked(sql).mockImplementation((async () => [{ id: 'project-1' }]) as never)
  vi.mocked(isApiRateLimited).mockResolvedValue(false)
  vi.mocked(isTranscriptionConfigured).mockReturnValue(true)
  vi.mocked(transcribeAudio).mockClear()
  vi.mocked(recordApiRequest).mockClear()
})

describe('POST /api/public/portal/[token]/transcribe', () => {
  it('přepíše platnou nahrávku a vrátí jen text', async () => {
    const res = await POST(request(webm()), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, text: 'Změňte telefon.' })
    expect(recordApiRequest).toHaveBeenCalledTimes(2)
  })

  it('bez nastaveného klíče vrátí 503 a nevolá poskytovatele', async () => {
    vi.mocked(isTranscriptionConfigured).mockReturnValue(false)
    const res = await POST(request(webm()), ctx())
    expect(res.status).toBe(503)
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('token, který není UUID, skončí 404 bez dotazu do DB', async () => {
    const res = await POST(request(webm()), ctx('neni-uuid'))
    expect(res.status).toBe(404)
    expect(sql).not.toHaveBeenCalled()
  })

  it('neznámý projekt skončí 404 a nic nepřepisuje', async () => {
    vi.mocked(sql).mockImplementation((async () => []) as never)
    const res = await POST(request(webm()), ctx())
    expect(res.status).toBe(404)
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('při překročení limitu vrátí 429 a nepřepisuje', async () => {
    vi.mocked(isApiRateLimited).mockResolvedValue(true)
    const res = await POST(request(webm()), ctx())
    expect(res.status).toBe(429)
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('odmítne jiný typ souboru než audio', async () => {
    const res = await POST(request(new Blob(['x'], { type: 'application/pdf' })), ctx())
    expect(res.status).toBe(415)
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('odmítne chybějící nahrávku', async () => {
    const res = await POST(request(), ctx())
    expect(res.status).toBe(400)
  })

  it('odmítne příliš velké tělo už podle hlavičky', async () => {
    const res = await POST(request(webm(), { 'content-length': String(10 * 1024 * 1024) }), ctx())
    expect(res.status).toBe(413)
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('chybu přepisu vrátí jako 502 bez detailů', async () => {
    vi.mocked(transcribeAudio).mockResolvedValueOnce({ error: 'Nahrávku se nepodařilo přepsat.' })
    const res = await POST(request(webm()), ctx())
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('TRANSCRIBE_FAILED')
  })
})
