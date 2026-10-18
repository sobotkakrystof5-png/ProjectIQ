import 'server-only'
import { q, wsDb, type WsQuery, type WsRow as DbRow } from './db'
import { seededModules, type WsBusiness, type WsContext } from './context'
import { addDays, pragueParts, pragueToUtc } from './time'

// Data obrazovky Dnes (S09). Každý dotaz filtruje account_id z kontextu
// a business_id ověřeného byznysu (requireBusiness) — RLS je jen pojistka.

import type { SegmentKey } from './segment-labels'

export { SEGMENT_LABELS, type SegmentKey } from './segment-labels'

export type IncomingRequest = {
  id: string
  customer_id: string | null
  customer_name: string
  service_name: string | null
  wanted_start: Date | null
  wanted_end: Date | null
  created_at: Date
  source: string
}

export type CalendarEntry = {
  id: string
  kind: 'visit' | 'block' | 'request'
  start: Date
  end: Date
  title: string
  subtitle: string | null
  customer_id: string | null
}

/** Nejbližší dnešní termín, který ještě neskončil. */
export type FocusVisit = {
  id: string
  customer_id: string | null
  customer_name: string
  service_name: string | null
  start: Date
  end: Date
}

/** Nejstarší nezaplacená vystavená faktura po splatnosti. */
export type FocusInvoice = {
  id: string
  number: string
  customer_name: string
  amount: number
  currency: string
  /** Den splatnosti (YYYY-MM-DD). */
  due_on: string
  /** Kolik faktur je po splatnosti celkem. */
  total: number
}

/** Jedna hlavní věc nahoře na Dnes (RD04). */
export type FocusItem =
  | { kind: 'request'; request: IncomingRequest }
  | { kind: 'visit'; visit: FocusVisit }
  | { kind: 'invoice'; invoice: FocusInvoice }
  | { kind: 'none' }

/**
 * Co má majitel udělat jako první: nejdéle čekající nová poptávka → jinak
 * nejbližší dnešní termín → jinak faktura po splatnosti → jinak nic.
 * Čistá funkce; podklady vybírá `getTodayData` (faktura jen se zapnutou funkcí Faktury).
 */
export function pickFocus(c: {
  request: IncomingRequest | null
  visit: FocusVisit | null
  invoice: FocusInvoice | null
}): FocusItem {
  if (c.request) return { kind: 'request', request: c.request }
  if (c.visit) return { kind: 'visit', visit: c.visit }
  if (c.invoice) return { kind: 'invoice', invoice: c.invoice }
  return { kind: 'none' }
}

export type TodayData = {
  incoming: IncomingRequest[]
  incomingTotal: number
  calendar: CalendarEntry[]
  opening: { from: number; to: number } | null
  /** Byznys zatím nemá žádnou poptávku, termín ani zákazníka. */
  isEmpty: boolean
  /** Hlavní věc nahoře; nezávisí na zobrazeném týdnu. */
  focus: FocusItem
  services: string[]
}

const INCOMING_LIMIT = 20

type Row = Record<string, unknown>

/** Nové poptávky (bez zkušebních), nejnovější nahoře — Dnes i pruh v Kalendáři. */
const incomingQuery = (accountId: string, businessId: string) => q`
  SELECT r.id, r.customer_id,
         COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
         s.name AS service_name, r.wanted_start, r.wanted_end, r.created_at, r.source
  FROM ws.requests r
  LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
  LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
  WHERE r.account_id = ${accountId} AND r.business_id = ${businessId} AND r.status = 'new' AND NOT r.is_test
  ORDER BY r.created_at DESC
  LIMIT ${INCOMING_LIMIT}
`

const incomingCountQuery = (accountId: string, businessId: string) => q`
  SELECT count(*)::int AS n FROM ws.requests
  WHERE account_id = ${accountId} AND business_id = ${businessId} AND status = 'new' AND NOT is_test
`

