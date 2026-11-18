import 'server-only'
import { adminDb } from '@/lib/admin/db'
import type { ReportCallPayload } from '@/types/outreach-report'
import type { SnapshotCall, SnapshotEmail } from '@/types/outreach'

/**
 * Ukládání hovorů a e-mailů z Growth OS (R-118, v2 R-120) — jedna cesta pro
 * report po kole i pro snímek firmy, ať se nerozjedou.
 *
 * Pravidla:
 *  1. Hovor se pozná podle `external_id`, opakované poslání nic nezdvojí.
 *  2. Chybějící hodnota nic nepřepíše: snímek bez přepisu přepis nesmaže,
 *     report bez ceny cenu nesmaže. Výsledek (`result`) se bere vždy ten
 *     poslední — hovor mohl mezi koly přejít z „čeká" na skutečný výsledek.
 *  3. Přepis starší než 90 dní (úklid ho už smazal) se nevrátí.
 *  4. Bez migrace 119 se uloží jen sloupce z 116 (`extras: false`).
 *
 * Přepis, shrnutí a text e-mailu jsou texty o skutečných lidech: jen text,
 * nikdy HTML.
 */

const PRAGUE = 'Europe/Prague'

export function pragueDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PRAGUE }).format(new Date(iso))
}

const BASE_COLUMNS = [
  'external_id', 'lead_external_id', 'company_name', 'report_date', 'round', 'called_at', 'result',
  'duration_s', 'who_hung_up', 'hangup_at_s', 'intro_s', 'termination_reason', 'chance_level',
  'chance_why', 'chance_action', 'summary', 'objections', 'failed_criteria', 'segment', 'industry',
  'opening_variant', 'transcript',
] as const

const EXTRA_COLUMNS = ['conversation_id', 'cost_czk', 'cost_source', 'telephony_status', 'collected', 'criteria'] as const

const COLUMN_TYPES: Record<(typeof BASE_COLUMNS)[number] | (typeof EXTRA_COLUMNS)[number], string> = {
  external_id: 'text',
  lead_external_id: 'text',
  company_name: 'text',
  report_date: 'date',
  round: 'integer',
  called_at: 'timestamptz',
  result: 'text',
  duration_s: 'numeric',
  who_hung_up: 'text',
  hangup_at_s: 'numeric',
  intro_s: 'numeric',
  termination_reason: 'text',
  chance_level: 'text',
  chance_why: 'jsonb',
  chance_action: 'text',
  summary: 'text',
  objections: 'jsonb',
  failed_criteria: 'jsonb',
  segment: 'text',
  industry: 'text',
  opening_variant: 'text',
  transcript: 'jsonb',
  conversation_id: 'text',
  cost_czk: 'numeric',
  cost_source: 'text',
  telephony_status: 'text',
  collected: 'jsonb',
  criteria: 'jsonb',
}

/** Sloupce, kde novější hodnota vždy vyhraje (hovor patří firmě a dni). */
const ALWAYS = new Set(['lead_external_id', 'company_name', 'report_date', 'result'])
/** jsonb pole: prázdné pole nic nepřepíše. */
const ARRAYS = new Set(['chance_why', 'objections', 'failed_criteria', 'criteria'])

function updateExpr(c: string): string {
  if (ALWAYS.has(c)) return `${c} = EXCLUDED.${c}`
  if (ARRAYS.has(c)) {
    return `${c} = CASE WHEN jsonb_array_length(EXCLUDED.${c}) > 0 THEN EXCLUDED.${c} ELSE outreach_calls.${c} END`
  }
  if (c === 'collected') {
    return `${c} = CASE WHEN EXCLUDED.${c} <> '{}'::jsonb THEN EXCLUDED.${c} ELSE outreach_calls.${c} END`
  }
  return `${c} = coalesce(EXCLUDED.${c}, outreach_calls.${c})`
}

// Přepis staršího než 90 dní (úklid ho už smazal, nebo by ho smazal) se
// pozdním reportem ani dotažením historie neuloží.
const TRANSCRIPT_IN_RETENTION = `CASE WHEN report_date < (now() AT TIME ZONE 'Europe/Prague')::date - 90
  THEN NULL ELSE transcript END`

export type CallRecord = Record<string, unknown>

type CallInput = (ReportCallPayload | SnapshotCall) & { lead_external_id?: string; company?: string }

/** Řádek pro `outreach_calls` z hovoru v reportu nebo ve snímku. */
export function callRecord(
  c: CallInput,
  ctx: { leadExternalId: string; company: string; date: string },
): CallRecord {
  return {
    external_id: c.external_id,
    lead_external_id: ctx.leadExternalId,
    company_name: ctx.company,
    report_date: ctx.date,
    round: c.round ?? null,
    called_at: c.at ? new Date(c.at).toISOString() : null,
    result: c.result,
    duration_s: c.duration_s ?? null,
    who_hung_up: c.who_hung_up ?? null,
    hangup_at_s: c.hangup_at_s ?? null,
    intro_s: c.intro_s ?? null,
    termination_reason: c.termination_reason ?? null,
    chance_level: c.chance?.level ?? null,
    chance_why: c.chance?.why ?? [],
    chance_action: c.chance?.action ?? null,
    summary: c.summary ?? null,
    objections: c.objections ?? [],
    failed_criteria: c.failed_criteria ?? [],
    segment: c.segment ?? null,
    industry: c.industry ?? null,
    opening_variant: c.opening_variant ?? null,
    transcript: c.transcript && c.transcript.length ? c.transcript : null,
    conversation_id: c.conversation_id ?? null,
    cost_czk: c.cost_czk ?? null,
    cost_source: c.cost_source ?? null,
    telephony_status: c.telephony_status ?? null,
    collected: c.collected ?? {},
    criteria: c.criteria ?? [],
  }
}

