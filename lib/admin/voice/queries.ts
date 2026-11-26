import 'server-only'
import { adminDb, q, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import { VOICE_CATEGORIES, type VoiceCategory } from './categories'
import { DEVICES_SQL, isMissingVoiceSchema, toDevice, type DeviceRow, type VoiceDevice } from './devices'
import { isDictationStatus, type DictationStatus } from './labels'
import {
  COUNTED_STATUSES,
  WPM_MIN_SPEECH_MS,
  fillDays,
  heatmapFrom,
  heatmapWeeks,
  mondayOf,
  percentile,
  pragueDayStart,
  savedMinutes,
  sharePercent,
  streaks,
  sumDays,
  wpm,
  type DayRow,
  type HeatWeek,
} from './stats'
import { parseSettings, type VoiceSettings } from './store'

/**
 * ZakazIQ Voice (R-148): čtení pro admin `/dashboard/voice`, kartu na Dnes
 * a `GET /api/public/voice/stats`. Každá obrazovka je jedna dávka (R-092).
 * Podmínky porovnávají okamžiky (`started_at >= $1`) spočítané v TypeScriptu,
 * pražský den se počítá jen v SELECTu (R-093). Text diktátu se nikdy neloguje.
 */

// Konstanta, ne vstup — smí do textu dotazu.
const COUNTED = `status IN (${COUNTED_STATUSES.map((s) => `'${s}'`).join(', ')})`
const PRAGUE_DAY = `to_char((started_at AT TIME ZONE 'Europe/Prague')::date, 'YYYY-MM-DD')`
const SPEECH = 'coalesce(speech_ms, duration_ms)'

const SETTINGS_SQL = q`SELECT key, value FROM voice_settings`
const PENDING_SQL = q`SELECT count(*)::int AS n FROM voice_suggestions WHERE status = 'pending'`

export type VoiceLoad<T> = { ok: true; data: T; pending: number } | { ok: false; reason: 'missing_tables' }

/** Dávka + počet návrhů ke schválení (odznak záložky Učení). Bez migrace 136 `missing_tables`. */
async function load<T>(queries: AdminQuery[], map: (rows: AdminRow[][]) => T): Promise<VoiceLoad<T>> {
  try {
    const rows = await adminDb.batch([...queries, PENDING_SQL])
    const pending = Number((rows[rows.length - 1][0] as { n?: number } | undefined)?.n ?? 0)
    return { ok: true, data: map(rows.slice(0, -1)), pending }
  } catch (err) {
    if (isMissingVoiceSchema(err)) return { ok: false, reason: 'missing_tables' }
    throw err
  }
}

// --- Slova po dnech -----------------------------------------------------------

const aggregates = `
  coalesce(sum(words) FILTER (WHERE ${COUNTED}), 0)::int AS words,
  coalesce(sum(${SPEECH}) FILTER (WHERE ${COUNTED}), 0)::bigint AS ms,
  coalesce(sum(words) FILTER (WHERE ${COUNTED} AND ${SPEECH} >= ${WPM_MIN_SPEECH_MS}), 0)::int AS wpm_words,
  coalesce(sum(${SPEECH}) FILTER (WHERE ${COUNTED} AND ${SPEECH} >= ${WPM_MIN_SPEECH_MS}), 0)::bigint AS wpm_ms,
  count(*) FILTER (WHERE ${COUNTED} AND words > 0)::int AS n,
  coalesce(sum(words_corrected + dictionary_fixes) FILTER (WHERE ${COUNTED}), 0)::int AS fixes,
  coalesce(sum(cost_usd), 0)::float8 AS cost`

type AggRow = { day?: string; words: number; ms: number | string; wpm_words: number; wpm_ms: number | string; n: number; fixes: number; cost: number | string }

const toDay = (r: AggRow, day = r.day ?? ''): DayRow => ({
  day,
  words: Number(r.words),
  ms: Number(r.ms),
  wpmWords: Number(r.wpm_words),
  wpmMs: Number(r.wpm_ms),
  dictations: Number(r.n),
  fixes: Number(r.fixes),
  costUsd: Number(r.cost),
})

/** Dny od `from` do `to` včetně (pražské dny → okamžiky). */
const dailyQuery = (from: string, to: string): AdminQuery => ({
  text: `SELECT ${PRAGUE_DAY} AS day, ${aggregates}
         FROM voice_dictations WHERE started_at >= $1 AND started_at < $2
         GROUP BY 1 ORDER BY 1`,
  params: [pragueDayStart(from), pragueDayStart(addIsoDays(to, 1))],
})

const TOTALS_SQL: AdminQuery = { text: `SELECT ${aggregates} FROM voice_dictations`, params: [] }

const ACTIVE_DAYS_SQL: AdminQuery = {
  text: `SELECT DISTINCT ${PRAGUE_DAY} AS day FROM voice_dictations WHERE ${COUNTED} AND words > 0`,
  params: [],
}

const days = (rows: AdminRow[]): string[] => (rows as { day: string }[]).map((r) => r.day)

// --- Karta na Dnes ------------------------------------------------------------

export interface VoiceToday {
  words: number
  streak: number
}

/**
 * Jeden dotaz do dávky Dnes (`loadTodayScreen`): dnešní slova a dny se slovy
 * za 400 dní (stačí na aktuální sérii). Vrací vždy jeden řádek.
 */
export function voiceTodayQuery(today: string): AdminQuery {
  return {
    text: `SELECT coalesce(sum(words) FILTER (WHERE started_at >= $1), 0)::int AS today,
                  coalesce(array_agg(DISTINCT ${PRAGUE_DAY}), '{}') AS days
           FROM voice_dictations
           WHERE started_at >= $2 AND ${COUNTED} AND words > 0`,
    params: [pragueDayStart(today), pragueDayStart(addIsoDays(today, -400))],
  }
}

/** Bez migrace 136 (prázdná odpověď `batchTolerant`) nebo bez jediného diktátu `null` = karta se neukáže. */
export function mapVoiceToday(rows: AdminRow[] | undefined, today: string): VoiceToday | null {
  const row = rows?.[0] as { today?: number; days?: string[] | null } | undefined
  const active = row?.days ?? []
  if (!row || !active.length) return null
  return { words: Number(row.today ?? 0), streak: streaks(active, today).current }
}

// --- Přehled ------------------------------------------------------------------

export interface VoiceOverview {
  today: string
  settings: VoiceSettings
  todayWords: number
  weekWords: number
  total: { words: number; dictations: number; wpm: number | null; savedMinutes: number; fixes: number }
  streak: { current: number; longest: number }
  last30: DayRow[]
  heatmap: HeatWeek[]
  categories: { category: VoiceCategory; words: number; share: number | null }[]
  apps: { name: string; words: number; dictations: number }[]
  /** Slova podle hodiny dne (0–23) za 30 dní. */
  hours: number[]
  /** Podíl diktátů opravených po vložení po týdnech — měřítko učení. */
  editShare: { week: string; edited: number; dictations: number; percent: number | null }[]
  statuses: Partial<Record<DictationStatus, number>>
  guards: { code: string; count: number }[]
  latency: { p50: number | null; p95: number | null; samples: number }
  cost: { today: number; month: number }
}

export const EDIT_WEEKS = 12

export function overviewQueries(today: string): AdminQuery[] {
  const from30 = pragueDayStart(addIsoDays(today, -29))
  const fromWeeks = pragueDayStart(addIsoDays(mondayOf(today), -(EDIT_WEEKS - 1) * 7))
  return [
    SETTINGS_SQL,
    dailyQuery(heatmapFrom(today), today),
    ACTIVE_DAYS_SQL,
    TOTALS_SQL,
    {
      text: `SELECT category, coalesce(sum(words), 0)::int AS words FROM voice_dictations
             WHERE started_at >= $1 AND ${COUNTED} GROUP BY category ORDER BY words DESC`,
      params: [from30],
    },
    {
      text: `SELECT coalesce(nullif(app_name, ''), app_bundle_id, 'Neznámá aplikace') AS name,
                    coalesce(sum(words), 0)::int AS words, count(*) FILTER (WHERE words > 0)::int AS n
             FROM voice_dictations WHERE started_at >= $1 AND ${COUNTED}
             GROUP BY 1 ORDER BY words DESC, name LIMIT 8`,
      params: [from30],
    },
    {
      text: `SELECT extract(hour FROM started_at AT TIME ZONE 'Europe/Prague')::int AS h, coalesce(sum(words), 0)::int AS words
             FROM voice_dictations WHERE started_at >= $1 AND ${COUNTED} GROUP BY 1`,
      params: [from30],
    },
    {
      text: `SELECT to_char(date_trunc('week', started_at AT TIME ZONE 'Europe/Prague'), 'YYYY-MM-DD') AS week,
                    count(*) FILTER (WHERE user_edits > 0)::int AS edited, count(*)::int AS n
             FROM voice_dictations WHERE started_at >= $1 AND status IN ('ok', 'raw') AND words > 0
             GROUP BY 1 ORDER BY 1`,
      params: [fromWeeks],
    },
    q`SELECT status, count(*)::int AS n FROM voice_dictations WHERE started_at >= ${from30} GROUP BY status`,
    q`SELECT g AS code, count(*)::int AS n FROM voice_dictations, unnest(guards) AS g
      WHERE started_at >= ${from30} GROUP BY g ORDER BY n DESC, g LIMIT 30`,
    {
      text: `SELECT total_ms FROM voice_dictations
             WHERE started_at >= $1 AND ${COUNTED} AND total_ms IS NOT NULL
             ORDER BY started_at DESC LIMIT 2000`,
      params: [from30],
    },
  ]
}

export function mapOverview(rows: AdminRow[][], today: string): VoiceOverview {
  const [settingsRows, dayRows, activeRows, totalRows, catRows, appRows, hourRows, weekRows, statusRows, guardRows, latRows] = rows
  const settings = parseSettings(settingsRows as { key: string; value: unknown }[])
  const filled = fillDays((dayRows as AggRow[]).map((r) => toDay(r)), heatmapFrom(today), today)
  const last30 = filled.filter((d) => d.day >= addIsoDays(today, -29))
  const total = toDay((totalRows[0] as AggRow | undefined) ?? { words: 0, ms: 0, wpm_words: 0, wpm_ms: 0, n: 0, fixes: 0, cost: 0 })
  const catTotal = (catRows as { words: number }[]).reduce((s, r) => s + Number(r.words), 0)
  const hours = Array.from({ length: 24 }, () => 0)
  for (const r of hourRows as { h: number; words: number }[]) if (r.h >= 0 && r.h < 24) hours[Number(r.h)] = Number(r.words)
  const latency = (latRows as { total_ms: number }[]).map((r) => Number(r.total_ms))
  const monthStart = `${today.slice(0, 7)}-01`

  return {
    today,
    settings,
    todayWords: filled.find((d) => d.day === today)?.words ?? 0,
    weekWords: sumDays(filled.filter((d) => d.day > addIsoDays(today, -7))).words,
    total: {
      words: total.words,
      dictations: total.dictations,
      wpm: wpm(total.wpmWords, total.wpmMs),
      savedMinutes: savedMinutes(total.words, total.ms, settings.typingWpm),
      fixes: total.fixes,
    },
    streak: streaks(days(activeRows), today),
    last30,
    heatmap: heatmapWeeks(filled, today),
    categories: (catRows as { category: string; words: number }[])
      .filter((r) => (VOICE_CATEGORIES as readonly string[]).includes(r.category) && Number(r.words) > 0)
      .map((r) => ({ category: r.category as VoiceCategory, words: Number(r.words), share: sharePercent(Number(r.words), catTotal) })),
    apps: (appRows as { name: string; words: number; n: number }[])
      .filter((r) => Number(r.words) > 0)
      .map((r) => ({ name: r.name, words: Number(r.words), dictations: Number(r.n) })),
    hours,
    editShare: (weekRows as { week: string; edited: number; n: number }[]).map((r) => ({
      week: r.week,
      edited: Number(r.edited),
      dictations: Number(r.n),
      percent: sharePercent(Number(r.edited), Number(r.n)),
    })),
    statuses: Object.fromEntries(
      (statusRows as { status: string; n: number }[]).filter((r) => isDictationStatus(r.status)).map((r) => [r.status, Number(r.n)]),
    ),
    guards: (guardRows as { code: string; n: number }[]).map((r) => ({ code: r.code, count: Number(r.n) })),
    latency: { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95), samples: latency.length },
    cost: {
      today: filled.find((d) => d.day === today)?.costUsd ?? 0,
      month: sumDays(filled.filter((d) => d.day >= monthStart)).costUsd,
    },
  }
}

