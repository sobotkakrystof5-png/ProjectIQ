import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { suggestionSchema, type Suggestion } from '@/lib/ai/suggestion-schema'

/**
 * Uložené návrhy asistenta (AD14, migrace 110).
 *
 * Návrh je **koncept**: leží tady, dokud ho člověk nepotvrdí. Prohlížeč
 * posílá při potvrzení jen `id`, takže obsahem návrhu nejde zvenku hýbat —
 * řádek se znovu prožene `suggestionSchema` a teprve pak se podle něj koná.
 *
 * Bez migrace 110 tabulka neexistuje. Funkce to poznají (`42P01`) a vrátí
 * `null`, respektive `false`, místo aby shodily obrazovku: asistent pak
 * poradí, ale potvrzení nenabídne.
 */

export type SuggestionStatus = 'pending' | 'applied' | 'rejected' | 'expired'
export type SuggestionSource = 'command' | 'panel'

export type AppliedRef = { kind: string; id: string | null; href: string | null }

export type SuggestionRow = {
  id: string
  createdAt: string
  source: SuggestionSource
  inputText: string
  model: string
  suggestion: Suggestion
  status: SuggestionStatus
  appliedRef: AppliedRef | null
}

/** Chybějící tabulka (migrace 110 neproběhla) — ne chyba v kódu. */
function isMissingTable(err: unknown): boolean {
  return (err as { code?: string })?.code === '42P01'
}

function toRow(raw: Record<string, unknown>): SuggestionRow | null {
  const parsed = suggestionSchema.safeParse(raw.proposal)
  if (!parsed.success) return null
  return {
    id: String(raw.id),
    createdAt: String(raw.created_at),
    source: (raw.source === 'command' ? 'command' : 'panel') as SuggestionSource,
    inputText: String(raw.input_text ?? ''),
    model: String(raw.model ?? ''),
    suggestion: parsed.data,
    status: String(raw.status) as SuggestionStatus,
    appliedRef: (raw.applied_ref as AppliedRef | null) ?? null,
  }
}

/** Je tabulka na téhle databázi? Zjišťuje se jednou za běh procesu. */
let tableReady: boolean | null = null

export function resetSuggestionsReadyForTests(): void {
  tableReady = null
}

export async function suggestionsAvailable(): Promise<boolean> {
  if (tableReady !== null) return tableReady
  try {
    await adminDb`SELECT 1 FROM ai_suggestions LIMIT 1`
    tableReady = true
  } catch (err) {
    if (!isMissingTable(err)) throw err
    tableReady = false
  }
  return tableReady
}

export async function saveSuggestion(input: {
  authorEmail: string | null
  source: SuggestionSource
  inputText: string
  model: string
  suggestion: Suggestion
  tokensIn: number | null
  tokensOut: number | null
}): Promise<string | null> {
  try {
    const rows = await adminDb`
      INSERT INTO ai_suggestions (author_email, source, input_text, model, proposal, tokens_in, tokens_out)
      VALUES (${input.authorEmail}, ${input.source}, ${input.inputText}, ${input.model},
              ${JSON.stringify(input.suggestion)}::jsonb, ${input.tokensIn}, ${input.tokensOut})
      RETURNING id::text AS id
    `
    return rows[0] ? String(rows[0].id) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export async function loadSuggestion(id: string): Promise<SuggestionRow | null> {
  try {
    const rows = await adminDb`
      SELECT id::text AS id, created_at::text AS created_at, source, input_text, model,
             proposal, status, applied_ref
      FROM ai_suggestions WHERE id = ${id} LIMIT 1
    `
    return rows[0] ? toRow(rows[0]) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

/**
 * Označí návrh za provedený. Podmínka `status = 'pending'` je pojistka proti
 * dvojímu kliknutí: druhý pokus nepřepíše nic a `false` řekne volajícímu,
 * že se akce nemá provést podruhé.
 */
export async function markApplied(id: string, ref: AppliedRef): Promise<boolean> {
  const rows = await adminDb`
    UPDATE ai_suggestions
    SET status = 'applied', applied_at = now(), applied_ref = ${JSON.stringify(ref)}::jsonb
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `
  return rows.length > 0
}

export async function markRejected(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE ai_suggestions SET status = 'rejected'
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `
  return rows.length > 0
}

/** „Zpět" u potvrzení: návrh se vrátí mezi nevyřízené. Vzniklý záznam maže volající. */
export async function markPendingAgain(id: string): Promise<void> {
  await adminDb`
    UPDATE ai_suggestions SET status = 'pending', applied_at = NULL, applied_ref = NULL
    WHERE id = ${id} AND status = 'applied'
  `
}

/** Nevyřízené návrhy po sedmi dnech. Volá denní cron `send-reminders`. */
export async function expireOldSuggestions(): Promise<number> {
  try {
    const rows = await adminDb`SELECT expire_ai_suggestions() AS changed`
    return Number(rows[0]?.changed ?? 0)
  } catch (err) {
    if (isMissingTable(err) || (err as { code?: string })?.code === '42883') return 0
    throw err
  }
}
