import 'server-only'
import { adminDb, q } from '@/lib/admin/db'
import { DEFAULT_STYLES, STYLE_KEYS, VOICE_CATEGORIES, type VoiceCategory, type VoiceStyle } from './categories'
import type { VoiceSnippet, VoiceTerm } from './dictionary'
import type { BlockPhrase } from './guards'
import type { PipelineConfig, PipelineOutcome } from './pipeline'

/**
 * ZakazIQ Voice (R-148): databáze diktátů, slovníku a nastavení (migrace 136).
 * Čtení jde v dávkách přes `adminDb` (R-092). Text diktátu se nikdy nelogguje.
 */

// --- Nastavení ---------------------------------------------------------------

export interface VoiceSettings {
  styles: Record<VoiceCategory, VoiceStyle>
  typingWpm: number
  /** null = text natrvalo, dokud ho Kryštof nesmaže (D-V7). */
  textRetentionDays: number | null
  cleanupEnabled: boolean
  autoLearnTerms: boolean
  /** false = „jen čísla": text diktátu se na serveru neukládá. */
  storeText: boolean
  dailyCostCapUsd: number
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  styles: DEFAULT_STYLES,
  typingWpm: 40,
  textRetentionDays: null,
  cleanupEnabled: true,
  autoLearnTerms: true,
  storeText: true,
  dailyCostCapUsd: 1,
}

const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const bool = (map: Map<string, unknown>, key: string, fallback: boolean): boolean => {
  const v = map.get(key)
  return typeof v === 'boolean' ? v : fallback
}

/** Řádky `voice_settings` → nastavení. Neznámé nebo poškozené hodnoty = výchozí. */
export function parseSettings(rows: { key: string; value: unknown }[]): VoiceSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const styles = { ...DEFAULT_STYLES }
  const stylesRaw = map.get('styles')
  if (stylesRaw && typeof stylesRaw === 'object') {
    for (const cat of VOICE_CATEGORIES) {
      const v = (stylesRaw as Record<string, unknown>)[cat]
      if (typeof v === 'string' && (STYLE_KEYS as readonly string[]).includes(v)) styles[cat] = v as VoiceStyle
    }
  }
  const retention = map.get('text_retention_days')
  return {
    styles,
    typingWpm: Math.round(clampNum(map.get('typing_wpm'), 10, 200, DEFAULT_SETTINGS.typingWpm)),
    textRetentionDays: typeof retention === 'number' && retention >= 1 ? Math.min(3650, Math.round(retention)) : null,
    cleanupEnabled: bool(map, 'cleanup_enabled', DEFAULT_SETTINGS.cleanupEnabled),
    autoLearnTerms: bool(map, 'auto_learn_terms', DEFAULT_SETTINGS.autoLearnTerms),
    storeText: bool(map, 'store_text', DEFAULT_SETTINGS.storeText),
    dailyCostCapUsd: clampNum(map.get('daily_cost_cap_usd'), 0, 100, DEFAULT_SETTINGS.dailyCostCapUsd),
  }
}

const SETTINGS_SQL = q`SELECT key, value FROM voice_settings`
const TERMS_SQL = q`SELECT id::text, kind, term, heard_as, expansion, source, uses
                     FROM voice_terms ORDER BY uses DESC, created_at ASC LIMIT 400`
const BLOCKLIST_SQL = q`SELECT text, mode FROM voice_rules WHERE kind = 'blocklist' AND active ORDER BY created_at ASC LIMIT 200`

type TermRow = {
  id: string
  kind: 'term' | 'snippet'
  term: string
  heard_as: string[] | null
  expansion: string | null
  source: 'manual' | 'learned'
  uses: number
}

function splitTerms(rows: TermRow[]): { terms: VoiceTerm[]; snippets: VoiceSnippet[] } {
  return {
    terms: rows.filter((t) => t.kind === 'term').map((t) => ({ id: t.id, term: t.term, heardAs: t.heard_as ?? [] })),
    snippets: rows
      .filter((t) => t.kind === 'snippet' && t.expansion)
      .map((t) => ({ id: t.id, trigger: t.term, expansion: t.expansion as string })),
  }
}

// --- Kontext pro jeden diktát -------------------------------------------------

/** Všechno, co potřebuje cesta diktátu, jedním požadavkem. */
export async function loadPipelineContext(): Promise<{ config: PipelineConfig; settings: VoiceSettings }> {
  const [settingsRows, termRows, ruleRows] = await adminDb.batch([SETTINGS_SQL, TERMS_SQL, BLOCKLIST_SQL])
  const { terms, snippets } = splitTerms(termRows as TermRow[])
  return {
    settings: parseSettings(settingsRows as { key: string; value: unknown }[]),
    config: {
      terms,
      snippets,
      blocklist: (ruleRows as { text: string; mode: 'always' | 'alone' }[]).map((r): BlockPhrase => ({ text: r.text, mode: r.mode })),
    },
  }
}

