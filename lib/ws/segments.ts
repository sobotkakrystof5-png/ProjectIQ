import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import { daysBetween, pragueParts } from './time'
import type { SegmentKey } from './today'

// Skupiny zákazníků (S12, R-025, R-046): Noví, Stálí, Jednorázoví, Spící,
// Ukončení. Počítají se pro dvojici zákazník × byznys z návštěv a zakázek,
// hranice má každý byznys v ws.segment_rules (výchozí ze šablony oboru).
//
// Pořadí vyhodnocení (plán): Ukončení → Noví → Spící → Stálí → Jednorázoví.
// Všechno se měří v pražských kalendářních dnech — návštěva ve 23:30 je
// v Praze ještě ten den, i když v UTC už je další.
//
// Klasifikace je čistá funkce (classifySegment), DB jen dodá dny návštěv
// a uloží výsledek. Přepočet po návštěvě (akce) a denně cronem (Spící
// vznikají plynutím času).

export type SegmentRules = {
  newDays: number
  regularMinVisits: number
  regularWindowDays: number
  dormantFactor: number
  dormantMinDays: number
}

/** Výchozí hodnoty migrace 070 (kadeřnictví). Nový byznys je má ze šablony oboru. */
export const DEFAULT_SEGMENT_RULES: SegmentRules = {
  newDays: 30,
  regularMinVisits: 3,
  regularWindowDays: 365,
  dormantFactor: 2,
  dormantMinDays: 56,
}

export type SegmentInput = {
  /** Pražské dny návštěv (YYYY-MM-DD), na pořadí a duplicitách nezáleží. */
  visitDays: readonly string[]
  /** Den, kdy zákazník poprvé přišel do systému (poptávka, rezervace). */
  createdDay: string
  /** Ukončil spolupráci, nebo se odhlásil z kontaktu. */
  ended: boolean
}

export type SegmentResult = {
  /** `null` = bez skupiny: nikdy nepřišel a od první poptávky uběhlo víc než okno pro Nové. */
  segment: SegmentKey | null
  /** Návštěvy za posledních `regularWindowDays` dní (sloupec visits_12m). */
  visitsInWindow: number
  firstVisit: string | null
  lastVisit: string | null
  /** Obvyklý interval mezi návštěvami ve dnech (medián), `null` pod 2 návštěvy. */
  intervalDays: number | null
}

/** Kolik posledních mezer mezi návštěvami se bere do obvyklého intervalu. */
const INTERVAL_SAMPLE = 10

/** Medián mezer mezi po sobě jdoucími návštěvami (posledních 10). */
export function typicalInterval(sortedDays: readonly string[]): number | null {
  if (sortedDays.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < sortedDays.length; i++) gaps.push(daysBetween(sortedDays[i - 1], sortedDays[i]))
  const sample = gaps.slice(-INTERVAL_SAMPLE).sort((a, b) => a - b)
  const mid = sample.length >> 1
  const median = sample.length % 2 ? sample[mid] : (sample[mid - 1] + sample[mid]) / 2
  return Math.max(1, Math.round(median))
}

/** Po kolika dnech bez návštěvy je stálý zákazník Spící. */
export function dormantAfterDays(intervalDays: number | null, rules: SegmentRules): number {
  const byInterval = intervalDays === null ? 0 : Math.ceil(rules.dormantFactor * intervalDays)
  return Math.max(byInterval, rules.dormantMinDays)
}

/**
 * Skupina zákazníka k pražskému dni `today`.
 *
 * - Ukončení: sám ukončil / odhlásil se, nebo ho firma označila ručně.
 * - Noví: od první návštěvy uplynulo nejvýš `newDays` dní (včetně). Kdo ještě
 *   nepřišel, je Nový nejvýš `newDays` dní od první poptávky, potom bez skupiny.
 * - Spící: byl Stálý (aspoň `regularMinVisits` návštěv v okně před poslední
 *   návštěvou) a nepřišel déle než max(`dormantFactor` × obvyklý interval,
 *   `dormantMinDays`) dní (přísně déle).
 * - Stálí: byl Stálý a nespí.
 * - Jednorázoví: všichni ostatní — nechodí pravidelně (R-046).
 */
