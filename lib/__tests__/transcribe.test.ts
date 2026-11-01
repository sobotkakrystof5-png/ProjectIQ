import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  baseAudioType,
  isAllowedAudioType,
  isTranscriptionConfigured,
  transcribeAudio,
} from '@/lib/transcribe'

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm;codecs=opus' })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('typy nahrávek', () => {
  it('odřízne parametry kodeku', () => {
    expect(baseAudioType('Audio/WebM;codecs=opus')).toBe('audio/webm')
  })

  it('povolí běžné formáty a odmítne ostatní', () => {
    expect(isAllowedAudioType('audio/webm;codecs=opus')).toBe(true)
    expect(isAllowedAudioType('audio/mp4')).toBe(true)
    expect(isAllowedAudioType('application/pdf')).toBe(false)
    expect(isAllowedAudioType('')).toBe(false)
  })
})

describe('transcribeAudio', () => {
  it('bez klíče nevolá síť a vrátí českou chybu', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const fetchMock = vi.fn()
    expect(isTranscriptionConfigured()).toBe(false)
    const r = await transcribeAudio(audio, fetchMock as unknown as typeof fetch)
    expect('error' in r).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pošle model z env, jazyk cs a vrátí oříznutý text', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    vi.stubEnv('OPENAI_TRANSCRIBE_MODEL', 'model-z-env')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '  Změňte telefon.  ' }), { status: 200 }))
    const r = await transcribeAudio(audio, fetchMock as unknown as typeof fetch)
    expect(r).toEqual({ text: 'Změňte telefon.' })

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const form = call[1].body as FormData
    expect(form.get('model')).toBe('model-z-env')
    expect(form.get('language')).toBe('cs')
    expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('chybu poskytovatele nepředá uživateli ani do výsledku', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response('{"error":"secret detail sk-test"}', { status: 500 }))
    const r = await transcribeAudio(audio, fetchMock as unknown as typeof fetch)
    expect('error' in r && r.error).not.toContain('secret')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('sk-test')
    spy.mockRestore()
  })

  it('prázdný přepis je chyba, ne prázdný text', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 }))
    const r = await transcribeAudio(audio, fetchMock as unknown as typeof fetch)
    expect('error' in r).toBe(true)
  })

  it('výjimka sítě skončí chybou, ne pádem', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => {
      throw new Error('boom')
    })
    const r = await transcribeAudio(audio, fetchMock as unknown as typeof fetch)
    expect('error' in r).toBe(true)
    spy.mockRestore()
  })
})