/** Pro `/config`: slovník, zkratky a nastavení jedním požadavkem. */
export async function loadMacConfig(): Promise<{
  terms: (VoiceTerm & { source: string; uses: number })[]
  snippets: (VoiceSnippet & { uses: number })[]
  settings: VoiceSettings
}> {
  const [settingsRows, termRows] = await adminDb.batch([SETTINGS_SQL, TERMS_SQL])
  const rows = termRows as TermRow[]
  return {
    settings: parseSettings(settingsRows as { key: string; value: unknown }[]),
    terms: rows
      .filter((t) => t.kind === 'term')
      .map((t) => ({ id: t.id, term: t.term, heardAs: t.heard_as ?? [], source: t.source, uses: Number(t.uses) })),
    snippets: rows
      .filter((t) => t.kind === 'snippet' && t.expansion)
      .map((t) => ({ id: t.id, trigger: t.term, expansion: t.expansion as string, uses: Number(t.uses) })),
  }
}

// --- Zápis diktátu ------------------------------------------------------------

export interface StoredDictation {
  status: string
  finalText: string | null
  words: number
  guards: string[]
}

/** Už zpracovaný diktát téhož zařízení (opakované odeslání z fronty) — přepis se neplatí znovu. */
export async function findDictation(id: string, deviceId: string): Promise<StoredDictation | null> {
  const rows = await adminDb<{ status: string; final_text: string | null; words: number; guards: string[] | null }>`
    SELECT status, final_text, words, guards FROM voice_dictations WHERE id = ${id} AND device_id = ${deviceId}
  `
  const r = rows[0]
  return r ? { status: r.status, finalText: r.final_text, words: Number(r.words), guards: r.guards ?? [] } : null
}

export interface DictationMeta {
  id: string
  deviceId: string
  startedAt: string
  durationMs: number
  speechMs: number | null
  mode: 'hold' | 'hands_free'
  appBundleId: string | null
  appName: string | null
  category: VoiceCategory
}

/**
 * Zapíše diktát. Stejné `id` podruhé nic nezmění. Při „jen čísla" (`storeText`
 * false) se texty neuloží vůbec. U použitých slov ze slovníku a zkratky se
 * zvýší počet použití (řazení nápovědy).
 */
export async function saveDictation(
  meta: DictationMeta,
  out: PipelineOutcome,
  totalMs: number,
  storeText: boolean,
): Promise<boolean> {
  const rawText = storeText ? out.rawText : null
  const finalText = storeText && out.finalText ? out.finalText : null
  const queries = [
    q`
      INSERT INTO voice_dictations (
        id, device_id, started_at, duration_ms, speech_ms, mode, app_bundle_id, app_name, category,
        status, guards, raw_text, final_text, words, dictionary_fixes,
        stt_provider, stt_model, stt_ms, total_ms, audio_seconds, cost_usd
      ) VALUES (
        ${meta.id}, ${meta.deviceId}, ${meta.startedAt}, ${meta.durationMs}, ${meta.speechMs}, ${meta.mode},
        ${meta.appBundleId}, ${meta.appName}, ${meta.category},
        ${out.status}, ${out.guards}, ${rawText}, ${finalText}, ${out.words}, ${out.dictionaryFixes},
        ${out.sttProvider}, ${out.sttModel}, ${out.sttMs}, ${totalMs}, ${out.audioSeconds},
        ${Number(out.costUsd.toFixed(6))}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
  ]
  const used = [...out.usedTermIds, ...(out.snippetId ? [out.snippetId] : [])]
  if (used.length) queries.push(q`UPDATE voice_terms SET uses = uses + 1 WHERE id = ANY(${used}::uuid[])`)
  const [inserted] = await adminDb.batch(queries)
  return inserted.length > 0
}

/** Neúspěšný pokus (přepis selhal) před opakovaným odesláním téhož diktátu. Úspěšné diktáty nemaže. */
export async function forgetFailedDictation(id: string, deviceId: string): Promise<void> {
  await adminDb`DELETE FROM voice_dictations WHERE id = ${id} AND device_id = ${deviceId} AND status = 'error'`
}

/** Diktát zrušený klávesou Esc: jen čísla, žádný text. */
export async function saveCancelled(meta: DictationMeta): Promise<void> {
  await adminDb`
    INSERT INTO voice_dictations (id, device_id, started_at, duration_ms, speech_ms, mode, app_bundle_id, app_name, category, status)
    VALUES (${meta.id}, ${meta.deviceId}, ${meta.startedAt}, ${meta.durationMs}, ${meta.speechMs}, ${meta.mode},
            ${meta.appBundleId}, ${meta.appName}, ${meta.category}, 'cancelled')
    ON CONFLICT (id) DO NOTHING
  `
}