export function classifySegment(input: SegmentInput, rules: SegmentRules, today: string): SegmentResult {
  const days = Array.from(new Set(input.visitDays.filter((d) => d <= today))).sort()
  const first = days[0] ?? null
  const last = days[days.length - 1] ?? null
  const intervalDays = typicalInterval(days)
  const countWithin = (end: string) => days.filter((d) => d <= end && daysBetween(d, end) < rules.regularWindowDays).length
  const visitsInWindow = countWithin(today)
  const base = { visitsInWindow, firstVisit: first, lastVisit: last, intervalDays }

  if (input.ended) return { segment: 'ended', ...base }
  if (!first || !last) {
    return { segment: daysBetween(input.createdDay, today) <= rules.newDays ? 'new' : null, ...base }
  }
  if (daysBetween(first, today) <= rules.newDays) return { segment: 'new', ...base }

  const wasRegular = countWithin(last) >= rules.regularMinVisits
  if (wasRegular && daysBetween(last, today) > dormantAfterDays(intervalDays, rules)) return { segment: 'dormant', ...base }
  if (wasRegular) return { segment: 'regular', ...base }
  return { segment: 'one_time', ...base }
}

// --- DB ---------------------------------------------------------------------

type Biz = Pick<WsBusiness, 'id'>

const num = (v: unknown, fallback: number) => (v === null || v === undefined ? fallback : Number(v))

export async function getSegmentRules(ctx: WsContext, business: Biz): Promise<SegmentRules> {
  const [row] = await wsDb(ctx)`
    SELECT new_days, regular_min_visits, regular_window_days, dormant_factor, dormant_min_days
    FROM ws.segment_rules WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}
  `
  return rowToRules(row)
}

function rowToRules(row: WsRow | undefined): SegmentRules {
  const d = DEFAULT_SEGMENT_RULES
  if (!row) return d
  return {
    newDays: num(row.new_days, d.newDays),
    regularMinVisits: num(row.regular_min_visits, d.regularMinVisits),
    regularWindowDays: num(row.regular_window_days, d.regularWindowDays),
    dormantFactor: num(row.dormant_factor, d.dormantFactor),
    dormantMinDays: num(row.dormant_min_days, d.dormantMinDays),
  }
}

export async function saveSegmentRules(ctx: WsContext, business: Biz, rules: SegmentRules): Promise<void> {
  await wsDb(ctx)`
    INSERT INTO ws.segment_rules (business_id, account_id, new_days, regular_min_visits, regular_window_days, dormant_factor, dormant_min_days)
    VALUES (${business.id}, ${ctx.accountId}, ${rules.newDays}, ${rules.regularMinVisits}, ${rules.regularWindowDays},
            ${rules.dormantFactor}, ${rules.dormantMinDays})
    ON CONFLICT (business_id) DO UPDATE SET
      new_days = EXCLUDED.new_days,
      regular_min_visits = EXCLUDED.regular_min_visits,
      regular_window_days = EXCLUDED.regular_window_days,
      dormant_factor = EXCLUDED.dormant_factor,
      dormant_min_days = EXCLUDED.dormant_min_days
    WHERE ws.segment_rules.account_id = ${ctx.accountId}
  `
}

/**
 * Návštěva pro skupiny = termín (ne blokace), který proběhl: hotový, nebo
 * potvrzený a už skončil (stejně jako karta zákazníka na Dnes). U byznysů
 * bez kalendáře hotová / zaplacená zakázka, která nemá vlastní termín.
 * Den návštěvy v pražském čase.
 */
