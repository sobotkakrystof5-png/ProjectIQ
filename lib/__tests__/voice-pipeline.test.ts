import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runPipeline, type PipelineConfig } from '@/lib/admin/voice/pipeline'
import { transcribeVoice, type SttResult } from '@/lib/admin/voice/stt'

// ZakazIQ Voice (R-148, VO02): cesta diktátu s podvrženým přepisem a přepis
// s podvrženým fetch (ukázková odpověď Groq je soubor ve fixtures).

const GROQ_VERBOSE = fs.readFileSync(path.join(__dirname, 'fixtures/voice-groq-verbose.json'), 'utf8')

const CONFIG: PipelineConfig = {
  terms: [
    { id: 't1', term: 'Prvotka', heardAs: ['prvotko'] },
    { id: 't2', term: 'ZakazIQ', heardAs: ['zákaz IQ'] },
  ],
  snippets: [{ id: 's1', trigger: 'můj podpis', expansion: 'S pozdravem\nKryštof Sobotka' }],
  blocklist: [
    { text: 'Titulky vytvořil', mode: 'always' },
    { text: 'Děkuji za pozornost', mode: 'alone' },
  ],
}

const AUDIO = new Blob([new Uint8Array(32)], { type: 'audio/mp4' })

const sttOk = (text: string, extra: Partial<Extract<SttResult, { ok: true }>> = {}): SttResult => ({
  ok: true,
  provider: 'groq',
  model: 'whisper-large-v3-turbo',
  text,
  segments: null,
  durationSec: null,
  ms: 120,
  fallback: false,
  attempts: [],
  ...extra,
})

const input = (durationMs: number, speechMs: number | null = durationMs) => ({ audio: AUDIO, durationMs, speechMs })

