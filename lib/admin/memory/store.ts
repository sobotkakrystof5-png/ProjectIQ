import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { stripMarkers } from '@/lib/ai/markers'
import { hasRedactionMarker, redactSensitive } from '@/lib/project-activity'
import { MEMORY_KINDS, MEMORY_TEXT_MAX, type MemoryKind, type MemoryScope, type MemorySource } from './types'

/**
 * Paměť projektu (AD15, migrace 111) — **věty**, ne čísla.
 *
 * Druhá vrstva vedle `facts.ts`: tohle napsal člověk nebo model, takže to
 * může být nepřesné. Proto má každý řádek zdroj, platnost a příznak
 * potvrzení — a proto se **nikdy nepoužívá k předvyplnění formuláře**
 * (R-085). Do promptu asistenta jde jako označená nápověda.
 *
 * Bez migrace 111 tabulka neexistuje. Funkce to poznají (`42P01`) a vrátí
 * prázdno místo aby shodily obrazovku: admin pak paměť neukáže, ale všechno
 * ostatní běží dál — stejně jako návrhy asistenta bez migrace 110.
 */

export type MemoryRow = {
  id: string
  scope: MemoryScope
  refId: string | null
  kind: MemoryKind
  text: string
  source: MemorySource
  model: string | null
  createdAt: string
  validUntil: string
  confirmedBy: string | null
}

export type MemoryWriteResult = { ok: true; id: string } | { ok: false; error: string }

/** Potvrzená paměť platí tři roky od posledního pohybu (R-076); úklid ji pak prodlužuje. */
export const MEMORY_YEARS = 3
/** Nepotvrzený návrh paměti po 90 dnech propadá — kontext, ze kterého vznikl, už neplatí. */
export const MEMORY_DRAFT_DAYS = 90
/** Kolik řádků se nejvýš pouští do promptu asistenta. */
export const MEMORY_PROMPT_LIMIT = 8

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string })?.code === '42P01'
}

let tableReady: boolean | null = null

export function resetMemoryReadyForTests(): void {
  tableReady = null
}

export async function memoryAvailable(): Promise<boolean> {
  if (tableReady !== null) return tableReady
  try {
    await adminDb`SELECT 1 FROM project_memory LIMIT 1`
    tableReady = true
  } catch (err) {
    if (!isMissingTable(err)) throw err
    tableReady = false
  }
  return tableReady
}

function toRow(raw: Record<string, unknown>): MemoryRow {
  return {
    id: String(raw.id),
    scope: String(raw.scope) as MemoryScope,
    refId: raw.ref_id === null || raw.ref_id === undefined ? null : String(raw.ref_id),
    kind: String(raw.kind) as MemoryKind,
    text: String(raw.text ?? ''),
    source: String(raw.source ?? 'manual') as MemorySource,
    model: raw.model === null || raw.model === undefined ? null : String(raw.model),
    createdAt: String(raw.created_at),
    validUntil: String(raw.valid_until),
    confirmedBy: raw.confirmed_by === null || raw.confirmed_by === undefined ? null : String(raw.confirmed_by),
  }
}

/**
 * Uloží větu do paměti.
 *
 * Text projde `redactSensitive()` z `lib/project-activity.ts` (R-072 —
 * **použít, nekopírovat**) a když se něco zakrylo, uložení se **odmítne**.
 * U zprávy o práci se zakrytý text ještě dá opravit ručně; paměť se čte
 * potichu do promptu, takže je bezpečnější ji nemít než mít ji děravou.
 */
