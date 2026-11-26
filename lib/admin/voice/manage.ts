import 'server-only'
import { z } from 'zod'
import { adminDb, q, type AdminQuery } from '@/lib/admin/db'
import { addIsoDays } from '@/lib/prague-time'
import { STYLE_KEYS, VOICE_CATEGORIES } from './categories'
import { historyWhere, type HistoryFilter } from './queries'
import { pragueDayStart } from './stats'

/**
 * ZakazIQ Voice (R-148): zápisy z adminu (VO10) — návrhy z učení, slovník,
 * pravidla, nastavení a mazání diktátů. Volají je jen server actions
 * v `app/voice-actions.ts`, které ověří přihlášení a vstup.
 *
 * Přijetí a odmítnutí návrhu jde 2 minuty vrátit („Zpět" v toastu). Co přijetí
 * změnilo, se pamatuje v `payload._applied`, aby Zpět vrátilo přesně to:
 * nové slovo smaže, u existujícího vrátí původní „jak to slyší".
 */

export const UNDO_WINDOW_SECONDS = 120

// --- Návrhy z učení ----------------------------------------------------------

export const termPayload = z.object({
  term: z.string().trim().min(1).max(80),
  heardAs: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
})
export const blockPayload = z.object({
  phrase: z.string().trim().min(2).max(300),
  mode: z.enum(['always', 'alone']).default('alone'),
})
export const rulePayload = z.object({ text: z.string().trim().min(2).max(300) })

const applied = z
  .object({ created: z.boolean(), prevHeardAs: z.array(z.string()).nullable().optional(), prevActive: z.boolean().nullable().optional() })
  .partial()

export type DecideResult = 'ok' | 'gone' | 'invalid'

/** Přijmout návrh: zapsat do slovníku nebo pravidel a označit jako přijatý — jedním příkazem. */
export async function acceptSuggestion(id: string): Promise<DecideResult> {
  const rows = await adminDb<{ kind: 'term' | 'blocklist' | 'rule'; payload: unknown }>`
    SELECT kind, payload FROM voice_suggestions WHERE id = ${id} AND status = 'pending'
  `
  const row = rows[0]
  if (!row) return 'gone'

  if (row.kind === 'term') {
    const p = termPayload.safeParse(row.payload)
    if (!p.success) return 'invalid'
    const done = await adminDb`
      WITH prev AS (
        SELECT heard_as FROM voice_terms WHERE kind = 'term' AND lower(term) = lower(${p.data.term})
      ), claim AS (
        UPDATE voice_suggestions
           SET status = 'accepted', decided_at = now(),
               payload = payload || jsonb_build_object('_applied', jsonb_build_object(
                 'created', NOT EXISTS (SELECT 1 FROM prev),
                 'prevHeardAs', (SELECT to_jsonb(heard_as) FROM prev)))
         WHERE id = ${id} AND status = 'pending'
        RETURNING id
      )
      INSERT INTO voice_terms (kind, term, heard_as, source)
      SELECT 'term', ${p.data.term}, ${p.data.heardAs}::text[], 'learned' FROM claim
      ON CONFLICT (kind, lower(term)) DO UPDATE
        SET heard_as = ARRAY(SELECT DISTINCT h FROM unnest(voice_terms.heard_as || EXCLUDED.heard_as) AS h ORDER BY h),
            updated_at = now()
      RETURNING id
    `
    return done.length ? 'ok' : 'gone'
  }

  const parsed =
    row.kind === 'blocklist'
      ? blockPayload.safeParse(row.payload)
      : rulePayload.transform((r) => ({ phrase: r.text, mode: 'alone' as const })).safeParse(row.payload)
  if (!parsed.success) return 'invalid'
  const done = await adminDb`
    WITH prev AS (
      SELECT active FROM voice_rules WHERE kind = ${row.kind} AND lower(text) = lower(${parsed.data.phrase})
    ), claim AS (
      UPDATE voice_suggestions
         SET status = 'accepted', decided_at = now(),
             payload = payload || jsonb_build_object('_applied', jsonb_build_object(
               'created', NOT EXISTS (SELECT 1 FROM prev),
               'prevActive', (SELECT active FROM prev)))
       WHERE id = ${id} AND status = 'pending'
      RETURNING id
    )
    INSERT INTO voice_rules (kind, text, mode, source)
    SELECT ${row.kind}, ${parsed.data.phrase}, ${parsed.data.mode}, 'learned' FROM claim
    ON CONFLICT (kind, lower(text)) DO UPDATE SET active = true
    RETURNING id
  `
  return done.length ? 'ok' : 'gone'
}

