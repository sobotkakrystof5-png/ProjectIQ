import fs from 'fs'
import path from 'path'
import { DEFAULT_STYLES, VOICE_CATEGORIES, type VoiceCategory } from '@/lib/admin/voice/categories'
import type { CleanupFailReason } from '@/lib/admin/voice/cleanup'
import type { PipelineConfig } from '@/lib/admin/voice/pipeline'

// ZakazIQ Voice (VO07): zlatá sada čištění. Případ = přepis, kategorie
// aplikace, podvržená odpověď modelu (nebo selhání) a co se má vložit.
// Sdílí ji `voice-golden.test.ts` (podvržený model, v `npm test`) a
// `voice-eval.live.test.ts` (skutečný model, jen přes scripts/voice-eval.mjs).

export interface GoldenCase {
  file: string
  nazev: string
  prepis: string
  kategorie: VoiceCategory
  /** Odpověď modelu tak, jak by přišla z API; null = model se nemá volat. */
  odpoved?: string | null
  /** Místo odpovědi selhání volání. */
  chyba?: CleanupFailReason
  stav: 'ok' | 'raw' | 'empty'
  /** Kód pojistky, který má být v `guards`. */
  pojistka?: string
  text: string
}

const DIR = path.join(__dirname, 'golden')

export function loadGoldenCases(): GoldenCase[] {
  const out: GoldenCase[] = []
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const rows = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) as Omit<GoldenCase, 'file'>[]
    for (const row of rows) {
      if (!(VOICE_CATEGORIES as readonly string[]).includes(row.kategorie)) throw new Error(`${file}: neznámá kategorie ${row.kategorie}`)
      out.push({ ...row, file })
    }
  }
  return out
}

export const styleOf = (c: GoldenCase) => DEFAULT_STYLES[c.kategorie]

/** Slovník, se kterým zlatá sada počítá. */
export const GOLDEN_CONFIG: PipelineConfig = {
  terms: [
    { id: 't-prvotka', term: 'Prvotka', heardAs: ['prvotko'] },
    { id: 't-zakaziq', term: 'ZakazIQ', heardAs: ['zákaz IQ'] },
    { id: 't-vizeon', term: 'VIZEON', heardAs: [] },
  ],
  snippets: [],
  blocklist: [
    { text: 'Titulky vytvořil', mode: 'always' },
    { text: 'Děkuji za pozornost', mode: 'alone' },
  ],
  cleanup: { enabled: true, dailyCapUsd: 1, spentTodayUsd: 0, rules: [], examples: [] },
}

/** Délka nahrávky, se kterou přepis neodporuje rychlosti řeči (G5). */
export const durationFor = (text: string) => Math.max(2000, text.split(/\s+/).length * 500)
