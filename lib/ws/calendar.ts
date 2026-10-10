import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import type { CalendarEntry } from './today'

// Data obrazovek Poptávky, Kalendář a Zakázky (S10). Stejná pravidla jako
// lib/ws/today.ts: account_id z kontextu, business_id ověřeného byznysu.

type Biz = Pick<WsBusiness, 'id'>

export type StaffItem = { id: string; name: string }
export type ServiceItem = { id: string; name: string; duration_min: number }

/** Položka kalendáře s pracovníkem (sloupce v pohledu Den). */
export type CalEntry = CalendarEntry & { staff_id: string | null; staff_name: string | null }

export type CalendarData = {
  entries: CalEntry[]
  staff: StaffItem[]
  services: ServiceItem[]
  opening: { from: number; to: number } | null
}

/** Termíny, blokace a nové poptávky s časem v intervalu [from, to). */
export async function getCalendarData(ctx: WsContext, business: Biz, range: { from: Date; to: Date }): Promise<CalendarData> {
  const acc = ctx.accountId
  const biz = business.id
  const { from, to } = range
  const [visits, wanted, staff, services, opening] = await wsDb(ctx).batch([
    q`
      SELECT a.id, a.kind, a.starts_at, a.ends_at, a.customer_id, a.title, a.staff_id,
             c.name AS customer_name, s.name AS service_name, st.name AS staff_name
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz}
        AND a.status <> 'cancelled' AND a.starts_at < ${to} AND a.ends_at > ${from}
      ORDER BY a.starts_at
      LIMIT 1000
    `,
    q`
      SELECT r.id, r.customer_id, r.wanted_start, r.wanted_end,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
             s.name AS service_name, s.duration_min
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${acc} AND r.business_id = ${biz} AND r.status = 'new'
        AND r.wanted_start IS NOT NULL AND r.wanted_start < ${to}
        AND COALESCE(r.wanted_end, r.wanted_start + make_interval(mins => COALESCE(s.duration_min, 60))) > ${from}
      ORDER BY r.wanted_start
      LIMIT 300
    `,
    q`
      SELECT id, name FROM ws.staff
      WHERE account_id = ${acc} AND business_id = ${biz} AND active
      ORDER BY position, created_at
    `,
    q`
      SELECT id, name, duration_min FROM ws.services
      WHERE account_id = ${acc} AND business_id = ${biz} AND active
      ORDER BY position, name
    `,
    q`
      SELECT min(extract(hour FROM opens))::int AS opens,
             max(ceil(extract(epoch FROM closes) / 3600))::int AS closes
      FROM ws.opening_hours
      WHERE account_id = ${acc} AND business_id = ${biz}
    `,
  ])

  const entries: CalEntry[] = [
    ...(visits as WsRow[]).map((r): CalEntry => {
      const block = r.kind === 'block'
      return {
        id: String(r.id),
        kind: block ? 'block' : 'visit',
        start: r.starts_at as Date,
        end: r.ends_at as Date,
        title: block ? String(r.title ?? 'Blokace') : String(r.customer_name ?? r.title ?? 'Termín'),
        subtitle: block ? null : ((r.service_name as string | null) ?? null),
        customer_id: (r.customer_id as string | null) ?? null,
        staff_id: (r.staff_id as string | null) ?? null,
        staff_name: (r.staff_name as string | null) ?? null,
      }
    }),
    ...(wanted as WsRow[]).map((r): CalEntry => {
      const start = r.wanted_start as Date
      return {
        id: String(r.id),
        kind: 'request',
        start,
        end: (r.wanted_end as Date | null) ?? new Date(start.getTime() + Number(r.duration_min ?? 60) * 60_000),
        title: String(r.customer_name),
        subtitle: (r.service_name as string | null) ?? null,
        customer_id: (r.customer_id as string | null) ?? null,
        staff_id: null,
        staff_name: null,
      }
    }),
  ]

  const open = (opening as WsRow[])[0]
  return {
    entries,
    staff: (staff as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name) })),
    services: (services as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name), duration_min: Number(r.duration_min) })),
    opening:
      open && open.opens !== null && open.closes !== null ? { from: Number(open.opens), to: Number(open.closes) } : null,
  }
}