export async function saveMemory(input: {
  scope: MemoryScope
  refId: string | null
  kind: MemoryKind
  text: string
  source: MemorySource
  model?: string | null
  confirmedBy?: string | null
}): Promise<MemoryWriteResult> {
  if (!(await memoryAvailable())) {
    return { ok: false, error: 'Paměť zatím není zapnutá (chybí migrace 111).' }
  }
  if (!MEMORY_KINDS.includes(input.kind)) return { ok: false, error: 'Neznámý druh poznámky.' }
  if (input.scope === 'global' ? input.refId !== null : input.refId === null) {
    return { ok: false, error: 'Není jasné, čeho se poznámka týká.' }
  }

  const trimmed = input.text.trim()
  if (trimmed === '') return { ok: false, error: 'Napište, co si má systém pamatovat.' }
  if (trimmed.length > MEMORY_TEXT_MAX) {
    return { ok: false, error: `Poznámka je moc dlouhá — nejvýš ${MEMORY_TEXT_MAX} znaků.` }
  }

  const redacted = redactSensitive(trimmed)
  if (redacted.found || hasRedactionMarker(redacted.text)) {
    return { ok: false, error: 'V textu je něco jako klíč, heslo nebo cesta k souboru. Do paměti to nepatří.' }
  }

  const confirmedBy = input.confirmedBy ?? null
  const days = confirmedBy === null ? MEMORY_DRAFT_DAYS : MEMORY_YEARS * 365
  const rows = await adminDb`
    INSERT INTO project_memory (scope, ref_id, kind, text, source, model, valid_until, confirmed_by, confirmed_at)
    VALUES (${input.scope}, ${input.refId}::uuid, ${input.kind}, ${redacted.text}, ${input.source},
            ${input.model ?? null}, now() + make_interval(days => ${days}::int),
            ${confirmedBy}, ${confirmedBy === null ? null : new Date().toISOString()})
    RETURNING id::text AS id
  `
  const id = rows[0]?.id
  return id ? { ok: true, id: String(id) } : { ok: false, error: 'Poznámku se nepodařilo uložit.' }
}

/** Co o tomhle víme. Nepotvrzené je mezi nimi — poznat ho jde podle `confirmedBy`. */
export async function listMemory(scope: MemoryScope, refId: string | null, limit = 50): Promise<MemoryRow[]> {
  if (!(await memoryAvailable())) return []
  const rows = await adminDb`
    SELECT id, scope, ref_id, kind, text, source, model, created_at, valid_until, confirmed_by
    FROM project_memory
    WHERE scope = ${scope} AND ref_id IS NOT DISTINCT FROM ${refId}::uuid AND valid_until > now()
    ORDER BY confirmed_by IS NULL DESC, created_at DESC
    LIMIT ${limit}
  `
  return rows.map((r) => toRow(r as Record<string, unknown>))
}

/** Potvrzení návrhu: od teď platí tři roky a v UI přestane být označený. */
export async function confirmMemory(id: string, by: string): Promise<boolean> {
  if (!(await memoryAvailable())) return false
  const rows = await adminDb`
    UPDATE project_memory
    SET confirmed_by = ${by}, confirmed_at = now(),
        valid_until = now() + make_interval(days => ${MEMORY_YEARS * 365}::int)
    WHERE id = ${id}::uuid AND confirmed_by IS NULL
    RETURNING id
  `
  return rows.length > 0
}

/** Zahození. Maže se, ne archivuje — nepotvrzená věta od modelu nemá historickou hodnotu. */
export async function discardMemory(id: string): Promise<boolean> {
  if (!(await memoryAvailable())) return false
  const rows = await adminDb`DELETE FROM project_memory WHERE id = ${id}::uuid RETURNING id`
  return rows.length > 0
}

/**
 * Paměť pro prompt asistenta. Nepotvrzené je **označené** — model má vědět,
 * že je to domněnka, ne doložený fakt.
 */
export async function memoryForPrompt(scope: MemoryScope, refId: string | null): Promise<string> {
  const rows = await listMemory(scope, refId, MEMORY_PROMPT_LIMIT)
  if (rows.length === 0) return ''
  const lines = rows.map((row) => {
    const mark = row.confirmedBy === null ? ' · nepotvrzeno' : ''
    return `- [${row.kind}${mark}] ${stripMarkers(row.text)}`
  })
  return `<pamet>\n${lines.join('\n')}\n</pamet>`
}

export type MemoryPurgeRun = {
  memory_extended: number
  memory_expired: number
  memory_orphans: number
  suggestions: number
}

/**
 * Denní úklid (cron `client-retention`). Pravidla jsou v migraci 111
 * (`public.purge_memory_retention`), tady jen volání — stejně jako
 * `lib/client-retention.ts` u migrace 098.
 */
export async function purgeMemoryRetention(): Promise<MemoryPurgeRun | null> {
  if (!(await memoryAvailable())) return null
  const [row] = await adminDb`SELECT public.purge_memory_retention() AS r`
  return (row?.r ?? null) as MemoryPurgeRun | null
}