export async function rejectSuggestion(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE voice_suggestions SET status = 'rejected', decided_at = now()
    WHERE id = ${id} AND status = 'pending' RETURNING id
  `
  return rows.length > 0
}

/** Zpět po přijetí nebo odmítnutí: návrh se vrátí mezi čekající a přijetí se odvolá. */
export async function undoSuggestion(id: string): Promise<boolean> {
  const rows = await adminDb<{ kind: 'term' | 'blocklist' | 'rule'; status: string; payload: Record<string, unknown> }>`
    SELECT kind, status, payload FROM voice_suggestions
    WHERE id = ${id} AND status IN ('accepted', 'rejected')
      AND decided_at > now() - make_interval(secs => ${UNDO_WINDOW_SECONDS})
  `
  const row = rows[0]
  if (!row) return false
  const reset = q`
    UPDATE voice_suggestions SET status = 'pending', decided_at = NULL, payload = payload - '_applied'
    WHERE id = ${id} AND status = ${row.status}
  `
  if (row.status === 'rejected') {
    await adminDb.batch([reset])
    return true
  }
  const info = applied.safeParse(row.payload?._applied)
  const was = info.success ? info.data : {}
  const revert: AdminQuery[] = []
  if (row.kind === 'term') {
    const p = termPayload.safeParse(row.payload)
    if (p.success) {
      revert.push(
        was.created
          ? q`DELETE FROM voice_terms WHERE kind = 'term' AND lower(term) = lower(${p.data.term})`
          : q`UPDATE voice_terms SET heard_as = ${was.prevHeardAs ?? []}::text[], updated_at = now()
              WHERE kind = 'term' AND lower(term) = lower(${p.data.term})`,
      )
    }
  } else {
    const text = row.kind === 'blocklist' ? blockPayload.safeParse(row.payload) : rulePayload.safeParse(row.payload)
    const value = text.success ? ('phrase' in text.data ? text.data.phrase : text.data.text) : null
    if (value) {
      revert.push(
        was.created
          ? q`DELETE FROM voice_rules WHERE kind = ${row.kind} AND lower(text) = lower(${value}) AND source <> 'builtin'`
          : q`UPDATE voice_rules SET active = ${was.prevActive ?? true} WHERE kind = ${row.kind} AND lower(text) = lower(${value})`,
      )
    }
  }
  await adminDb.batch([...revert, reset])
  return true
}

// --- Naučená slova -------------------------------------------------------------

export interface TermSnapshot {
  id: string
  kind: 'term' | 'snippet'
  term: string
  heardAs: string[]
  expansion: string | null
  source: 'manual' | 'learned'
  uses: number
}

/**
 * „Vrátit" u naučeného slova: smaže ho ze slovníku a jeho návrhy označí jako
 * odmítnuté, aby se stejné slovo z oprav znovu samo nenaučilo.
 */
export async function forgetLearnedTerm(id: string): Promise<TermSnapshot | null> {
  const [gone] = await adminDb.batch([
    q`
      WITH del AS (
        DELETE FROM voice_terms WHERE id = ${id} AND kind = 'term' AND source = 'learned'
        RETURNING id::text, kind, term, heard_as, expansion, source, uses
      ), mark AS (
        UPDATE voice_suggestions s SET status = 'rejected', decided_at = now()
          FROM del
         WHERE s.kind = 'term' AND lower(s.payload->>'term') = lower(del.term) AND s.status <> 'rejected'
        RETURNING s.id
      )
      SELECT del.*, (SELECT count(*) FROM mark)::int AS marked FROM del
    `,
  ])
  const r = gone[0] as { id: string; kind: 'term'; term: string; heard_as: string[] | null; expansion: string | null; source: 'learned'; uses: number } | undefined
  return r ? { id: r.id, kind: r.kind, term: r.term, heardAs: r.heard_as ?? [], expansion: r.expansion, source: r.source, uses: Number(r.uses) } : null
}

/** Zpět po smazání slova nebo zkratky (i naučeného). */
export async function restoreTerm(s: TermSnapshot): Promise<boolean> {
  const queries: AdminQuery[] = [
    q`
      INSERT INTO voice_terms (id, kind, term, heard_as, expansion, source, uses)
      VALUES (${s.id}, ${s.kind}, ${s.term}, ${s.heardAs}::text[], ${s.expansion}, ${s.source}, ${s.uses})
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  ]
  if (s.source === 'learned' && s.kind === 'term') {
    queries.push(q`
      UPDATE voice_suggestions SET status = 'accepted', decided_at = now()
      WHERE kind = 'term' AND lower(payload->>'term') = lower(${s.term}) AND status = 'rejected'
        AND decided_at > now() - make_interval(secs => ${UNDO_WINDOW_SECONDS})
    `)
  }
  const [inserted] = await adminDb.batch(queries)
  return inserted.length > 0
}

