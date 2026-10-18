import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import type { CalendarEntry } from './today'
import type { OpeningRow } from './calendar-layout'
import { likePattern } from './search'
import { groupAppointmentSegments, type AppointmentSegment } from './calendar-groups'

// Data obrazovek Poptávky, Kalendář a Zakázky (S10). Stejná pravidla jako
// lib/ws/today.ts: account_id z kontextu, business_id ověřeného byznysu.

type Biz = Pick<WsBusiness, 'id'>

export type StaffItem = { id: string; name: string }
/** Pracovník v kalendáři: uložená barva (nebo null → barva podle pořadí, lib/ws/staff-colors.ts). */
export type CalStaff = StaffItem & { color: string | null }
export type ServiceItem = { id: string; name: string; duration_min: number }

/** Položka kalendáře s pracovníkem (sloupce v pohledu Den). */
export type CalEntry = CalendarEntry & { staff_id: string | null; staff_name: string | null; group_id?: string | null; session_id?: string | null; session_capacity?: number | null; session_reserved?: number | null }

export type CalendarData = {
  entries: CalEntry[]
  staff: CalStaff[]
  services: ServiceItem[]
  opening: { from: number; to: number } | null
  /** Otevírací doba a směny po úsecích (minuty dne); prázdné = doba není nastavená. */
  openingRows: OpeningRow[]
}

