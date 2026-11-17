import 'server-only'
import { adminDb } from '@/lib/admin/db'
import type { ReportCallPayload, ReportPayload } from '@/types/outreach-report'
import type { AnalysisCall, DayReport, DayTrend } from '@/lib/admin/outreach-analysis'

/**
 * Denní reporty hovorů z Growth OS (R-118).
 *
 * Growth OS posílá report po každém kole a po posledním kole souhrn dne.
 * Report i hovory se ukládají upsertem, takže opakované poslání nic nezdvojí.
 * Hovor se přepíše novější verzí (výsledek mohl mezi koly dorazit).
 *
 * Přepis a shrnutí jsou texty o skutečných lidech: jen text, nikdy HTML.
 */

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function day(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}

const CALL_COLUMNS = [
  'external_id', 'lead_external_id', 'company_name', 'report_date', 'round', 'called_at', 'result',
  'duration_s', 'who_hung_up', 'hangup_at_s', 'intro_s', 'termination_reason', 'chance_level',
  'chance_why', 'chance_action', 'summary', 'objections', 'failed_criteria', 'segment', 'industry',
  'opening_variant', 'transcript',
] as const

const CALL_RECORD = `
  external_id text, lead_external_id text, company_name text, report_date date, round integer,
  called_at timestamptz, result text, duration_s numeric, who_hung_up text, hangup_at_s numeric,
  intro_s numeric, termination_reason text, chance_level text, chance_why jsonb, chance_action text,
  summary text, objections jsonb, failed_criteria jsonb, segment text, industry text,
  opening_variant text, transcript jsonb`

function callRecord(date: string, c: ReportCallPayload): Record<(typeof CALL_COLUMNS)[number], unknown> {
  return {
    external_id: c.external_id,
    lead_external_id: c.lead_external_id,
    company_name: c.company,
    report_date: date,
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
    objections: c.objections,
    failed_criteria: c.failed_criteria,
    segment: c.segment ?? null,
    industry: c.industry ?? null,
    opening_variant: c.opening_variant ?? null,
    transcript: c.transcript && c.transcript.length ? c.transcript : null,
  }
}

// Přepis staršího než 90 dní (úklid ho už smazal, nebo by ho smazal) se
// pozdním reportem ani dotažením historie neuloží.
const TRANSCRIPT_IN_RETENTION = `CASE WHEN report_date < (now() AT TIME ZONE 'Europe/Prague')::date - 90
  THEN NULL ELSE transcript END`

/** Uloží report a jeho hovory jedním požadavkem (transakce). Vrací počet uložených hovorů. */
export async function ingestOutreachReport(payload: ReportPayload): Promise<{ calls: number }> {
  const r = payload.report
  // Stejný hovor dvakrát v jedné dávce by ON CONFLICT odmítl — vyhrává poslední.
  const byId = new Map(payload.calls.map((c) => [c.external_id, c]))
  const calls = [...byId.values()].map((c) => callRecord(r.date, c))

  const [, saved] = await adminDb.batch([
    {
      text: `
        INSERT INTO outreach_reports (report_date, round, subject, stats, rounds, segments, criteria, generated_at)
        VALUES ($1::date, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::timestamptz)
        ON CONFLICT (report_date, round) DO UPDATE SET
          subject = EXCLUDED.subject, stats = EXCLUDED.stats, rounds = EXCLUDED.rounds,
          segments = EXCLUDED.segments, criteria = EXCLUDED.criteria,
          generated_at = EXCLUDED.generated_at, received_at = now()
        WHERE outreach_reports.generated_at <= EXCLUDED.generated_at`,
      params: [
        r.date,
        r.round ?? 0,
        r.subject,
        JSON.stringify(r.stats),
        JSON.stringify(r.rounds),
        JSON.stringify(r.segments),
        JSON.stringify(r.criteria),
        new Date(r.generated_at).toISOString(),
      ],
    },
    {
      text: `
        INSERT INTO outreach_calls (${CALL_COLUMNS.join(', ')})
        SELECT ${CALL_COLUMNS.map((c) => (c === 'transcript' ? TRANSCRIPT_IN_RETENTION : c)).join(', ')}
          FROM jsonb_to_recordset($1::jsonb) AS x(${CALL_RECORD})
        ON CONFLICT (external_id) DO UPDATE SET
          ${CALL_COLUMNS.filter((c) => c !== 'external_id' && c !== 'transcript').map((c) => `${c} = EXCLUDED.${c}`).join(',\n          ')},
          transcript = EXCLUDED.transcript,
          received_at = now()
        RETURNING external_id`,
      params: [JSON.stringify(calls)],
    },
  ])
  return { calls: (saved as unknown[]).length }
}

// ─── Čtení ───────────────────────────────────────────────────────────────────

export type ReportListItem = {
  date: string
  round: number
  subject: string
  stats: DayReport['stats']
  receivedAt: string
}

export type ReportsScreen = { available: boolean; days: ReportListItem[] }

/**
 * Seznam dnů: za každý den nejnovější report (souhrn dne, jinak poslední
 * průběžný po kole).
 */