// --- Slovník a zkratky ----------------------------------------------------------

export const termInput = z.object({
  id: z.string().uuid().nullable().default(null),
  term: z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1, 'Napište slovo.').max(80, 'Slovo může mít nejvýš 80 znaků.')),
  heardAs: z
    .array(z.string().transform((s) => s.replace(/\s+/g, ' ').trim()))
    .transform((list) => [...new Set(list.filter(Boolean))])
    .pipe(z.array(z.string().max(120, 'Jedna varianta může mít nejvýš 120 znaků.')).max(10, 'Nejvýš 10 variant.')),
})

export const snippetInput = z.object({
  id: z.string().uuid().nullable().default(null),
  trigger: z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1, 'Napište zkratku.').max(80, 'Zkratka může mít nejvýš 80 znaků.')),
  expansion: z.string().trim().min(1, 'Napište text, který se vloží.').max(2000, 'Text může mít nejvýš 2 000 znaků.'),
})

export type SaveResult = 'ok' | 'duplicate' | 'gone'

const isUnique = (err: unknown) => (err as { code?: string })?.code === '23505'

export async function saveTerm(input: z.infer<typeof termInput>): Promise<SaveResult> {
  try {
    const rows = input.id
      ? await adminDb`
          UPDATE voice_terms SET term = ${input.term}, heard_as = ${input.heardAs}::text[], updated_at = now()
          WHERE id = ${input.id} AND kind = 'term' RETURNING id`
      : await adminDb`
          INSERT INTO voice_terms (kind, term, heard_as, source) VALUES ('term', ${input.term}, ${input.heardAs}::text[], 'manual')
          RETURNING id`
    return rows.length ? 'ok' : 'gone'
  } catch (err) {
    if (isUnique(err)) return 'duplicate'
    throw err
  }
}

export async function saveSnippet(input: z.infer<typeof snippetInput>): Promise<SaveResult> {
  try {
    const rows = input.id
      ? await adminDb`
          UPDATE voice_terms SET term = ${input.trigger}, expansion = ${input.expansion}, updated_at = now()
          WHERE id = ${input.id} AND kind = 'snippet' RETURNING id`
      : await adminDb`
          INSERT INTO voice_terms (kind, term, expansion, source) VALUES ('snippet', ${input.trigger}, ${input.expansion}, 'manual')
          RETURNING id`
    return rows.length ? 'ok' : 'gone'
  } catch (err) {
    if (isUnique(err)) return 'duplicate'
    throw err
  }
}

/** Smaže slovo nebo zkratku a vrátí, co bylo, pro Zpět. */
export async function deleteTerm(id: string): Promise<TermSnapshot | null> {
  const rows = await adminDb<{ id: string; kind: 'term' | 'snippet'; term: string; heard_as: string[] | null; expansion: string | null; source: 'manual' | 'learned'; uses: number }>`
    DELETE FROM voice_terms WHERE id = ${id}
    RETURNING id::text, kind, term, heard_as, expansion, source, uses
  `
  const r = rows[0]
  return r ? { id: r.id, kind: r.kind, term: r.term, heardAs: r.heard_as ?? [], expansion: r.expansion, source: r.source, uses: Number(r.uses) } : null
}

// --- Pravidla stylu a blokované fráze ---------------------------------------------

export const ruleInput = z.object({
  kind: z.enum(['rule', 'blocklist']),
  text: z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().min(2, 'Napište aspoň dva znaky.').max(300, 'Nejvýš 300 znaků.')),
  mode: z.enum(['always', 'alone']).default('alone'),
})

export interface RuleSnapshot {
  id: string
  kind: 'rule' | 'blocklist'
  text: string
  mode: 'always' | 'alone'
  active: boolean
  source: 'manual' | 'learned'
}

export async function addRule(input: z.infer<typeof ruleInput>): Promise<SaveResult> {
  try {
    await adminDb`
      INSERT INTO voice_rules (kind, text, mode, source) VALUES (${input.kind}, ${input.text}, ${input.mode}, 'manual')
    `
    return 'ok'
  } catch (err) {
    if (isUnique(err)) return 'duplicate'
    throw err
  }
}

