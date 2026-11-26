import { describe, expect, it, vi } from 'vitest'
import { cleanupResultFromResponse, type CleanupCaller } from '@/lib/admin/voice/cleanup'
import { runPipeline } from '@/lib/admin/voice/pipeline'
import type { SttResult } from '@/lib/admin/voice/stt'
import { GOLDEN_CONFIG, durationFor, loadGoldenCases, styleOf, type GoldenCase } from './golden-cases'

// ZakazIQ Voice (R-148, VO07): zlatá sada čištění přes celou cestu diktátu.
// Přepis i odpověď modelu jsou podvržené, takže test ověřuje pojistky a
// pipeline, ne kvalitu modelu (tu měří scripts/voice-eval.mjs).

const CASES = loadGoldenCases()
const AUDIO = new Blob([new Uint8Array(32)], { type: 'audio/mp4' })

const stt = (text: string): SttResult => ({
  ok: true,
  provider: 'groq',
  model: 'whisper-large-v3-turbo',
  text,
  segments: null,
  durationSec: null,
  ms: 100,
  fallback: false,
  attempts: [],
})

function fakeCleanup(c: GoldenCase): CleanupCaller {
  const meta = { model: 'test-model', ms: 10, tokensIn: 400, tokensOut: 40 }
  return vi.fn(async () => {
    if (c.chyba) return { ...meta, ok: false as const, reason: c.chyba }
    if (c.odpoved == null) throw new Error(`${c.nazev}: model se neměl volat`)
    return cleanupResultFromResponse(c.odpoved, 'end_turn', meta)
  })
}

describe('zlatá sada čištění', () => {
  it('má aspoň 40 případů včetně útoků a každý stav', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40)
    expect(CASES.filter((c) => c.file === 'utoky.json').length).toBeGreaterThanOrEqual(10)
    for (const code of ['cleanup_assistant', 'cleanup_length', 'cleanup_novel', 'cleanup_negation', 'cleanup_numbers', 'cleanup_format', 'cleanup_timeout']) {
      expect(CASES.some((c) => c.pojistka === code), code).toBe(true)
    }
  })

  it.each(CASES.map((c) => [`${c.file}: ${c.nazev}`, c] as const))('%s', async (_name, c) => {
    const cleanup = fakeCleanup(c)
    const out = await runPipeline(
      { audio: AUDIO, durationMs: durationFor(c.prepis), speechMs: null, style: styleOf(c) },
      GOLDEN_CONFIG,
      { transcribe: async () => stt(c.prepis), cleanup },
    )
    expect(out.status).toBe(c.stav)
    expect(out.finalText).toBe(c.text)
    if (c.pojistka) expect(out.guards).toContain(c.pojistka)
    if (c.stav === 'ok') expect(out.guards.filter((g) => g.startsWith('cleanup_'))).toEqual([])
    if (c.odpoved === null) expect(cleanup).not.toHaveBeenCalled()
    else expect(cleanup).toHaveBeenCalledTimes(1)
    // Volání modelu se vždy započítá do ceny, i když výstup neprošel.
    if (c.odpoved != null || c.chyba) {
      expect(out.llmModel).toBe('test-model')
      expect(out.costUsd).toBeGreaterThan(0)
    }
  })
})