/** Jen příchozí poptávky — Kalendář je ukazuje v pruhu vedle mřížky. */
export async function getIncoming(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
): Promise<{ items: IncomingRequest[]; total: number }> {
  const [items, total] = await wsDb(ctx).batch([
    incomingQuery(ctx.accountId, business.id),
    incomingCountQuery(ctx.accountId, business.id),
  ])
  return { items: items as unknown as IncomingRequest[], total: Number((total as Row[])[0]?.n ?? 0) }
}

export async function getTodayData(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  opts: { weekStart: string; now?: Date; /** Byznys má zapnuté Faktury (hlavní věc smí být faktura po splatnosti). */ invoices?: boolean },
): Promise<TodayData> {
  const accountId = ctx.accountId
  const businessId = business.id
  const now = opts.now ?? new Date()
  const today = pragueParts(now).date
  const from = pragueToUtc(opts.weekStart, 0)
  const to = pragueToUtc(addDays(opts.weekStart, 7), 0)
  const endOfToday = pragueToUtc(addDays(today, 1), 0)
  // Dolní mez, ať index (byznys, začátek) neprochází celou historii termínů.
  const startOfYesterday = pragueToUtc(addDays(today, -1), 0)
  const db = wsDb(ctx)

  const [incoming, total, visits, wanted, opening, flags, services, oldest, nextVisit, overdue] = await db.batch([
    incomingQuery(accountId, businessId),
    incomingCountQuery(accountId, businessId),
    q`
      SELECT a.id, a.kind, a.starts_at, a.ends_at, a.customer_id, a.title,
             c.name AS customer_name, s.name AS service_name, st.name AS staff_name
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      LEFT JOIN ws.staff st ON st.account_id = a.account_id AND st.id = a.staff_id
      WHERE a.account_id = ${accountId} AND a.business_id = ${businessId}
        AND a.status <> 'cancelled' AND a.starts_at < ${to} AND a.ends_at > ${from}
      ORDER BY a.starts_at
      LIMIT 300
    `,
    q`
      SELECT r.id, r.customer_id, r.wanted_start, r.wanted_end,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
             s.name AS service_name, s.duration_min
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${accountId} AND r.business_id = ${businessId} AND r.status = 'new' AND NOT r.is_test
        AND r.wanted_start IS NOT NULL AND r.wanted_start < ${to}
        AND COALESCE(r.wanted_end, r.wanted_start + interval '1 hour') > ${from}
      ORDER BY r.wanted_start
      LIMIT 100
    `,
    q`
      SELECT min(extract(hour FROM opens))::int AS opens,
             max(ceil(extract(epoch FROM closes) / 3600))::int AS closes
      FROM ws.opening_hours
      WHERE account_id = ${accountId} AND business_id = ${businessId}
    `,
    q`
      SELECT
        EXISTS (SELECT 1 FROM ws.requests WHERE account_id = ${accountId} AND business_id = ${businessId} AND NOT is_test) AS has_requests,
        EXISTS (SELECT 1 FROM ws.appointments WHERE account_id = ${accountId} AND business_id = ${businessId}) AS has_appointments,
        EXISTS (SELECT 1 FROM ws.customers WHERE account_id = ${accountId}) AS has_customers
    `,
    q`
      SELECT name FROM ws.services
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND active
      ORDER BY position, name
    `,
    // Hlavní věc: nejdéle čekající poptávka, nejbližší dnešní termín, faktura po splatnosti.
    q`
      SELECT r.id, r.customer_id,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name,
             s.name AS service_name, r.wanted_start, r.wanted_end, r.created_at, r.source
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${accountId} AND r.business_id = ${businessId} AND r.status = 'new' AND NOT r.is_test
      ORDER BY r.created_at, r.id
      LIMIT 1
    `,
    q`
      SELECT a.id, a.customer_id, a.starts_at, a.ends_at, a.title,
             c.name AS customer_name, s.name AS service_name
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${accountId} AND a.business_id = ${businessId}
        AND a.kind = 'visit' AND a.status = 'confirmed'
        AND a.ends_at > ${now} AND a.starts_at >= ${startOfYesterday} AND a.starts_at < ${endOfToday}
      ORDER BY a.starts_at, a.id
      LIMIT 1
    `,
    opts.invoices
      ? q`
      SELECT i.id, i.number, i.amount::float8 AS amount, i.currency, i.due_on::text AS due_on,
             COALESCE(c.name, NULLIF(i.counterparty->>'name', ''), 'Odběratel') AS customer_name,
             count(*) OVER ()::int AS total
      FROM ws.invoices i
      LEFT JOIN ws.customers c ON c.account_id = i.account_id AND c.id = i.customer_id
      WHERE i.account_id = ${accountId} AND i.business_id = ${businessId}
        AND i.direction = 'issued' AND i.status = 'issued' AND i.paid_on IS NULL
        AND i.due_on < ${today}::date
      ORDER BY i.due_on, i.id
      LIMIT 1
    `
      : q`SELECT 1 WHERE false`,
  ])

  const incomingRows = incoming as unknown as IncomingRequest[]

  const calendar: CalendarEntry[] = [
    ...(visits as Row[]).map((r): CalendarEntry => {
      const block = r.kind === 'block'
      return {
        id: String(r.id),
        kind: block ? 'block' : 'visit',
        start: r.starts_at as Date,
        end: r.ends_at as Date,
        title: block ? String(r.title ?? 'Blokace') : String(r.customer_name ?? r.title ?? 'Termín'),
        subtitle: block ? null : ((r.service_name as string | null) ?? null),
        customer_id: (r.customer_id as string | null) ?? null,
      }
    }),
    ...(wanted as Row[]).map((r): CalendarEntry => {
      const start = r.wanted_start as Date
      const minutes = Number(r.duration_min ?? 60)
      return {
        id: String(r.id),
        kind: 'request',
        start,
        end: (r.wanted_end as Date | null) ?? new Date(start.getTime() + minutes * 60_000),
        title: String(r.customer_name),
        subtitle: (r.service_name as string | null) ?? null,
        customer_id: (r.customer_id as string | null) ?? null,
      }
    }),
  ]

  const open = (opening as Row[])[0]
  const flag = (flags as Row[])[0] ?? {}

  return {
    incoming: incomingRows,
    incomingTotal: Number((total as Row[])[0]?.n ?? 0),
    calendar,
    opening:
      open && open.opens !== null && open.closes !== null
        ? { from: Number(open.opens), to: Number(open.closes) }
        : null,
    isEmpty: !flag.has_requests && !flag.has_appointments && !flag.has_customers,
    focus: pickFocus({
      request: ((oldest as unknown as IncomingRequest[])[0] as IncomingRequest | undefined) ?? null,
      visit: visitFocus((nextVisit as Row[])[0]),
      invoice: invoiceFocus((overdue as Row[])[0]),
    }),
    services: (services as Row[]).map((r) => String(r.name)),
  }
}