/** Dotaz, který uloží hovory jedním příkazem. Vrací `external_id` uložených. */
export function callsUpsertQuery(records: CallRecord[], options: { extras: boolean }): { text: string; params: unknown[] } {
  const columns: string[] = [...BASE_COLUMNS, ...(options.extras ? EXTRA_COLUMNS : [])]
  // Stejný hovor dvakrát v jedné dávce by ON CONFLICT odmítl — vyhrává poslední.
  const unique = [...new Map(records.map((r) => [String(r.external_id), r])).values()]
  const rows = unique.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])))
  return {
    text: `
      INSERT INTO outreach_calls (${columns.join(', ')})
      SELECT ${columns.map((c) => (c === 'transcript' ? TRANSCRIPT_IN_RETENTION : c)).join(', ')}
        FROM jsonb_to_recordset($1::jsonb) AS x(${columns.map((c) => `${c} ${COLUMN_TYPES[c as keyof typeof COLUMN_TYPES]}`).join(', ')})
      ON CONFLICT (external_id) DO UPDATE SET
        ${columns.filter((c) => c !== 'external_id').map(updateExpr).join(',\n        ')},
        received_at = now()
      RETURNING external_id`,
    params: [JSON.stringify(rows)],
  }
}

function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string })?.code === '42703'
}

/** Uloží hovory; bez migrace 119 jen sloupce z 116. Vrací počet uložených. */
export async function upsertOutreachCalls(records: CallRecord[]): Promise<number> {
  if (records.length === 0) return 0
  try {
    const [saved] = await adminDb.batch([callsUpsertQuery(records, { extras: true })])
    return saved.length
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    const [saved] = await adminDb.batch([callsUpsertQuery(records, { extras: false })])
    return saved.length
  }
}

// ─── E-maily (v2, migrace 119) ──────────────────────────────────────────────

const EMAIL_RECORD = `
  external_id text, lead_external_id text, kind text, status text, subject text, body_text text,
  scheduled_for timestamptz, sent_at timestamptz, delivered_at timestamptz, opened_at timestamptz,
  clicked_at timestamptz, replied_at timestamptz, bounced_at timestamptz, open_count integer, click_count integer`

const EMAIL_COLUMNS = [
  'external_id', 'lead_external_id', 'kind', 'status', 'subject', 'body_text', 'scheduled_for', 'sent_at',
  'delivered_at', 'opened_at', 'clicked_at', 'replied_at', 'bounced_at', 'open_count', 'click_count',
] as const

export function emailRecord(e: SnapshotEmail, leadExternalId: string): Record<(typeof EMAIL_COLUMNS)[number], unknown> {
  const at = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null)
  return {
    external_id: e.external_id,
    lead_external_id: leadExternalId,
    kind: e.kind,
    status: e.status ?? null,
    subject: e.subject ?? null,
    body_text: e.text ?? null,
    scheduled_for: at(e.scheduled_for),
    sent_at: at(e.sent_at),
    delivered_at: at(e.delivered_at),
    opened_at: at(e.opened_at),
    clicked_at: at(e.clicked_at),
    replied_at: at(e.replied_at),
    bounced_at: at(e.bounced_at),
    open_count: e.opens,
    click_count: e.clicks,
  }
}

/** Uloží e-maily. Čas, který už jednou přišel, chybějící hodnota nesmaže. Bez migrace 119 nic. */
export async function upsertOutreachEmails(records: ReturnType<typeof emailRecord>[]): Promise<number> {
  if (records.length === 0) return 0
  const unique = [...new Map(records.map((r) => [String(r.external_id), r])).values()]
  const keep = (c: string) => `${c} = coalesce(EXCLUDED.${c}, outreach_emails.${c})`
  try {
    const [saved] = await adminDb.batch([
      {
        text: `
          INSERT INTO outreach_emails (${EMAIL_COLUMNS.join(', ')})
          SELECT ${EMAIL_COLUMNS.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${EMAIL_RECORD})
          ON CONFLICT (external_id) DO UPDATE SET
            lead_external_id = EXCLUDED.lead_external_id,
            kind = EXCLUDED.kind,
            ${['status', 'subject', 'body_text', 'scheduled_for', 'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'replied_at', 'bounced_at'].map(keep).join(',\n            ')},
            open_count = greatest(EXCLUDED.open_count, outreach_emails.open_count),
            click_count = greatest(EXCLUDED.click_count, outreach_emails.click_count),
            received_at = now()
          RETURNING external_id`,
        params: [JSON.stringify(unique)],
      },
    ])
    return saved.length
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return 0
    throw err
  }
}

/** Denní úklid e-mailů po 12 měsících (cron client-retention). Bez migrace 119 nic. */
export async function purgeOutreachEmails(): Promise<number | null> {
  try {
    const rows = await adminDb<{ n: number }>`SELECT purge_outreach_emails() AS n`
    return rows[0] ? Number(rows[0].n) : null
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === '42883' || code === '42P01') return null
    throw err
  }
}