/** Pracovníci a služby pro formuláře (Nová rezervace, Blokace, Jiný čas). */
export async function getBookingOptions(ctx: WsContext, business: Biz): Promise<{ staff: StaffItem[]; services: ServiceItem[] }> {
  const [staff, services] = await wsDb(ctx).batch([
    q`SELECT id, name FROM ws.staff WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND active ORDER BY position, created_at`,
    q`SELECT id, name, duration_min FROM ws.services WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND active ORDER BY position, name`,
  ])
  return {
    staff: (staff as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name) })),
    services: (services as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name), duration_min: Number(r.duration_min) })),
  }
}

// --- Seznam poptávek ---------------------------------------------------------

export type RequestTab = 'nove' | 'potvrzene' | 'vyrizene'

export type RequestListItem = {
  id: string
  status: string
  customer_name: string
  service_name: string | null
  wanted_start: Date | null
  wanted_end: Date | null
  created_at: Date
  handled_at: Date | null
  source: string
  appointment_start: Date | null
}

/**
 * Nové = čekají na odpověď. Potvrzené = mají termín, který ještě nebyl,
 * nebo otevřenou zakázku. Vyřízené = odmítnuté a ty, jejichž termín už
 * proběhl nebo se zrušil.
 */
const BUCKET = (now: Date) => q`
  CASE
    WHEN r.status = 'new' THEN 'nove'
    WHEN r.status IN ('confirmed', 'rescheduled') AND (
      EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = r.account_id AND a.request_id = r.id
              AND a.status = 'confirmed' AND a.ends_at > ${now}::timestamptz)
      OR EXISTS (SELECT 1 FROM ws.jobs j WHERE j.account_id = r.account_id AND j.request_id = r.id AND j.closed_at IS NULL)
    ) THEN 'potvrzene'
    ELSE 'vyrizene'
  END`

export async function getRequestsList(
  ctx: WsContext,
  business: Biz,
  tab: RequestTab,
  now: Date = new Date(),
): Promise<{ items: RequestListItem[]; counts: Record<RequestTab, number> }> {
  const acc = ctx.accountId
  const biz = business.id
  const bucket = BUCKET(now)
  // Fragment s parametry $1… se vloží za parametry vnějšího dotazu.
  const shift = (text: string, by: number) => text.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + by}`)

  const list = {
    text: `
      SELECT r.id, r.status, r.source, r.created_at, r.handled_at, r.wanted_start, r.wanted_end,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
             s.name AS service_name,
             (SELECT a.starts_at FROM ws.appointments a WHERE a.account_id = r.account_id AND a.request_id = r.id
                AND a.status <> 'cancelled' ORDER BY a.created_at DESC LIMIT 1) AS appointment_start
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = $1 AND r.business_id = $2 AND (${shift(bucket.text, 3)}) = $3
      ORDER BY CASE WHEN $3 = 'nove' THEN r.created_at ELSE COALESCE(r.handled_at, r.created_at) END DESC
      LIMIT 200
    `,
    params: [acc, biz, tab, ...bucket.params],
  }
  const counts = {
    text: `
      SELECT b, count(*)::int AS n FROM (
        SELECT (${shift(bucket.text, 2)}) AS b FROM ws.requests r
        WHERE r.account_id = $1 AND r.business_id = $2
      ) x GROUP BY b
    `,
    params: [acc, biz, ...bucket.params],
  }
  const [items, countRows] = await wsDb(ctx).batch([list, counts])
  const result: Record<RequestTab, number> = { nove: 0, potvrzene: 0, vyrizene: 0 }
  for (const r of countRows as WsRow[]) result[r.b as RequestTab] = Number(r.n)
  return { items: items as unknown as RequestListItem[], counts: result }
}

// --- Detail termínu ---------------------------------------------------------

export type AppointmentDetail = {
  id: string
  kind: 'visit' | 'block'
  status: string
  start: Date
  end: Date
  title: string | null
  note: string | null
  customer_id: string | null
  customer_name: string | null
  service_name: string | null
  staff_id: string | null
  staff_name: string | null
  request_id: string | null
}

export async function getAppointmentDetail(ctx: WsContext, business: Biz, id: string): Promise<AppointmentDetail | null> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT a.id, a.kind, a.status, a.starts_at, a.ends_at, a.title, a.note, a.customer_id, a.staff_id, a.request_id,
             c.name AS customer_name, s.name AS service_name, st.name AS staff_name
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
      WHERE a.account_id = ${ctx.accountId} AND a.business_id = ${business.id} AND a.id = ${id}
    `,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  return {
    id: String(r.id),
    kind: r.kind === 'block' ? 'block' : 'visit',
    status: String(r.status),
    start: r.starts_at as Date,
    end: r.ends_at as Date,
    title: (r.title as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    customer_id: (r.customer_id as string | null) ?? null,
    customer_name: (r.customer_name as string | null) ?? null,
    service_name: (r.service_name as string | null) ?? null,
    staff_id: (r.staff_id as string | null) ?? null,
    staff_name: (r.staff_name as string | null) ?? null,
    request_id: (r.request_id as string | null) ?? null,
  }
}