export async function loadReportDays(limit = 60): Promise<ReportsScreen> {
  try {
    const [rows] = await adminDb.batch([
      {
        text: `
          SELECT DISTINCT ON (report_date) report_date, round, subject, stats, received_at
            FROM outreach_reports
           ORDER BY report_date DESC, (round = 0) DESC, round DESC
           LIMIT $1`,
        params: [limit],
      },
    ])
    return {
      available: true,
      days: rows.map((r) => ({
        date: day(r.report_date),
        round: Number(r.round),
        subject: String(r.subject),
        stats: json(r.stats, {} as DayReport['stats']),
        receivedAt: iso(r.received_at) ?? '',
      })),
    }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return { available: false, days: [] }
    throw err
  }
}

function toCall(r: Record<string, unknown>): AnalysisCall {
  return {
    id: String(r.external_id),
    leadId: String(r.lead_external_id),
    company: String(r.company_name),
    date: day(r.report_date),
    round: num(r.round),
    calledAt: iso(r.called_at),
    result: String(r.result),
    durationS: num(r.duration_s),
    whoHungUp: r.who_hung_up ? String(r.who_hung_up) : null,
    hangupAtS: num(r.hangup_at_s),
    introS: num(r.intro_s),
    terminationReason: r.termination_reason ? String(r.termination_reason) : null,
    chanceLevel: r.chance_level ? String(r.chance_level) : null,
    chanceWhy: json<string[]>(r.chance_why, []),
    chanceAction: r.chance_action ? String(r.chance_action) : null,
    summary: r.summary ? String(r.summary) : null,
    objections: json<string[]>(r.objections, []),
    failedCriteria: json<{ id: string; name: string; rationale?: string | null }[]>(r.failed_criteria, []),
    segment: r.segment ? String(r.segment) : null,
    industry: r.industry ? String(r.industry) : null,
    openingVariant: r.opening_variant ? String(r.opening_variant) : null,
    transcript: json<AnalysisCall['transcript']>(r.transcript, null),
  }
}

const CALL_SELECT = `
  external_id, lead_external_id, company_name, report_date, round, called_at, result, duration_s,
  who_hung_up, hangup_at_s, intro_s, termination_reason, chance_level, chance_why, chance_action,
  summary, objections, failed_criteria, segment, industry, opening_variant, transcript`

/** Detail dne: nejnovější report toho dne a všechny jeho hovory. */
export async function loadReportDay(date: string): Promise<DayReport | null> {
  const [reports, calls] = await adminDb.batch([
    {
      text: `
        SELECT report_date, round, subject, stats, rounds, segments, criteria, received_at
          FROM outreach_reports WHERE report_date = $1::date
         ORDER BY (round = 0) DESC, round DESC LIMIT 1`,
      params: [date],
    },
    {
      text: `SELECT ${CALL_SELECT} FROM outreach_calls WHERE report_date = $1::date
              ORDER BY called_at NULLS LAST, external_id`,
      params: [date],
    },
  ])
  const r = reports[0]
  if (!r) return null
  return {
    date: day(r.report_date),
    round: Number(r.round),
    subject: String(r.subject),
    stats: json(r.stats, {} as DayReport['stats']),
    rounds: json(r.rounds, []),
    segments: json(r.segments, {}),
    criteria: json(r.criteria, []),
    receivedAt: iso(r.received_at) ?? '',
    calls: calls.map(toCall),
  }
}

export type AnalysisInput = { available: boolean; calls: AnalysisCall[]; trend: DayTrend[] }

/** Hovory a denní čísla za posledních `days` dní (pražský kalendář). */
export async function loadAnalysisInput(days: number): Promise<AnalysisInput> {
  try {
    const [calls, trend] = await adminDb.batch([
      {
        text: `SELECT ${CALL_SELECT} FROM outreach_calls
                WHERE report_date > (now() AT TIME ZONE 'Europe/Prague')::date - $1::int
                ORDER BY report_date, called_at NULLS LAST`,
        params: [days],
      },
      {
        text: `
          SELECT DISTINCT ON (report_date) report_date, stats
            FROM outreach_reports
           WHERE report_date > (now() AT TIME ZONE 'Europe/Prague')::date - $1::int
           ORDER BY report_date, (round = 0) DESC, round DESC`,
        params: [days],
      },
    ])
    return {
      available: true,
      calls: calls.map(toCall),
      trend: trend.map((r) => {
        const s = json<Record<string, unknown>>(r.stats, {})
        return {
          date: day(r.report_date),
          calls: Number(s.calls) || 0,
          connected: Number(s.connected) || 0,
          accepted: Number(s.accepted) || 0,
        }
      }),
    }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return { available: false, calls: [], trend: [] }
    throw err
  }
}

/** Denní úklid osobních údajů (cron client-retention). Bez migrace 116 nic nedělá. */
export async function purgeOutreachRetention(): Promise<{ transcripts: number; calls: number } | null> {
  try {
    const rows = await adminDb<{ transcripts: number; calls: number }>`SELECT * FROM purge_outreach_retention()`
    return rows[0] ?? null
  } catch (err) {
    if ((err as { code?: string })?.code === '42883' || (err as { code?: string })?.code === '42P01') return null
    throw err
  }
}