export async function loadVoiceOverview(today = getPragueTodayISO()): Promise<VoiceLoad<VoiceOverview>> {
  return load(overviewQueries(today), (rows) => mapOverview(rows, today))
}

// --- Okno na Macu (GET /stats) -------------------------------------------------

export const STATS_RANGES = ['7d', '30d', 'all'] as const
export type StatsRange = (typeof STATS_RANGES)[number]

export interface MacStats {
  range: StatsRange
  today: number
  week: number
  words: number
  dictations: number
  streak: number
  longestStreak: number
  wpm: number | null
  /** Ušetřený čas za období v minutách. */
  timeSaved: number
  daily: { day: string; words: number }[]
}

const RANGE_DAYS: Record<StatsRange, number> = { '7d': 7, '30d': 30, all: 365 }

/** Tatáž čísla jako admin. U `all` jsou součty za celou historii, řada dnů za rok. */
export async function loadMacStats(range: StatsRange, today = getPragueTodayISO()): Promise<MacStats> {
  const from = addIsoDays(today, -(RANGE_DAYS[range] - 1))
  const [settingsRows, dayRows, activeRows, totalRows] = await adminDb.batch([
    SETTINGS_SQL,
    dailyQuery(addIsoDays(today, -Math.max(6, RANGE_DAYS[range] - 1)), today),
    ACTIVE_DAYS_SQL,
    TOTALS_SQL,
  ])
  const settings = parseSettings(settingsRows as { key: string; value: unknown }[])
  const filled = fillDays((dayRows as AggRow[]).map((r) => toDay(r)), addIsoDays(today, -Math.max(6, RANGE_DAYS[range] - 1)), today)
  const inRange = filled.filter((d) => d.day >= from)
  const sum = range === 'all' ? toDay((totalRows[0] as AggRow | undefined) ?? { words: 0, ms: 0, wpm_words: 0, wpm_ms: 0, n: 0, fixes: 0, cost: 0 }) : sumDays(inRange)
  const s = streaks(days(activeRows), today)
  return {
    range,
    today: filled.find((d) => d.day === today)?.words ?? 0,
    week: sumDays(filled.filter((d) => d.day > addIsoDays(today, -7))).words,
    words: sum.words,
    dictations: sum.dictations,
    streak: s.current,
    longestStreak: s.longest,
    wpm: wpm(sum.wpmWords, sum.wpmMs),
    timeSaved: savedMinutes(sum.words, sum.ms, settings.typingWpm),
    daily: inRange.map((d) => ({ day: d.day, words: d.words })),
  }
}