// --- Zakázky ----------------------------------------------------------------

export type JobStage = { id: string; name: string; type: string }
export type JobCard = {
  id: string
  stage_id: string | null
  title: string
  customer_id: string | null
  customer_name: string | null
  next_start: Date | null
  price: string | null
  currency: string
  updated_at: Date
}

/** Tabule zakázek: stavy byznysu a zakázky v nich (uzavřené jen posledních 30 dní). */
export async function getJobBoard(
  ctx: WsContext,
  business: Biz,
  now: Date = new Date(),
): Promise<{ stages: JobStage[]; jobs: JobCard[] }> {
  const acc = ctx.accountId
  const biz = business.id
  const [stages, jobs] = await wsDb(ctx).batch([
    q`SELECT id, name, type FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} ORDER BY position, created_at`,
    q`
      SELECT j.id, j.stage_id, j.title, j.customer_id, j.price, j.currency, j.updated_at, c.name AS customer_name,
             (SELECT min(a.starts_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed' AND a.ends_at > ${now}::timestamptz) AS next_start
      FROM ws.jobs j
      LEFT JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz}
        AND (j.closed_at IS NULL OR j.closed_at > ${now}::timestamptz - interval '30 days')
      ORDER BY j.updated_at DESC
      LIMIT 500
    `,
  ])
  return {
    stages: (stages as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name), type: String(r.type) })),
    jobs: (jobs as WsRow[]).map((r) => ({
      id: String(r.id),
      stage_id: (r.stage_id as string | null) ?? null,
      title: String(r.title),
      customer_id: (r.customer_id as string | null) ?? null,
      customer_name: (r.customer_name as string | null) ?? null,
      next_start: (r.next_start as Date | null) ?? null,
      price: r.price === null || r.price === undefined ? null : String(r.price),
      currency: String(r.currency),
      updated_at: r.updated_at as Date,
    })),
  }
}

/**
 * Otisk změn pro živé obnovení (polling): poslední změna a počet nových
 * poptávek, termínů a zakázek byznysu. Změní se → aplikace si načte data znovu.
 */
export async function getChangeStamp(ctx: WsContext, business: Biz): Promise<string> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT
        (SELECT coalesce(max(updated_at)::text, '') || ':' || count(*) FROM ws.requests WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS r,
        (SELECT coalesce(max(updated_at)::text, '') || ':' || count(*) FROM ws.appointments WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS a,
        (SELECT coalesce(max(updated_at)::text, '') || ':' || count(*) FROM ws.jobs WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS j
    `,
  ])
  const r = (rows as WsRow[])[0] ?? {}
  return `${r.r}|${r.a}|${r.j}`
}
