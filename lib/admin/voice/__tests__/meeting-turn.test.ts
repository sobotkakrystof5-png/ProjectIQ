import { describe, expect, it, vi } from 'vitest'
import { processMeetingTurn } from '../meeting-turn'
import type { SttResult } from '../stt'

// ZakazIQ Voice — schůzky (R-151): pojistky a slovník u jedné promluvy, bez sítě.

const audio = new Blob([new Uint8Array(16)], { type: 'audio/mp4' })
const ok = (text: string): SttResult => ({
  ok: true, provider: 'openai', model: 'gpt-4o-transcribe', text, segments: null, durationSec: 6, ms: 900, fallback: false, attempts: [],
})
const config = { terms: [{ id: 't1', term: 'Prvotka', heardAs: ['prvotko'] }], blocklist: [{ text: 'Titulky vytvořil JohnyX', mode: 'always' as const }] }

describe('promluva ze schůzky', () => {
  it('opraví slovo ze slovníku, vyhodí výplňová slova, nečeše modelem', async () => {
    const out = await processMeetingTurn({ audio, durationMs: 6_000, speechMs: 5_000 }, config, async () => ok('ehm tak u prvotko bychom začali'))
    expect(out.status).toBe('ok')
    expect(out.text).toBe('Tak u Prvotka bychom začali')
    expect(out.costUsd).toBeGreaterThan(0)
  })

  it('bez řeči nevolá přepis', async () => {
    const transcribe = vi.fn(async () => ok('nic'))
    const out = await processMeetingTurn({ audio, durationMs: 2_000, speechMs: 100 }, config, transcribe)
    expect(transcribe).not.toHaveBeenCalled()
    expect(out.status).toBe('empty')
  })

  it('vymyšlenou frázi z ticha zablokuje', async () => {
    const out = await processMeetingTurn({ audio, durationMs: 3_000, speechMs: 600 }, config, async () => ok('Titulky vytvořil JohnyX'))
    expect(out.status).toBe('blocked')
    expect(out.text).toBe('')
  })

  it('selhání přepisu = error, bez klíče s příznakem', async () => {
    const out = await processMeetingTurn({ audio, durationMs: 3_000, speechMs: 2_000 }, config, async () => ({ ok: false, notConfigured: true, ms: 0, attempts: [] }))
    expect(out.status).toBe('error')
    expect(out.notConfigured).toBe(true)
  })
})