function visitFocus(r: Row | undefined): FocusVisit | null {
  if (!r) return null
  return {
    id: String(r.id),
    customer_id: (r.customer_id as string | null) ?? null,
    customer_name: String(r.customer_name ?? r.title ?? 'Termín'),
    service_name: (r.service_name as string | null) ?? null,
    start: r.starts_at as Date,
    end: r.ends_at as Date,
  }
}

function invoiceFocus(r: Row | undefined): FocusInvoice | null {
  if (!r) return null
  return {
    id: String(r.id),
    number: String(r.number ?? ''),
    customer_name: String(r.customer_name),
    amount: Number(r.amount),
    currency: String(r.currency),
    due_on: String(r.due_on),
    total: Number(r.total ?? 1),
  }
}

export type CustomerCard = {
  id: string
  name: string
  phone: string | null
  email: string | null
  note: string | null
  created_at: Date
  segment: SegmentKey | null
  visits: number
  lastVisit: Date | null
  nextVisit: { start: Date; end: Date; service: string | null } | null
  loyalty: { stamps: number; needed: number; reward: string; status: string } | null
}

/** Karta zákazníka pro Dnes a pravý panel. Cizí nebo neexistující = null. */
export async function getCustomerCard(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  customerId: string,
  now: Date = new Date(),
): Promise<CustomerCard | null> {
  const accountId = ctx.accountId
  const businessId = business.id
  const [customer, segment, visits, next, loyalty] = await wsDb(ctx).batch([
    q`
      SELECT id, name, phone, email, note, created_at FROM ws.customers
      WHERE account_id = ${accountId} AND id = ${customerId}
    `,
    q`
      SELECT segment FROM ws.customer_segments
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND customer_id = ${customerId}
    `,
    q`
      SELECT count(*)::int AS n, max(starts_at) AS last FROM ws.appointments
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND customer_id = ${customerId}
        AND kind = 'visit' AND (status = 'completed' OR (status = 'confirmed' AND ends_at <= ${now}))
    `,
    q`
      SELECT a.starts_at, a.ends_at, s.name AS service_name FROM ws.appointments a
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${accountId} AND a.business_id = ${businessId} AND a.customer_id = ${customerId}
        AND a.kind = 'visit' AND a.status = 'confirmed' AND a.ends_at > ${now}
      ORDER BY a.starts_at LIMIT 1
    `,
    q`
      SELECT p.enabled, p.stamps_needed, p.reward_text, c.stamps, c.status
      FROM ws.loyalty_programs p
      LEFT JOIN ws.loyalty_cards c
        ON c.account_id = p.account_id AND c.program_id = p.id AND c.customer_id = ${customerId}
        AND c.status IN ('active', 'full')
      WHERE p.account_id = ${accountId} AND p.business_id = ${businessId}
    `,
  ])

  const c = (customer as Row[])[0]
  if (!c) return null
  const v = (visits as Row[])[0] ?? {}
  const n = (next as Row[])[0]
  const l = (loyalty as Row[])[0]

  return {
    id: String(c.id),
    name: String(c.name),
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    note: (c.note as string | null) ?? null,
    created_at: c.created_at as Date,
    segment: ((segment as Row[])[0]?.segment as SegmentKey | undefined) ?? null,
    visits: Number(v.n ?? 0),
    lastVisit: (v.last as Date | null) ?? null,
    nextVisit: n
      ? { start: n.starts_at as Date, end: n.ends_at as Date, service: (n.service_name as string | null) ?? null }
      : null,
    loyalty:
      l && l.enabled
        ? {
            stamps: Number(l.stamps ?? 0),
            needed: Number(l.stamps_needed),
            reward: String(l.reward_text ?? ''),
            status: String(l.status ?? 'active'),
          }
        : null,
  }
}