export async function setRuleActive(id: string, active: boolean): Promise<boolean> {
  const rows = await adminDb`UPDATE voice_rules SET active = ${active} WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Vestavěné fráze jdou jen vypnout, ne smazat. */
export async function deleteRule(id: string): Promise<RuleSnapshot | null> {
  const rows = await adminDb<{ id: string; kind: 'rule' | 'blocklist'; text: string; mode: 'always' | 'alone'; active: boolean; source: 'manual' | 'learned' }>`
    DELETE FROM voice_rules WHERE id = ${id} AND source <> 'builtin'
    RETURNING id::text, kind, text, mode, active, source
  `
  return rows[0] ?? null
}

export async function restoreRule(s: RuleSnapshot): Promise<boolean> {
  const rows = await adminDb`
    INSERT INTO voice_rules (id, kind, text, mode, active, source)
    VALUES (${s.id}, ${s.kind}, ${s.text}, ${s.mode}, ${s.active}, ${s.source})
    ON CONFLICT DO NOTHING RETURNING id
  `
  return rows.length > 0
}

// --- Nastavení ----------------------------------------------------------------

export const settingsInput = z
  .object({
    // Zod 4: záznam s výčtem klíčů chce všechny kategorie.
    styles: z.record(z.enum(VOICE_CATEGORIES), z.enum(STYLE_KEYS)),
    typingWpm: z.number().int().min(10, 'Rychlost psaní je nejméně 10 slov za minutu.').max(200, 'Rychlost psaní je nejvýš 200 slov za minutu.'),
    /** null = text natrvalo (D-V7). */
    textRetentionDays: z.number().int().min(1, 'Lhůta je nejméně 1 den.').max(3650, 'Lhůta je nejvýš 3 650 dní.').nullable(),
    storeText: z.boolean(),
    autoLearnTerms: z.boolean(),
    cleanupEnabled: z.boolean(),
    dailyCostCapUsd: z.number().min(0, 'Strop nemůže být záporný.').max(100, 'Strop je nejvýš 100 USD.'),
  })
  .partial()

const SETTING_KEYS = {
  styles: 'styles',
  typingWpm: 'typing_wpm',
  textRetentionDays: 'text_retention_days',
  storeText: 'store_text',
  autoLearnTerms: 'auto_learn_terms',
  cleanupEnabled: 'cleanup_enabled',
  dailyCostCapUsd: 'daily_cost_cap_usd',
} as const

export async function saveSettings(input: z.infer<typeof settingsInput>): Promise<number> {
  const queries = (Object.keys(SETTING_KEYS) as (keyof typeof SETTING_KEYS)[])
    .filter((k) => input[k] !== undefined)
    .map(
      (k) => q`
        INSERT INTO voice_settings (key, value) VALUES (${SETTING_KEYS[k]}, ${JSON.stringify(input[k])}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
    )
  if (queries.length) await adminDb.batch(queries)
  return queries.length
}

// --- Mazání diktátů (D-V7) ---------------------------------------------------------

export type DeleteScope =
  | { kind: 'one'; id: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'search'; filter: HistoryFilter }
  | { kind: 'all' }

function scopeWhere(scope: DeleteScope): { sql: string; params: unknown[] } {
  switch (scope.kind) {
    case 'one':
      return { sql: 'WHERE id = $1', params: [scope.id] }
    case 'range':
      return {
        sql: 'WHERE started_at >= $1 AND started_at < $2',
        params: [pragueDayStart(scope.from), pragueDayStart(addIsoDays(scope.to, 1))],
      }
    case 'search':
      return historyWhere(scope.filter)
    case 'all':
      return { sql: '', params: [] }
  }
}

/** Kolik diktátů by smazání vzalo (věta v potvrzení). */
export async function countDictations(scope: DeleteScope): Promise<number> {
  const w = scopeWhere(scope)
  const rows = await adminDb.batch([{ text: `SELECT count(*)::int AS n FROM voice_dictations ${w.sql}`, params: w.params }])
  return Number((rows[0][0] as { n?: number } | undefined)?.n ?? 0)
}

/**
 * Smaže diktáty i s opravami (cizí klíč) a s odkazy v návrzích (trigger
 * z migrace 136). Nejde vrátit — proto se ptá potvrzením s počtem.
 */
export async function deleteDictations(scope: DeleteScope): Promise<number> {
  const w = scopeWhere(scope)
  const rows = await adminDb.batch([{ text: `DELETE FROM voice_dictations ${w.sql} RETURNING id`, params: w.params }])
  return rows[0].length
}