function visitDaysQuery(acc: string, biz: string, now: Date, customerIds: string[] | null) {
  return q`
    WITH scope AS (
      SELECT c.id, c.created_at, (c.ended_at IS NOT NULL OR c.unsubscribed_at IS NOT NULL) AS ended
      FROM ws.customers c
      WHERE c.account_id = ${acc}
        AND (${customerIds}::uuid[] IS NULL OR c.id = ANY(${customerIds}::uuid[]))
        AND (
          EXISTS (SELECT 1 FROM ws.requests r WHERE r.account_id = c.account_id AND r.business_id = ${biz} AND r.customer_id = c.id AND NOT r.is_test)
          OR EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = c.account_id AND a.business_id = ${biz} AND a.customer_id = c.id)
          OR EXISTS (SELECT 1 FROM ws.jobs j WHERE j.account_id = c.account_id AND j.business_id = ${biz} AND j.customer_id = c.id)
          OR EXISTS (SELECT 1 FROM ws.customer_segments s WHERE s.account_id = c.account_id AND s.business_id = ${biz} AND s.customer_id = c.id)
        )
    ),
    visits AS (
      SELECT a.customer_id, (a.starts_at AT TIME ZONE 'Europe/Prague')::date AS day
      FROM ws.appointments a
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.kind = 'visit'
        AND a.customer_id IN (SELECT id FROM scope)
        AND (a.status = 'completed' OR (a.status = 'confirmed' AND a.ends_at <= ${now}))
      UNION
      SELECT j.customer_id, (COALESCE(j.closed_at, j.updated_at) AT TIME ZONE 'Europe/Prague')::date
      FROM ws.jobs j
      JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND st.type IN ('done', 'paid')
        AND j.customer_id IN (SELECT id FROM scope)
        AND NOT EXISTS (SELECT 1 FROM ws.appointments a2 WHERE a2.account_id = j.account_id AND a2.job_id = j.id AND a2.kind = 'visit')
    )
    SELECT s.id, s.ended, (s.created_at AT TIME ZONE 'Europe/Prague')::date::text AS created_day,
      COALESCE(array_agg(v.day::text ORDER BY v.day) FILTER (WHERE v.day IS NOT NULL), '{}') AS days
    FROM scope s
    LEFT JOIN visits v ON v.customer_id = s.id
    GROUP BY s.id, s.ended, s.created_at
  `
}

export type RecomputeResult = { customers: number; changed: number }

/**
 * Přepočítá skupiny byznysu (nebo jen vybraných zákazníků) a změny zapíše do
 * ws.segment_history. Kdo skupinu ztratil, nemá řádek v customer_segments.
 */