export type RequestDetail = {
  id: string
  status: string
  source: string
  customer_id: string | null
  customer_name: string
  contact: { name?: string; phone?: string; email?: string }
  service_id: string | null
  service_name: string | null
  /** Délka služby v minutách (pro konec termínu, když zákazník zadal jen začátek). */
  duration_min: number | null
  wanted_start: Date | null
  wanted_end: Date | null
  message: string | null
  created_at: Date
  fields: { label: string; value: string }[]
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(', ')
  if (typeof value === 'object') return ''
  return String(value).slice(0, 2000)
}

/** Poptávka pro pravý panel. Cizí nebo z jiného byznysu = null. */
export async function getRequestDetail(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  requestId: string,
): Promise<RequestDetail | null> {
  const accountId = ctx.accountId
  const businessId = business.id
  const [rows, defs] = await wsDb(ctx).batch([
    q`
      SELECT r.id, r.status, r.source, r.customer_id, r.contact, r.field_values, r.message,
             r.wanted_start, r.wanted_end, r.created_at, r.service_id, s.name AS service_name, s.duration_min,
             COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS customer_name
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${accountId} AND r.business_id = ${businessId} AND r.id = ${requestId}
    `,
    q`
      SELECT key, label FROM ws.field_definitions
      WHERE account_id = ${accountId} AND business_id = ${businessId}
      ORDER BY position
    `,
  ])
  const r = (rows as Row[])[0]
  if (!r) return null

  const values = (r.field_values ?? {}) as Record<string, unknown>
  const contact = (r.contact ?? {}) as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' && x ? x.slice(0, 200) : undefined)
  const fields = (defs as Row[])
    .map((d) => ({ label: String(d.label), value: fieldText(values[String(d.key)]) }))
    .filter((f) => f.value)

  return {
    id: String(r.id),
    status: String(r.status),
    source: String(r.source),
    customer_id: (r.customer_id as string | null) ?? null,
    customer_name: String(r.customer_name),
    contact: { name: str(contact.name), phone: str(contact.phone), email: str(contact.email) },
    service_id: (r.service_id as string | null) ?? null,
    service_name: (r.service_name as string | null) ?? null,
    duration_min: r.duration_min === null || r.duration_min === undefined ? null : Number(r.duration_min),
    wanted_start: (r.wanted_start as Date | null) ?? null,
    wanted_end: (r.wanted_end as Date | null) ?? null,
    message: (r.message as string | null) ?? null,
    created_at: r.created_at as Date,
    fields,
  }
}