// --- Historie -----------------------------------------------------------------

export const HISTORY_LIMIT = 100
export const SEARCH_MAX = 100

export interface HistoryFilter {
  /** Hledaný text (v přepisu, výsledku, opravě i názvu aplikace). */
  query: string | null
  status: DictationStatus | null
}

export interface HistoryItem {
  id: string
  startedAt: string
  appName: string | null
  category: VoiceCategory
  status: DictationStatus
  guards: string[]
  words: number
  durationMs: number
  totalMs: number | null
  rawText: string | null
  finalText: string | null
  editedText: string | null
  userEdits: number
  fixes: number
  textPurged: boolean
}

/** `%` a `_` z hledání jsou obyčejné znaky, ne zástupné (ILIKE … ESCAPE '\'). */
export const likePattern = (query: string): string => `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** Podmínka filtru pro výpis, počet i mazání podle hledání — jedna, ať se nerozejdou. */
export function historyWhere(filter: HistoryFilter, first = 1): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    params.push(filter.status)
    parts.push(`status = $${first + params.length - 1}`)
  }
  if (filter.query) {
    params.push(likePattern(filter.query))
    const p = `$${first + params.length - 1}`
    parts.push(
      `(raw_text ILIKE ${p} ESCAPE '\\' OR final_text ILIKE ${p} ESCAPE '\\' OR edited_text ILIKE ${p} ESCAPE '\\' OR app_name ILIKE ${p} ESCAPE '\\')`,
    )
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

type HistoryRow = {
  id: string
  started_at: Date | string
  app_name: string | null
  app_bundle_id: string | null
  category: string
  status: string
  guards: string[] | null
  words: number
  duration_ms: number
  total_ms: number | null
  raw_text: string | null
  final_text: string | null
  edited_text: string | null
  user_edits: number
  fixes: number
  text_purged_at: Date | string | null
}

export async function loadVoiceHistory(filter: HistoryFilter): Promise<VoiceLoad<{ items: HistoryItem[]; matching: number; storeText: boolean }>> {
  const where = historyWhere(filter)
  return load(
    [
      {
        text: `SELECT id::text, started_at, app_name, app_bundle_id, category, status, guards, words, duration_ms, total_ms,
                      raw_text, final_text, edited_text, user_edits, (words_corrected + dictionary_fixes)::int AS fixes, text_purged_at
               FROM voice_dictations ${where.sql}
               ORDER BY started_at DESC LIMIT ${HISTORY_LIMIT}`,
        params: where.params,
      },
      { text: `SELECT count(*)::int AS n FROM voice_dictations ${where.sql}`, params: where.params },
      SETTINGS_SQL,
    ],
    ([rows, count, settingsRows]) => ({
      storeText: parseSettings(settingsRows as { key: string; value: unknown }[]).storeText,
      matching: Number((count[0] as { n?: number } | undefined)?.n ?? 0),
      items: (rows as HistoryRow[]).map((r) => ({
        id: r.id,
        startedAt: new Date(r.started_at).toISOString(),
        appName: r.app_name || r.app_bundle_id,
        category: (VOICE_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as VoiceCategory) : 'other',
        status: isDictationStatus(r.status) ? r.status : 'error',
        guards: r.guards ?? [],
        words: Number(r.words),
        durationMs: Number(r.duration_ms),
        totalMs: r.total_ms === null ? null : Number(r.total_ms),
        rawText: r.raw_text,
        finalText: r.final_text,
        editedText: r.edited_text,
        userEdits: Number(r.user_edits),
        fixes: Number(r.fixes),
        textPurged: r.text_purged_at !== null,
      })),
    }),
  )
}

// --- Učení --------------------------------------------------------------------

export type SuggestionKind = 'term' | 'blocklist' | 'rule'

export interface SuggestionExample {
  id: string
  at: string
  before: string | null
  after: string | null
}

export interface PendingSuggestion {
  id: string
  kind: SuggestionKind
  /** Co se přidá: slovo, fráze nebo pravidlo. */
  title: string
  /** U slova: jak ho přepis slyší. */
  heardAs: string[]
  evidence: number
  reason: string | null
  source: 'rules' | 'ai'
  createdAt: string
  examples: SuggestionExample[]
}

export interface LearnedTerm {
  id: string
  term: string
  heardAs: string[]
  uses: number
  createdAt: string
}

export interface VoiceLearning {
  suggestions: PendingSuggestion[]
  learned: LearnedTerm[]
  /** Kdy naposledy proběhl rozbor (zapisuje učení, VO08). */
  lastReviewAt: string | null
  autoLearn: boolean
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function suggestionTitle(kind: SuggestionKind, payload: Record<string, unknown>): string {
  const v = kind === 'term' ? payload.term : kind === 'blocklist' ? payload.phrase : payload.text
  return typeof v === 'string' ? v : ''
}

export async function loadVoiceLearning(): Promise<VoiceLoad<VoiceLearning>> {
  return load(
    [
      SETTINGS_SQL,
      q`
        SELECT s.id::text, s.kind, s.payload, s.evidence, s.reason, s.source, s.created_at,
               coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', d.id, 'at', d.started_at,
                          'before', coalesce(d.final_text, d.raw_text), 'after', d.edited_text) ORDER BY d.started_at DESC)
                   FROM (SELECT id, started_at, final_text, raw_text, edited_text FROM voice_dictations
                          WHERE id = ANY(s.examples) ORDER BY started_at DESC LIMIT 3) d
               ), '[]'::jsonb) AS examples
        FROM voice_suggestions s
        WHERE s.status = 'pending'
        ORDER BY s.evidence DESC, s.created_at DESC
        LIMIT 50
      `,
      q`SELECT id::text, term, heard_as, uses, created_at FROM voice_terms
        WHERE kind = 'term' AND source = 'learned' ORDER BY created_at DESC LIMIT 100`,
    ],
    ([settingsRows, sugRows, learnedRows]) => {
      const raw = new Map((settingsRows as { key: string; value: unknown }[]).map((r) => [r.key, r.value]))
      const review = raw.get('last_review_at')
      return {
        autoLearn: parseSettings(settingsRows as { key: string; value: unknown }[]).autoLearnTerms,
        lastReviewAt: typeof review === 'string' && Number.isFinite(Date.parse(review)) ? new Date(review).toISOString() : null,
        suggestions: (
          sugRows as {
            id: string
            kind: SuggestionKind
            payload: Record<string, unknown> | null
            evidence: number
            reason: string | null
            source: 'rules' | 'ai'
            created_at: Date | string
            examples: { id: string; at: string; before: string | null; after: string | null }[] | null
          }[]
        ).map((r) => ({
          id: r.id,
          kind: r.kind,
          title: suggestionTitle(r.kind, r.payload ?? {}),
          heardAs: r.kind === 'term' ? strings(r.payload?.heardAs) : [],
          evidence: Number(r.evidence),
          reason: r.reason,
          source: r.source,
          createdAt: new Date(r.created_at).toISOString(),
          examples: (r.examples ?? []).map((e) => ({ id: e.id, at: new Date(e.at).toISOString(), before: e.before, after: e.after })),
        })),
        learned: (learnedRows as { id: string; term: string; heard_as: string[] | null; uses: number; created_at: Date | string }[]).map((r) => ({
          id: r.id,
          term: r.term,
          heardAs: r.heard_as ?? [],
          uses: Number(r.uses),
          createdAt: new Date(r.created_at).toISOString(),
        })),
      }
    },
  )
}

// --- Slovník ------------------------------------------------------------------

export interface DictionaryTerm {
  id: string
  term: string
  heardAs: string[]
  uses: number
  source: 'manual' | 'learned'
}

export interface DictionarySnippet {
  id: string
  trigger: string
  expansion: string
  uses: number
}

export interface VoiceRuleItem {
  id: string
  text: string
  mode: 'always' | 'alone'
  active: boolean
  source: 'manual' | 'learned' | 'builtin'
}

export interface VoiceDictionary {
  terms: DictionaryTerm[]
  snippets: DictionarySnippet[]
  rules: VoiceRuleItem[]
  blocklist: VoiceRuleItem[]
}

export async function loadVoiceDictionary(): Promise<VoiceLoad<VoiceDictionary>> {
  return load(
    [
      q`SELECT id::text, kind, term, heard_as, expansion, source, uses FROM voice_terms ORDER BY lower(term) LIMIT 500`,
      q`SELECT id::text, kind, text, mode, active, source FROM voice_rules ORDER BY source = 'builtin', created_at DESC LIMIT 300`,
    ],
    ([termRows, ruleRows]) => {
      const terms = termRows as { id: string; kind: string; term: string; heard_as: string[] | null; expansion: string | null; source: 'manual' | 'learned'; uses: number }[]
      const rules = (ruleRows as { id: string; kind: string; text: string; mode: 'always' | 'alone'; active: boolean; source: VoiceRuleItem['source'] }[]).map(
        (r) => ({ kind: r.kind, item: { id: r.id, text: r.text, mode: r.mode, active: r.active, source: r.source } }),
      )
      return {
        terms: terms
          .filter((t) => t.kind === 'term')
          .map((t) => ({ id: t.id, term: t.term, heardAs: t.heard_as ?? [], uses: Number(t.uses), source: t.source })),
        snippets: terms
          .filter((t) => t.kind === 'snippet' && t.expansion)
          .map((t) => ({ id: t.id, trigger: t.term, expansion: t.expansion as string, uses: Number(t.uses) })),
        rules: rules.filter((r) => r.kind === 'rule').map((r) => r.item),
        blocklist: rules.filter((r) => r.kind === 'blocklist').map((r) => r.item),
      }
    },
  )
}

// --- Nastavení ----------------------------------------------------------------

export async function loadVoiceSettingsTab(): Promise<VoiceLoad<{ settings: VoiceSettings; devices: VoiceDevice[]; dictations: number }>> {
  return load([SETTINGS_SQL, DEVICES_SQL, q`SELECT count(*)::int AS n FROM voice_dictations`], ([settingsRows, deviceRows, countRows]) => ({
    settings: parseSettings(settingsRows as { key: string; value: unknown }[]),
    devices: (deviceRows as DeviceRow[]).map(toDevice),
    dictations: Number((countRows[0] as { n?: number } | undefined)?.n ?? 0),
  }))
}