export async function recomputeSegments(
  ctx: Pick<WsContext, 'accountId'>,
  business: Biz,
  opts: { customerIds?: string[]; now?: Date } = {},
): Promise<RecomputeResult> {
  const acc = ctx.accountId
  const biz = business.id
  const now = opts.now ?? new Date()
  const today = pragueParts(now).date
  const ids = opts.customerIds ? Array.from(new Set(opts.customerIds)) : null
  if (ids && ids.length === 0) return { customers: 0, changed: 0 }

  const [rulesRows, rows] = await wsDb(ctx).batch([
    q`SELECT new_days, regular_min_visits, regular_window_days, dormant_factor, dormant_min_days
      FROM ws.segment_rules WHERE account_id = ${acc} AND business_id = ${biz}`,
    visitDaysQuery(acc, biz, now, ids),
  ])
  const rules = rowToRules((rulesRows as WsRow[])[0])

  const customerIds: string[] = []
  const segments: (string | null)[] = []
  const visits: number[] = []
  const firsts: (string | null)[] = []
  const lasts: (string | null)[] = []
  const intervals: (number | null)[] = []
  for (const r of rows as WsRow[]) {
    const res = classifySegment(
      { visitDays: (r.days as string[]) ?? [], createdDay: String(r.created_day), ended: Boolean(r.ended) },
      rules,
      today,
    )
    customerIds.push(String(r.id))
    segments.push(res.segment)
    visits.push(res.visitsInWindow)
    firsts.push(res.firstVisit)
    lasts.push(res.lastVisit)
    intervals.push(res.intervalDays)
  }
  if (customerIds.length === 0) return { customers: 0, changed: 0 }

  const [result] = await wsDb(ctx)`
    WITH input AS (
      SELECT * FROM unnest(${customerIds}::uuid[], ${segments}::text[], ${visits}::int[], ${firsts}::date[], ${lasts}::date[], ${intervals}::int[])
        AS t(customer_id, segment, visits, first_day, last_day, interval_days)
    ),
    prev AS (
      SELECT cs.customer_id, cs.segment FROM ws.customer_segments cs
      WHERE cs.account_id = ${acc} AND cs.business_id = ${biz} AND cs.customer_id IN (SELECT customer_id FROM input)
    ),
    removed AS (
      DELETE FROM ws.customer_segments cs USING input i
      WHERE cs.account_id = ${acc} AND cs.business_id = ${biz} AND cs.customer_id = i.customer_id AND i.segment IS NULL
      RETURNING cs.customer_id
    ),
    saved AS (
      INSERT INTO ws.customer_segments (account_id, business_id, customer_id, segment, visits_12m, first_visit_at, last_visit_at, typical_interval_days, computed_at)
      SELECT ${acc}, ${biz}, i.customer_id, i.segment, i.visits,
        i.first_day::timestamp AT TIME ZONE 'Europe/Prague', i.last_day::timestamp AT TIME ZONE 'Europe/Prague',
        i.interval_days, now()
      FROM input i WHERE i.segment IS NOT NULL
      ON CONFLICT (business_id, customer_id) DO UPDATE SET
        segment = EXCLUDED.segment,
        visits_12m = EXCLUDED.visits_12m,
        first_visit_at = EXCLUDED.first_visit_at,
        last_visit_at = EXCLUDED.last_visit_at,
        typical_interval_days = EXCLUDED.typical_interval_days,
        computed_at = EXCLUDED.computed_at
      WHERE ws.customer_segments.account_id = ${acc}
      RETURNING customer_id
    ),
    history AS (
      INSERT INTO ws.segment_history (account_id, business_id, customer_id, from_segment, to_segment)
      SELECT ${acc}, ${biz}, i.customer_id, p.segment, i.segment
      FROM input i LEFT JOIN prev p ON p.customer_id = i.customer_id
      WHERE i.segment IS NOT NULL AND i.segment IS DISTINCT FROM p.segment
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM history)::int AS changed, (SELECT count(*) FROM saved)::int AS saved,
           (SELECT count(*) FROM removed)::int AS removed
  `
  return { customers: customerIds.length, changed: Number(result?.changed ?? 0) }
}

/**
 * Přepočet po akci (návštěva, zakázka, nový zákazník). Selhání nesmí shodit
 * akci, která už proběhla — jen se zaloguje a denní cron to dožene.
 */
export async function refreshSegmentsSafely(ctx: Pick<WsContext, 'accountId'>, business: Biz, customerIds: (string | null | undefined)[]): Promise<void> {
  const ids = customerIds.filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return
  try {
    await recomputeSegments(ctx, business, { customerIds: ids })
  } catch (e) {
    console.error('segments.refresh', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
  }
}

/** Přepočet zákazníka podle poptávky, termínu nebo zakázky (po akci v kalendáři a na tabuli). */
export async function refreshSegmentsFor(
  ctx: Pick<WsContext, 'accountId'>,
  business: Biz,
  ref: { requestId?: string; appointmentId?: string; jobId?: string },
): Promise<void> {
  try {
    const acc = ctx.accountId
    const rows = await wsDb(ctx)`
      SELECT customer_id FROM ws.requests WHERE account_id = ${acc} AND business_id = ${business.id} AND id = ${ref.requestId ?? null}::uuid
      UNION
      SELECT customer_id FROM ws.appointments WHERE account_id = ${acc} AND business_id = ${business.id} AND id = ${ref.appointmentId ?? null}::uuid
      UNION
      SELECT customer_id FROM ws.jobs WHERE account_id = ${acc} AND business_id = ${business.id} AND id = ${ref.jobId ?? null}::uuid
    `
    await refreshSegmentsSafely(ctx, business, rows.map((r) => r.customer_id as string | null))
  } catch (e) {
    console.error('segments.refreshFor', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
  }
}
