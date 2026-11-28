import 'server-only'
import { adminDb } from '@/lib/admin/db'
import type { ReportPayload } from '@/types/outreach-report'
import { callRecord, callsUpsertQuery } from '@/lib/admin/outreach-calls'
import type { AnalysisCall, DayReport, DayTrend } from '@/lib/admin/outreach-analysis'
import { pgDate } from '@/lib/pg-date'

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
  return pgDate(v) ?? ''
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

/**
 * Uloží report a jeho hovory jedním požadavkem (transakce). Vrací počet
 * uložených hovorů. Bez migrace 119 se hovory uloží bez údajů v2.
 */
export async function ingestOutreachReport(payload: ReportPayload): Promise<{ calls: number }> {
  const r = payload.report
  const calls = payload.calls.map((c) =>
    callRecord(c, { leadExternalId: c.lead_external_id, company: c.company, date: r.date }),
  )
  const reportQuery = {
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
  }

  const run = async (extras: boolean) => {
    const [, saved] = await adminDb.batch([reportQuery, callsUpsertQuery(calls, { extras })])
    return { calls: (saved as unknown[]).length }
  }
  try {
    return await run(true)
  } catch (err) {
    if ((err as { code?: string })?.code !== '42703') throw err
    return run(false)
  }
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