/** Termíny, blokace a nové poptávky s časem v intervalu [from, to). */
export async function getCalendarData(ctx: WsContext, business: Biz, range: { from: Date; to: Date }): Promise<CalendarData> {
  const acc = ctx.accountId
  const biz = business.id
  const { from, to } = range
  const [visits, wanted, staff, services, opening] = await wsDb(ctx).batch([
    q`
      SELECT a.id, a.group_id, a.kind, a.starts_at, a.ends_at, a.customer_id, a.title, a.staff_id,
             c.name AS customer_name, s.name AS service_name, st.name AS staff_name,
             se.id AS session_id, se.capacity AS session_capacity, se.reserved AS session_reserved
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
      LEFT JOIN ws.sessions se ON se.account_id = a.account_id AND se.business_id = a.business_id AND se.appointment_id = a.id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz}
        AND a.status <> 'cancelled' AND a.starts_at < ${to} AND a.ends_at > ${from}
      ORDER BY a.starts_at
      LIMIT 1000
    `,
    q`
      SELECT r.id, r.customer_id, r.wanted_start, r.wanted_end,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
             COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY rs.position)
               FROM ws.request_services rs JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
               WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.name) AS service_name,
             COALESCE((SELECT sum(s2.duration_min)::int FROM ws.request_services rs
               JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
               WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.duration_min) AS duration_min
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${acc} AND r.business_id = ${biz} AND r.status = 'new' AND NOT r.is_test
        AND r.wanted_start IS NOT NULL AND r.wanted_start < ${to}
        AND COALESCE(r.wanted_end, r.wanted_start + make_interval(mins => COALESCE(s.duration_min, 60))) > ${from}
      ORDER BY r.wanted_start
      LIMIT 300
    `,
    q`
      SELECT id, name, color FROM ws.staff
      WHERE account_id = ${acc} AND business_id = ${biz} AND active
      ORDER BY position, created_at
    `,
    q`
      SELECT id, name, duration_min FROM ws.services
      WHERE account_id = ${acc} AND business_id = ${biz} AND active
      ORDER BY position, name
    `,
    q`
      SELECT staff_id, weekday,
             (extract(epoch FROM opens) / 60)::int AS from_min,
             (extract(epoch FROM closes) / 60)::int AS to_min
      FROM ws.opening_hours
      WHERE account_id = ${acc} AND business_id = ${biz}
    `,
  ])

  const groupedVisits = groupAppointmentSegments((visits as WsRow[]).map((r) => ({
    id: String(r.id), group_id: (r.group_id as string | null) ?? null,
    kind: String(r.kind), start: r.starts_at as Date, end: r.ends_at as Date,
    title: (r.title as string | null) ?? null, customer_id: (r.customer_id as string | null) ?? null,
    customer_name: (r.customer_name as string | null) ?? null, staff_id: (r.staff_id as string | null) ?? null,
    staff_name: (r.staff_name as string | null) ?? null, service_name: (r.service_name as string | null) ?? null,
    session_id: (r.session_id as string | null) ?? null,
    session_capacity: r.session_capacity === null || r.session_capacity === undefined ? null : Number(r.session_capacity),
    session_reserved: r.session_reserved === null || r.session_reserved === undefined ? null : Number(r.session_reserved),
  } satisfies AppointmentSegment)))
  const entries: CalEntry[] = [
    ...groupedVisits.map((r): CalEntry => {
      const block = r.kind === 'block'
      return {
        id: r.id,
        kind: block ? 'block' : 'visit',
        start: r.start,
        end: r.end,
        title: block ? String(r.title ?? 'Blokace') : r.session_id
          ? `${String(r.title ?? 'Skupinová lekce')} · ${Number(r.session_reserved ?? 0)}/${Number(r.session_capacity ?? 0)}`
          : String(r.customer_name ?? r.title ?? 'Termín'),
        subtitle: block ? null : r.service_name,
        customer_id: r.customer_id,
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        ...(r.group_id ? { group_id: r.group_id } : {}),
        ...(r.session_id ? { session_id: r.session_id } : {}),
        ...(r.session_capacity !== null && r.session_capacity !== undefined ? { session_capacity: Number(r.session_capacity) } : {}),
        ...(r.session_reserved !== null && r.session_reserved !== undefined ? { session_reserved: Number(r.session_reserved) } : {}),
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

  const openingRows: OpeningRow[] = (opening as WsRow[]).map((r) => ({
    staff_id: (r.staff_id as string | null) ?? null,
    weekday: Number(r.weekday),
    from: Number(r.from_min),
    to: Number(r.to_min),
  }))
  return {
    entries,
    staff: (staff as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name), color: (r.color as string | null) ?? null })),
    services: (services as WsRow[]).map((r) => ({ id: String(r.id), name: String(r.name), duration_min: Number(r.duration_min) })),
    // Rozsah hodin mřížky: nejdřív otevřeno … nejpozději zavřeno (zaokrouhleno na celé hodiny).
    opening: openingRows.length
      ? {
          from: Math.floor(Math.min(...openingRows.map((r) => r.from)) / 60),
          to: Math.ceil(Math.max(...openingRows.map((r) => r.to)) / 60),
        }
      : null,
    openingRows,
  }
}

/** Zákazníci pro rychlé zadání rezervace: hledání podle jména, telefonu nebo e-mailu. */
export type CustomerOption = { id: string; name: string; phone: string | null; email: string | null }

export async function findCustomersForBooking(ctx: WsContext, rawQuery: string): Promise<CustomerOption[]> {
  const text = rawQuery.trim().slice(0, 80)
  if (text.length < 2) return []
  const pattern = likePattern(text)
  const digits = text.replace(/\D/g, '')
  const phonePattern = digits.length >= 3 ? likePattern(digits) : null
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT id, name, phone, email FROM ws.customers
      WHERE account_id = ${ctx.accountId}
        AND (name ILIKE ${pattern} OR email ILIKE ${pattern} OR (${phonePattern}::text IS NOT NULL AND phone LIKE ${phonePattern}))
      ORDER BY name LIMIT 6
    `,
  ])
  return (rows as WsRow[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
  }))
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
             COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY rs.position)
               FROM ws.request_services rs JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
               WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.name) AS service_name,
             (SELECT a.starts_at FROM ws.appointments a WHERE a.account_id = r.account_id AND a.request_id = r.id
                AND a.status <> 'cancelled' ORDER BY a.created_at DESC LIMIT 1) AS appointment_start
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = $1 AND r.business_id = $2 AND NOT r.is_test AND (${shift(bucket.text, 3)}) = $3
      ORDER BY CASE WHEN $3 = 'nove' THEN r.created_at ELSE COALESCE(r.handled_at, r.created_at) END DESC
      LIMIT 200
    `,
    params: [acc, biz, tab, ...bucket.params],
  }
  const counts = {
    text: `
      SELECT b, count(*)::int AS n FROM (
        SELECT (${shift(bucket.text, 2)}) AS b FROM ws.requests r
        WHERE r.account_id = $1 AND r.business_id = $2 AND NOT r.is_test
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
  group_id: string | null
  session_id: string | null
  session_capacity: number | null
  session_reserved: number | null
  session_status: string | null
}

export type SessionAttendee = { request_id: string; customer_id: string | null; name: string; status: string; created_at: Date }

export async function getSessionAttendees(ctx: WsContext, business: Biz, sessionId: string): Promise<SessionAttendee[]> {
  const rows = await wsDb(ctx)`
    SELECT sa.request_id, sa.customer_id, COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS name,
      sa.status, sa.created_at
    FROM ws.session_attendees sa
    JOIN ws.requests r ON r.account_id = sa.account_id AND r.business_id = sa.business_id AND r.id = sa.request_id
    LEFT JOIN ws.customers c ON c.account_id = sa.account_id AND c.id = sa.customer_id
    WHERE sa.account_id = ${ctx.accountId} AND sa.business_id = ${business.id} AND sa.session_id = ${sessionId}
    ORDER BY sa.created_at, sa.id
  `
  return rows.map((r) => ({
    request_id: String(r.request_id), customer_id: (r.customer_id as string | null) ?? null,
    name: String(r.name), status: String(r.status), created_at: r.created_at as Date,
  }))
}

export async function getAppointmentDetail(ctx: WsContext, business: Biz, id: string): Promise<AppointmentDetail | null> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT a.id, a.group_id, a.kind, a.status, a.starts_at, a.ends_at, a.title, a.note, a.customer_id, a.staff_id, a.request_id,
             c.name AS customer_name, st.name AS staff_name, se.id AS session_id, se.capacity AS session_capacity,
             se.reserved AS session_reserved, se.status AS session_status,
             COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY a2.starts_at)
               FROM ws.appointments a2 LEFT JOIN ws.services s2 ON s2.account_id = a2.account_id AND s2.id = a2.service_id
               WHERE a2.account_id = a.account_id AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR a2.id = a.id)), s.name) AS service_name
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
      LEFT JOIN ws.sessions se ON se.account_id = a.account_id AND se.business_id = a.business_id AND se.appointment_id = a.id
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
    group_id: (r.group_id as string | null) ?? null,
    session_id: (r.session_id as string | null) ?? null,
    session_capacity: r.session_capacity === null || r.session_capacity === undefined ? null : Number(r.session_capacity),
    session_reserved: r.session_reserved === null || r.session_reserved === undefined ? null : Number(r.session_reserved),
    session_status: (r.session_status as string | null) ?? null,
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
  /** Konec posledního domluveného termínu (i proběhlého); `null` = zakázka žádný termín nemá. */
  last_end: Date | null
  closed_at: Date | null
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
      SELECT j.id, j.stage_id, j.title, j.customer_id, j.price, j.currency, j.updated_at, j.closed_at, c.name AS customer_name,
             (SELECT min(a.starts_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed' AND a.ends_at > ${now}::timestamptz) AS next_start,
             (SELECT max(a.ends_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed') AS last_end
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
      last_end: (r.last_end as Date | null) ?? null,
      closed_at: (r.closed_at as Date | null) ?? null,
      price: r.price === null || r.price === undefined ? null : String(r.price),
      currency: String(r.currency),
      updated_at: r.updated_at as Date,
    })),
  }
}

/**
 * Otisk změn pro živé obnovení (polling): čas poslední změny poptávek, termínů
 * a zakázek byznysu. Změní se → aplikace si načte data znovu.
 *
 * Každý zápis (vložení i změna) posune `updated_at` (výchozí hodnota a trigger
 * `touch`), takže stačí `max`; ten čte jen konec indexu (účet, byznys,
 * updated_at DESC, migrace 086). Dřív se k tomu počítal i `count(*)`, což
 * procházelo všechny řádky při každém dotazu (každých 10 s u každé otevřené
 * karty). Aplikace tyto řádky nemaže, smazání by otisk nezměnilo.
 */
export async function getChangeStamp(ctx: WsContext, business: Biz): Promise<string> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT
        (SELECT coalesce(max(updated_at)::text, '') FROM ws.requests WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS r,
        (SELECT coalesce(max(updated_at)::text, '') FROM ws.appointments WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS a,
        (SELECT coalesce(max(updated_at)::text, '') FROM ws.jobs WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}) AS j
    `,
  ])
  const r = (rows as WsRow[])[0] ?? {}
  return `${r.r}|${r.a}|${r.j}`
}

/** Zákazník podle id (předvyplnění formuláře z rychlého zadání); cizí nebo neexistující = null. */
export async function getCustomerOption(ctx: WsContext, id: string): Promise<CustomerOption | null> {
  const [rows] = await wsDb(ctx).batch([
    q`SELECT id, name, phone, email FROM ws.customers WHERE account_id = ${ctx.accountId} AND id = ${id}`,
  ])
  const r = (rows as WsRow[])[0]
  return r
    ? { id: String(r.id), name: String(r.name), phone: (r.phone as string | null) ?? null, email: (r.email as string | null) ?? null }
    : null
}