export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; created_at: Date; read: boolean }

/** Dotazy na zvonek: posledních 8 upozornění a počet nepřečtených (pro jednu dávku s dalšími). */
export function notificationQueries(ctx: WsContext, business: Pick<WsBusiness, 'id'>): [WsQuery, WsQuery] {
  return [
    q`
      SELECT id, title, body, link, created_at, read_at IS NOT NULL AS read FROM ws.notifications
      WHERE account_id = ${ctx.accountId} AND (business_id = ${business.id} OR business_id IS NULL)
      ORDER BY created_at DESC LIMIT 8
    `,
    q`
      SELECT count(*)::int AS n FROM ws.notifications
      WHERE account_id = ${ctx.accountId} AND (business_id = ${business.id} OR business_id IS NULL) AND read_at IS NULL
    `,
  ]
}

export function notificationsFrom([items, unread]: DbRow[][]): { items: NotificationItem[]; unread: number } {
  return {
    items: items as unknown as NotificationItem[],
    unread: Number((unread as Row[])[0]?.n ?? 0),
  }
}

/** Upozornění v aplikaci (zvonek). Vznikají z událostí (S15), přečtená po otevření zvonku. */
export async function getNotifications(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
): Promise<{ items: NotificationItem[]; unread: number }> {
  return notificationsFrom(await wsDb(ctx).batch(notificationQueries(ctx, business)))
}

/** Zapnuté funkce byznysu. */
export async function getEnabledModules(ctx: WsContext, business: Pick<WsBusiness, 'id'>): Promise<Set<string>> {
  // Layout je načetl s kontextem (lib/ws/scope.ts) — stránka se podruhé neptá.
  const seeded = seededModules(ctx.accountId, business.id)
  if (seeded) return seeded
  const rows = await wsDb(ctx)<{ module: string }>`
    SELECT module FROM ws.business_modules
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND enabled
  `
  return new Set(rows.map((r) => r.module))
}

/** Byznysy účtu pro přepínač. */
export async function getBusinesses(ctx: WsContext): Promise<{ name: string; slug: string }[]> {
  return wsDb(ctx)<{ name: string; slug: string }>`
    SELECT name, slug FROM ws.businesses
    WHERE account_id = ${ctx.accountId} AND archived_at IS NULL
    ORDER BY created_at
  `
}
