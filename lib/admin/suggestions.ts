import 'server-only'
import { z } from 'zod'
import { adminDb } from '@/lib/admin/db'
import { suggestionSchema, type Suggestion } from '@/lib/ai/suggestion-schema'

/**
 * Uložené plány asistenta (AD14, migrace 110; od R-111 s provedenými kroky).
 *
 * Řádek drží **co model navrhl** (`proposal`) i **co se z toho provedlo**
 * (`applied_ref.steps`) včetně toho, jak to vrátit. Prohlížeč posílá při
 * potvrzení i vracení jen `id` (a pořadí kroku), takže obsahem plánu ani
 * údaji pro „Zpět" nejde zvenku hýbat.
 *
 * Stav řádku:
 * - `pending` + `applied_at IS NULL` — něco čeká na klepnutí (nebo všechno),
 * - `pending` + `applied_at` vyplněné — klepnutí zrovna běží (zámek),
 * - `applied` — nic už nečeká,
 * - `rejected` — člověk plán zahodil.
 *
 * Bez migrace 110 tabulka neexistuje. Funkce to poznají (`42P01`) a vrátí
 * `null`, respektive `false`: asistent pak poradí, ale nic neprovede.
 */

export type SuggestionStatus = 'pending' | 'applied' | 'rejected' | 'expired'
export type SuggestionSource = 'command' | 'panel' | 'voice'

/** Jak vrátit provedený krok. Leží jen v databázi, do prohlížeče nechodí. */
export const undoTokenSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead'), id: z.string().uuid() }),
  z.object({ type: z.literal('event_created'), id: z.string().uuid() }),
  z.object({
    type: z.literal('event_moved'),
    id: z.string().uuid(),
    before: z.object({
      title: z.string(),
      description: z.string().nullable(),
      starts_at: z.string(),
      ends_at: z.string(),
      event_type: z.enum(['manual', 'block']),
      contact_name: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
  }),
  z.object({ type: z.literal('event_cancelled'), snapshot: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('status'), projectId: z.string().uuid(), previous: z.string() }),
  z.object({ type: z.literal('project_note'), id: z.string().uuid(), projectId: z.string().uuid() }),
  z.object({ type: z.literal('lead_note'), id: z.string().uuid() }),
  z.object({ type: z.literal('project'), id: z.string().uuid() }),
  z.object({ type: z.literal('income'), id: z.string().uuid() }),
  z.object({ type: z.literal('cost'), id: z.string().uuid(), projectId: z.string().uuid().nullable() }),
  z.object({ type: z.literal('invoice_paid'), id: z.string().uuid(), previousPaidOn: z.string().nullable() }),
  // Úpravy (R-113): stav před změnou, „Zpět" ho zapíše zpátky.
  z.object({ type: z.literal('lead_updated'), id: z.string().uuid(), before: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('project_updated'), id: z.string().uuid(), before: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('memory'), id: z.string().uuid() }),
])

export type UndoToken = z.infer<typeof undoTokenSchema>

const stepSchema = z.object({
  index: z.number().int().min(0),
  ok: z.boolean(),
  message: z.string(),
  description: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  undo: undoTokenSchema.nullable().optional(),
  undone: z.boolean().optional(),
  error: z.string().nullable().optional(),
})

export type StepState = z.infer<typeof stepSchema>

const appliedSchema = z.object({ steps: z.array(stepSchema) })

/** Co z kroku smí vidět prohlížeč — bez údajů pro „Zpět". */
export type StepView = {
  index: number
  ok: boolean
  message: string
  description: string | null
  href: string | null
  canUndo: boolean
  undone: boolean
  error: string | null
}

export function toStepView(step: StepState): StepView {
  return {
    index: step.index,
    ok: step.ok,
    message: step.message,
    description: step.description ?? null,
    href: step.href ?? null,
    canUndo: step.ok && Boolean(step.undo) && step.undone !== true,
    undone: step.undone === true,
    error: step.error ?? null,
  }
}

export type SuggestionRow = {
  id: string
  createdAt: string
  source: SuggestionSource
  inputText: string
  model: string
  suggestion: Suggestion
  status: SuggestionStatus
  appliedAt: string | null
  steps: StepState[]
}

/** Chybějící tabulka (migrace 110 neproběhla) — ne chyba v kódu. */
function isMissingTable(err: unknown): boolean {
  return (err as { code?: string })?.code === '42P01'
}

/** Řádky z AD14 nesou v `applied_ref` jiný tvar ({ kind, id, href }) — ty vratné kroky nemají. */
export function parseSteps(raw: unknown): StepState[] {
  const parsed = appliedSchema.safeParse(raw)
  return parsed.success ? parsed.data.steps : []
}

function toRow(raw: Record<string, unknown>): SuggestionRow | null {
  const parsed = suggestionSchema.safeParse(raw.proposal)
  if (!parsed.success) return null
  const source = raw.source === 'command' || raw.source === 'voice' ? raw.source : 'panel'
  return {
    id: String(raw.id),
    createdAt: String(raw.created_at),
    source,
    inputText: String(raw.input_text ?? ''),
    model: String(raw.model ?? ''),
    suggestion: parsed.data,
    status: String(raw.status) as SuggestionStatus,
    appliedAt: raw.applied_at ? String(raw.applied_at) : null,
    steps: parseSteps(raw.applied_ref),
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
             proposal, status, applied_at::text AS applied_at, applied_ref
      FROM ai_suggestions WHERE id = ${id} LIMIT 1
    `
    return rows[0] ? toRow(rows[0]) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

/**
 * Zámek před prováděním. Dvojklik (nebo dvě záložky) tak dostane akci jen
 * jednou: druhý pokus najde `applied_at` vyplněné a vrátí `false`.
 */
export async function claimForApply(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE ai_suggestions SET applied_at = now()
    WHERE id = ${id} AND status = 'pending' AND applied_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Zapíše kroky a uvolní zámek. `finished` = nic už nečeká na klepnutí →
 * `applied`; jinak řádek zůstane `pending` a další klepnutí ho zamkne znovu.
 */
export async function saveSteps(id: string, steps: StepState[], finished: boolean): Promise<void> {
  const applied = JSON.stringify({ steps })
  if (finished) {
    await adminDb`
      UPDATE ai_suggestions
      SET status = 'applied', applied_at = COALESCE(applied_at, now()), applied_ref = ${applied}::jsonb
      WHERE id = ${id}
    `
    return
  }
  await adminDb`
    UPDATE ai_suggestions SET applied_at = NULL, applied_ref = ${applied}::jsonb
    WHERE id = ${id}
  `
}

/**
 * Optimistický zámek pro „Zpět": kroky se přepíšou jen tehdy, když jsou
 * v databázi pořád tytéž, jaké volající načetl. Dvojí „Zpět" tak nevrátí
 * jednu věc dvakrát (smazaný termín by se obnovil podruhé).
 */
export async function replaceSteps(id: string, before: StepState[], after: StepState[]): Promise<boolean> {
  const rows = await adminDb`
    UPDATE ai_suggestions SET applied_ref = ${JSON.stringify({ steps: after })}::jsonb
    WHERE id = ${id} AND applied_ref = ${JSON.stringify({ steps: before })}::jsonb
    RETURNING id
  `
  return rows.length > 0
}

/** Zahodit lze jen to, co ještě nikdo nezačal provádět. */
export async function markRejected(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE ai_suggestions SET status = 'rejected'
    WHERE id = ${id} AND status = 'pending' AND applied_at IS NULL
    RETURNING id
  `
  return rows.length > 0
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