describe('cesta diktátu', () => {
  it('G1: bez řeči je prázdný výsledek a přepis se nevolá', async () => {
    const transcribe = vi.fn()
    const out = await runPipeline(input(5000, 120), CONFIG, { transcribe })
    expect(out).toMatchObject({ status: 'empty', guards: ['no_speech'], finalText: '', words: 0, costUsd: 0 })
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('běžná věta projde, slovník opraví jméno a spočítá se cena', async () => {
    const transcribe = vi.fn(async (_audio: Blob, _prompt: string) => sttOk(' posílám nabídku pro prvotko a zákaz IQ'))
    const out = await runPipeline(input(4000), CONFIG, { transcribe })
    expect(out).toMatchObject({
      status: 'ok',
      finalText: 'Posílám nabídku pro Prvotka a ZakazIQ',
      words: 6,
      dictionaryFixes: 2,
      guards: [],
      sttProvider: 'groq',
    })
    expect(out.usedTermIds.sort()).toEqual(['t1', 't2'])
    expect(out.costUsd).toBeGreaterThan(0)
    // Nápověda ze slovníku jde do přepisu.
    expect(transcribe.mock.calls[0][1]).toContain('Prvotka')
  })

  it('G4: jen halucinace z titulků → blocked', async () => {
    const out = await runPipeline(input(3000), CONFIG, { transcribe: async () => sttOk('Titulky vytvořil JohnyX') })
    expect(out).toMatchObject({ status: 'blocked', guards: ['blocklist'], finalText: '', words: 0 })
    expect(out.rawText).toBe('Titulky vytvořil JohnyX')
  })

  it('G12: ozvěna nápovědy → blocked', async () => {
    const out = await runPipeline(input(5000), { ...CONFIG, terms: [...CONFIG.terms, { id: 't3', term: 'VIZEON', heardAs: [] }] }, {
      transcribe: async () => sttOk('Prvotka, ZakazIQ, VIZEON'),
    })
    expect(out).toMatchObject({ status: 'blocked', guards: ['prompt_echo'] })
  })

  it('G5: víc slov, než se dá vyslovit → blocked', async () => {
    const text = Array.from({ length: 40 }, (_, i) => `slovo${i}`).join(' ')
    const out = await runPipeline(input(2000), CONFIG, { transcribe: async () => sttOk(text) })
    expect(out).toMatchObject({ status: 'blocked', guards: ['too_fast'] })
  })

  it('prázdný přepis bez zásahu pojistky → empty', async () => {
    const out = await runPipeline(input(2000), CONFIG, { transcribe: async () => sttOk('  ') })
    expect(out).toMatchObject({ status: 'empty', guards: [] })
  })

  it('zkratka nahradí celý diktát', async () => {
    const out = await runPipeline(input(1500), CONFIG, { transcribe: async () => sttOk('Můj podpis.') })
    expect(out).toMatchObject({ status: 'snippet', snippetId: 's1', finalText: 'S pozdravem\nKryštof Sobotka', words: 4 })
  })

  it('záloha přepisu se pozná v pojistkách, selhání obou → error', async () => {
    const fallback = await runPipeline(input(3000), CONFIG, {
      transcribe: async () => sttOk('Dobrý den.', { provider: 'openai', model: 'gpt-4o-transcribe', fallback: true }),
    })
    expect(fallback).toMatchObject({ status: 'ok', guards: ['stt_fallback'], sttProvider: 'openai' })

    const failed = await runPipeline(input(3000), CONFIG, {
      transcribe: async () => ({ ok: false, notConfigured: false, ms: 900, attempts: [] }),
    })
    expect(failed).toMatchObject({ status: 'error', guards: ['stt_failed'], notConfigured: false, rawText: null })

    const missing = await runPipeline(input(3000), CONFIG, {
      transcribe: async () => ({ ok: false, notConfigured: true, ms: 0, attempts: [] }),
    })
    expect(missing).toMatchObject({ status: 'error', guards: ['stt_not_configured'], notConfigured: true })
  })
})

// --- Přepis (stt.ts) s podvrženým fetch ------------------------------------------

type Call = { url: string; form: Record<string, string>; auth: string | null }

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const form: Record<string, string> = {}
    for (const [k, v] of (init?.body as FormData).entries()) form[k] = typeof v === 'string' ? v : `[soubor ${v.type}]`
    calls.push({ url: String(url), form, auth: new Headers(init?.headers).get('authorization') })
    const next = responses.shift()
    if (!next) throw new Error('nečekané volání')
    if (next instanceof Error) throw next
    return next
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

const json = (body: string | object, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ENV_KEYS = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'VOICE_STT_PROVIDER', 'VOICE_GROQ_STT_MODEL', 'VOICE_OPENAI_STT_MODEL', 'OPENAI_TRANSCRIBE_MODEL']
const saved: Record<string, string | undefined> = {}

describe('přepis', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    process.env.GROQ_API_KEY = 'gsk_test'
    process.env.OPENAI_API_KEY = 'sk_test'
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.restoreAllMocks()
  })

  it('Groq: verbose_json, čeština, nápověda; segmenty a délka z odpovědi', async () => {
    const { impl, calls } = fakeFetch([json(GROQ_VERBOSE)])
    const r = await transcribeVoice(AUDIO, 'Diktát v češtině. Výrazy: Prvotka.', impl)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ provider: 'groq', model: 'whisper-large-v3-turbo', durationSec: 6.42, fallback: false })
    expect(r.segments).toHaveLength(2)
    expect(r.segments?.[1]).toMatchObject({ noSpeechProb: 0.83, avgLogprob: -1.35 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(calls[0].auth).toBe('Bearer gsk_test')
    expect(calls[0].form).toMatchObject({
      model: 'whisper-large-v3-turbo',
      language: 'cs',
      temperature: '0',
      response_format: 'verbose_json',
      prompt: 'Diktát v češtině. Výrazy: Prvotka.',
      file: '[soubor audio/mp4]',
    })
  })

  it('celá cesta s ukázkovou odpovědí Groq: G2 zahodí titulky, slovník opraví jméno', async () => {
    const { impl } = fakeFetch([json(GROQ_VERBOSE)])
    const out = await runPipeline(input(6500), CONFIG, { transcribe: (a, p) => transcribeVoice(a, p, impl) })
    expect(out).toMatchObject({
      status: 'ok',
      finalText: 'Dobrý den, posílám nabídku na nový web pro Prvotka.',
      guards: ['segments'],
      audioSeconds: 6.42,
    })
  })

  it('Groq selže → záloha OpenAI (json, model z env)', async () => {
    process.env.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'
    const { impl, calls } = fakeFetch([json({ error: 'busy' }, 503), json({ text: 'Dobrý den.' })])
    const r = await transcribeVoice(AUDIO, '', impl)
    expect(r).toMatchObject({ ok: true, provider: 'openai', model: 'gpt-4o-mini-transcribe', text: 'Dobrý den.', segments: null, fallback: true })
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.groq.com/openai/v1/audio/transcriptions',
      'https://api.openai.com/v1/audio/transcriptions',
    ])
    expect(calls[1].form.response_format).toBe('json')
    expect(calls[1].form.prompt).toBeUndefined()
  })

  it('obě selžou (chyba i síť) → ok false, ale nastavené', async () => {
    const { impl } = fakeFetch([json({}, 500), new TypeError('fetch failed')])
    const r = await transcribeVoice(AUDIO, '', impl)
    expect(r).toMatchObject({ ok: false, notConfigured: false })
    if (!r.ok) expect(r.attempts.map((a) => a.status)).toEqual([500, 0])
  })

  it('bez klíčů se nevolá nic a hlásí se nenastavené', async () => {
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
    const { impl, calls } = fakeFetch([])
    expect(await transcribeVoice(AUDIO, '', impl)).toMatchObject({ ok: false, notConfigured: true })
    expect(calls).toHaveLength(0)
  })

  it('bez klíče Groq jde rovnou OpenAI a není to záloha', async () => {
    delete process.env.GROQ_API_KEY
    const { impl, calls } = fakeFetch([json({ text: 'Ahoj.' })])
    expect(await transcribeVoice(AUDIO, '', impl)).toMatchObject({ ok: true, provider: 'openai', fallback: false })
    expect(calls).toHaveLength(1)
  })

  it('VOICE_STT_PROVIDER=openai otočí pořadí, VOICE_GROQ_STT_MODEL změní model', async () => {
    process.env.VOICE_STT_PROVIDER = 'openai'
    process.env.VOICE_GROQ_STT_MODEL = 'whisper-large-v3'
    const { impl, calls } = fakeFetch([json({}, 500), json(GROQ_VERBOSE)])
    const r = await transcribeVoice(AUDIO, '', impl)
    expect(r).toMatchObject({ ok: true, provider: 'groq', model: 'whisper-large-v3', fallback: true })
    expect(calls[0].url).toContain('openai.com')
  })

  it('chyba poskytovatele se loguje bez těla odpovědi', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { impl } = fakeFetch([json({ error: 'Dobrý den, tajný text' }, 400), json({ text: 'x' })])
    await transcribeVoice(AUDIO, '', impl)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('tajný')
  })
})
