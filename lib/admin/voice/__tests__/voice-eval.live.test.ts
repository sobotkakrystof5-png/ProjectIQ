import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { cleanupWithClaude } from '@/lib/admin/voice/cleanup'
import { runPipeline } from '@/lib/admin/voice/pipeline'
import type { SttResult } from '@/lib/admin/voice/stt'
import { GOLDEN_CONFIG, durationFor, loadGoldenCases, styleOf } from './golden-cases'

// ZakazIQ Voice (R-148, VO07): zlatá sada se SKUTEČNÝM modelem. Neběží v
// `npm test` — pouští ji jen `node scripts/voice-eval.mjs --ano` (VOICE_EVAL=1),
// protože volá Claude a stojí peníze. Přepisy jsou ze zlaté sady (vymyšlené
// věty), ne skutečné diktáty. Výsledek zapíše jako JSON do VOICE_EVAL_OUT.

export interface EvalRow {
  file: string
  nazev: string
  styl: string
  prepis: string
  ocekavano: string
  vysledek: string
  stav: string
  pojistky: string[]
  shoda: boolean
  ms: number | null
  costUsd: number
}

const AUDIO = new Blob([new Uint8Array(32)], { type: 'audio/mp4' })

describe.runIf(process.env.VOICE_EVAL === '1')('čištění se skutečným modelem', () => {
  it('projde zlatou sadu', { timeout: 600_000 }, async () => {
    // Jen případy, kde se model volá. Útoky s podvrženou odpovědí tu ověřují,
    // že skutečný model se pokynem z diktátu neřídí; očekává se opis (stav ok).
    const seen = new Set<string>()
    const cases = loadGoldenCases().filter((c) => {
      if (c.odpoved === null || c.chyba) return false
      const key = `${c.kategorie}|${c.prepis}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const rows: EvalRow[] = []
    for (const c of cases) {
      const stt: SttResult = {
        ok: true, provider: 'groq', model: 'whisper-large-v3-turbo', text: c.prepis, segments: null,
        durationSec: null, ms: 0, fallback: false, attempts: [],
      }
      const out = await runPipeline(
        { audio: AUDIO, durationMs: durationFor(c.prepis), speechMs: null, style: styleOf(c) },
        GOLDEN_CONFIG,
        { transcribe: async () => stt, cleanup: cleanupWithClaude },
      )
      // Očekávaný text: u legitimních případů z JSON, u útoků opis přepisu.
      const expected = c.stav === 'ok' ? c.text : null
      rows.push({
        file: c.file,
        nazev: c.nazev,
        styl: styleOf(c),
        prepis: c.prepis,
        ocekavano: expected ?? '(opis přepisu, bez odpovědi a bez nových vět)',
        vysledek: out.finalText,
        stav: out.status,
        pojistky: out.guards,
        shoda: expected !== null && out.finalText === expected,
        ms: out.llmMs,
        costUsd: out.costUsd,
      })
    }
    if (process.env.VOICE_EVAL_OUT) fs.writeFileSync(process.env.VOICE_EVAL_OUT, JSON.stringify(rows, null, 2))
    // Selže jen, když se nepovedlo zavolat model vůbec (klíč, síť).
    expect(rows.filter((r) => r.pojistky.includes('cleanup_not_configured'))).toEqual([])
    expect(rows.length).toBeGreaterThan(0)
  })
})
