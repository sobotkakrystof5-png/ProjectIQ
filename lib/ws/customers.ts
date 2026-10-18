import 'server-only'
import { isUniqueViolation, q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import { likePattern } from './search'
import { daysBetween } from './time'
import type { SegmentKey } from './today'

// Zákazníci (S12): seznam se skupinami, razítky a útratou, detail v pravém
// panelu, úpravy, souhlas s kontaktem, ukončení a sloučení duplicit.
// Zákazník patří účtu (migrace 067); v byznysu jsou ti, kdo v něm mají
// poptávku, termín, zakázku nebo skupinu.

type Biz = Pick<WsBusiness, 'id'>

export const SEGMENT_FILTERS = ['new', 'regular', 'one_time', 'dormant', 'ended'] as const

export type CustomerListItem = {
  id: string
  name: string
  phone: string | null
  email: string | null
  consent: boolean
  unsubscribed: boolean
  ended: boolean
  segment: SegmentKey | null
  lastVisit: Date | null
  visits: number
  nextVisit: Date | null
  /** CZK — jiné měny se do útraty nesčítají (B3). */
  spend: number
  card: { stamps: number; needed: number; full: boolean } | null
}

export type NextStep =
  | { kind: 'reward' }
  | { kind: 'booked'; at: Date }
  | { kind: 'winback' }
  | { kind: 'almost' }
  | { kind: 'second_visit' }
  | { kind: 'first_visit' }
  | null

/** „Další krok“ v tabulce: co s tím zákazníkem udělat teď (první, co platí). */
export function nextStepFor(c: Pick<CustomerListItem, 'segment' | 'nextVisit' | 'card' | 'visits' | 'lastVisit'>): NextStep {
  if (c.segment === 'ended') return null
  if (c.card?.full) return { kind: 'reward' }
  if (c.nextVisit) return { kind: 'booked', at: c.nextVisit }
  if (c.segment === 'dormant') return { kind: 'winback' }
  if (c.card && c.card.needed >= 2 && c.card.stamps === c.card.needed - 1) return { kind: 'almost' }
  if (c.segment === 'new' && c.lastVisit) return { kind: 'second_visit' }
  if (!c.lastVisit) return { kind: 'first_visit' }
  return null
}

const LIST_LIMIT = 300

/** Zákazník patří do byznysu (fragment WHERE nad aliasem `c`). */
const inBusiness = (biz: string) => q`(
  EXISTS (SELECT 1 FROM ws.requests r WHERE r.account_id = c.account_id AND r.business_id = ${biz} AND r.customer_id = c.id AND NOT r.is_test)
  OR EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = c.account_id AND a.business_id = ${biz} AND a.customer_id = c.id)
  OR EXISTS (SELECT 1 FROM ws.jobs j WHERE j.account_id = c.account_id AND j.business_id = ${biz} AND j.customer_id = c.id)
  OR EXISTS (SELECT 1 FROM ws.customer_segments s WHERE s.account_id = c.account_id AND s.business_id = ${biz} AND s.customer_id = c.id)
)`

/** Vloží fragment q`` do dotazu (tag q sám fragmenty neumí). */
function compose(parts: (string | { text: string; params: readonly unknown[] })[]) {
  let text = ''
  const params: unknown[] = []
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part
      continue
    }
    text += part.text.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + params.length}`)
    params.push(...part.params)
  }
  return { text, params }
}

export type CustomerList = {
  items: CustomerListItem[]
  counts: Record<SegmentKey | 'all', number>
  truncated: boolean
}

export async function getCustomersList(
  ctx: WsContext,
  business: Biz,
  opts: { segment?: SegmentKey | null; query?: string | null; now?: Date } = {},
): Promise<CustomerList> {
  const acc = ctx.accountId
  const biz = business.id
  const now = opts.now ?? new Date()
  const text = (opts.query ?? '').trim().slice(0, 80)
  const pattern = text.length >= 2 ? likePattern(text) : null
  const digits = text.replace(/\D/g, '')
  const phonePattern = pattern && digits.length >= 3 ? likePattern(digits) : null
  const segment = opts.segment ?? null

  const list = compose([
    q`
      SELECT c.id, c.name, c.phone, c.email, c.contact_consent_at, c.unsubscribed_at, c.ended_at, cs.segment, cs.last_visit_at, cs.visits_12m,
        lc.stamps, lc.status AS card_status, p.stamps_needed,
        (SELECT min(a.starts_at) FROM ws.appointments a
          WHERE a.account_id = c.account_id AND a.business_id = ${biz} AND a.customer_id = c.id
            AND a.kind = 'visit' AND a.status = 'confirmed' AND a.starts_at > ${now}) AS next_visit,
        (SELECT COALESCE(sum(t.amount), 0) FROM ws.transactions t
          WHERE t.account_id = c.account_id AND t.business_id = ${biz} AND t.customer_id = c.id
            AND t.kind = 'income' AND t.currency = 'CZK') AS spend
      FROM ws.customers c
      LEFT JOIN ws.customer_segments cs ON cs.account_id = c.account_id AND cs.business_id = ${biz} AND cs.customer_id = c.id
      LEFT JOIN ws.loyalty_programs p ON p.account_id = c.account_id AND p.business_id = ${biz} AND p.enabled
      LEFT JOIN ws.loyalty_cards lc ON lc.account_id = c.account_id AND lc.program_id = p.id AND lc.customer_id = c.id
        AND lc.status IN ('active', 'full')
      WHERE c.account_id = ${acc} AND `,
    inBusiness(biz),
    q`
        AND (${segment}::text IS NULL OR cs.segment = ${segment}::text)
        AND (${pattern}::text IS NULL OR c.name ILIKE ${pattern}::text OR c.email ILIKE ${pattern}::text
             OR (${phonePattern}::text IS NOT NULL AND c.phone LIKE ${phonePattern}::text))
      ORDER BY cs.last_visit_at DESC NULLS LAST, c.created_at DESC
      LIMIT ${LIST_LIMIT + 1}
    `,
  ])
  const counts = compose([
    q`
      SELECT cs.segment, count(*)::int AS n FROM ws.customers c
      LEFT JOIN ws.customer_segments cs ON cs.account_id = c.account_id AND cs.business_id = ${biz} AND cs.customer_id = c.id
      WHERE c.account_id = ${acc} AND `,
    inBusiness(biz),
    ' GROUP BY cs.segment',
  ])

  const [rows, countRows] = await wsDb(ctx).batch([list, counts])
  const all = rows as WsRow[]
  const tally: Record<SegmentKey | 'all', number> = { all: 0, new: 0, regular: 0, one_time: 0, dormant: 0, ended: 0 }
  for (const r of countRows as WsRow[]) {
    tally.all += Number(r.n)
    if (r.segment) tally[r.segment as SegmentKey] = Number(r.n)
  }

  return {
    items: all.slice(0, LIST_LIMIT).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      consent: r.contact_consent_at !== null && r.contact_consent_at !== undefined,
      unsubscribed: r.unsubscribed_at !== null && r.unsubscribed_at !== undefined,
      ended: r.ended_at !== null && r.ended_at !== undefined,
      segment: (r.segment as SegmentKey | null) ?? null,
      lastVisit: (r.last_visit_at as Date | null) ?? null,
      visits: Number(r.visits_12m ?? 0),
      nextVisit: (r.next_visit as Date | null) ?? null,
      spend: Number(r.spend ?? 0),
      card:
        r.stamps_needed !== null && r.stamps_needed !== undefined
          ? { stamps: Number(r.stamps ?? 0), needed: Number(r.stamps_needed), full: r.card_status === 'full' }
          : null,
    })),
    counts: tally,
    truncated: all.length > LIST_LIMIT,
  }
}

// --- Detail -------------------------------------------------------------------

export type HistoryItem = {
  id: string
  kind: 'visit' | 'job'
  at: Date
  title: string
  status: string
  paid: number | null
  currency: string
}

export type CustomerDetail = {
  id: string
  name: string
  phone: string | null
  email: string | null
  birthday: string | null
  note: string | null
  consent: boolean
  unsubscribed: boolean
  ended: boolean
  endedReason: string | null
  createdAt: Date
  segment: SegmentKey | null
  visits: number
  firstVisit: Date | null
  lastVisit: Date | null
  intervalDays: number | null
  nextVisit: { id: string; start: Date; end: Date; service: string | null } | null
  spend: { currency: string; amount: number }[]
  history: HistoryItem[]
  loyalty: { enabled: boolean; stamps: number; needed: number; status: 'active' | 'full' | 'redeemed' | 'empty'; full: boolean; reward: string } | null
  messages: { id: string; type: string; subject: string | null; status: string; sentAt: Date | null; createdAt: Date }[]
  /** Zákazníci se stejným jménem — kandidáti na sloučení. */
  duplicates: { id: string; name: string; phone: string | null; email: string | null }[]
}

export async function getCustomerDetail(ctx: WsContext, business: Biz, customerId: string, now: Date = new Date()): Promise<CustomerDetail | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [customerRows, segRows, nextRows, spendRows, historyRows, loyaltyRows, dupRows, messageRows] = await wsDb(ctx).batch([
    q`
      SELECT id, name, phone, email, birthday::text AS birthday, note, contact_consent_at, unsubscribed_at, ended_at, ended_reason, created_at
      FROM ws.customers WHERE account_id = ${acc} AND id = ${customerId}
    `,
    q`
      SELECT segment, visits_12m, first_visit_at, last_visit_at, typical_interval_days FROM ws.customer_segments
      WHERE account_id = ${acc} AND business_id = ${biz} AND customer_id = ${customerId}
    `,
    q`
      SELECT a.id, a.starts_at, a.ends_at, s.name AS service_name FROM ws.appointments a
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.customer_id = ${customerId}
        AND a.kind = 'visit' AND a.status = 'confirmed' AND a.starts_at > ${now}
      ORDER BY a.starts_at LIMIT 1
    `,
    q`
      SELECT currency, sum(amount) AS amount FROM ws.transactions
      WHERE account_id = ${acc} AND business_id = ${biz} AND customer_id = ${customerId} AND kind = 'income'
      GROUP BY currency ORDER BY currency
    `,
    q`
      SELECT * FROM (
        SELECT a.id, 'visit' AS kind, a.starts_at AS at, COALESCE(s.name, a.title, 'Návštěva') AS title, a.status,
          (SELECT sum(t.amount) FROM ws.transactions t WHERE t.account_id = a.account_id AND t.appointment_id = a.id AND t.kind = 'income' AND t.currency = COALESCE(s.currency, 'CZK')) AS paid,
          COALESCE(s.currency, 'CZK') AS currency
        FROM ws.appointments a
        LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
        WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.customer_id = ${customerId} AND a.kind = 'visit'
          AND a.starts_at <= ${now}
        UNION ALL
        SELECT j.id, 'job', j.created_at, j.title, COALESCE(st.name, ''),
          (SELECT sum(t.amount) FROM ws.transactions t WHERE t.account_id = j.account_id AND t.job_id = j.id AND t.kind = 'income'
             AND t.appointment_id IS NULL AND t.currency = j.currency),
          j.currency
        FROM ws.jobs j
        LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
        WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.customer_id = ${customerId}
      ) h ORDER BY at DESC LIMIT 30
    `,
    q`
      SELECT p.enabled, p.stamps_needed, p.reward_text, c.stamps, c.status
      FROM ws.loyalty_programs p
      LEFT JOIN LATERAL (
        SELECT lc.stamps, lc.status FROM ws.loyalty_cards lc
        WHERE lc.account_id = p.account_id AND lc.program_id = p.id AND lc.customer_id = ${customerId}
          AND lc.status IN ('active', 'full', 'redeemed')
        ORDER BY CASE WHEN lc.status IN ('active', 'full') THEN 0 ELSE 1 END, lc.created_at DESC
        LIMIT 1
      ) c ON true
      WHERE p.account_id = ${acc} AND p.business_id = ${biz}
    `,
    q`
      SELECT o.id, o.name, o.phone, o.email FROM ws.customers o
      JOIN ws.customers me ON me.account_id = o.account_id AND me.id = ${customerId}
      WHERE o.account_id = ${acc} AND o.id <> me.id AND lower(trim(o.name)) = lower(trim(me.name))
      ORDER BY o.created_at LIMIT 5
    `,
    q`
      SELECT id, type, subject, status, sent_at, created_at FROM ws.outbound_messages
      WHERE account_id = ${acc} AND business_id = ${biz} AND customer_id = ${customerId}
        AND type IN ('customer_thanks', 'customer_booking', 'customer_offer', 'customer_job', 'customer_custom')
      ORDER BY created_at DESC LIMIT 5
    `,
  ])

  const c = (customerRows as WsRow[])[0]
  if (!c) return null
  const seg = (segRows as WsRow[])[0]
  const next = (nextRows as WsRow[])[0]
  const l = (loyaltyRows as WsRow[])[0]
  const dateOrNull = (v: unknown) => (v as Date | null | undefined) ?? null

  return {
    id: String(c.id),
    name: String(c.name),
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    birthday: (c.birthday as string | null) ?? null,
    note: (c.note as string | null) ?? null,
    consent: c.contact_consent_at !== null && c.contact_consent_at !== undefined,
    unsubscribed: c.unsubscribed_at !== null && c.unsubscribed_at !== undefined,
    ended: c.ended_at !== null && c.ended_at !== undefined,
    endedReason: (c.ended_reason as string | null) ?? null,
    createdAt: c.created_at as Date,
    segment: (seg?.segment as SegmentKey | undefined) ?? null,
    visits: Number(seg?.visits_12m ?? 0),
    firstVisit: dateOrNull(seg?.first_visit_at),
    lastVisit: dateOrNull(seg?.last_visit_at),
    intervalDays: seg?.typical_interval_days ? Number(seg.typical_interval_days) : null,
    nextVisit: next
      ? { id: String(next.id), start: next.starts_at as Date, end: next.ends_at as Date, service: (next.service_name as string | null) ?? null }
      : null,
    spend: (spendRows as WsRow[]).map((r) => ({ currency: String(r.currency), amount: Number(r.amount) })),
    history: (historyRows as WsRow[]).map((r) => ({
      id: String(r.id),
      kind: r.kind === 'job' ? 'job' : 'visit',
      at: r.at as Date,
      title: String(r.title),
      status: String(r.status),
      paid: r.paid === null || r.paid === undefined ? null : Number(r.paid),
      currency: String(r.currency),
    })),
    loyalty:
      l && l.enabled
        ? {
            enabled: true,
            stamps: Number(l.stamps ?? 0),
            needed: Number(l.stamps_needed),
            status: (l.status as 'active' | 'full' | 'redeemed' | null) ?? 'empty',
            full: l.status === 'full',
            reward: String(l.reward_text ?? ''),
          }
        : null,
    messages: (messageRows as WsRow[]).map((r) => ({
      id: String(r.id),
      type: String(r.type),
      subject: (r.subject as string | null) ?? null,
      status: String(r.status),
      sentAt: dateOrNull(r.sent_at),
      createdAt: r.created_at as Date,
    })),
    duplicates: (dupRows as WsRow[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
    })),
  }
}

/** Zákazníci účtu pro výběr „Sloučit s…“ (bez toho, kdo se slučuje). */
export async function searchMergeCandidates(
  ctx: WsContext,
  customerId: string,
  raw: string,
): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]> {
  const text = raw.trim().slice(0, 80)
  if (text.length < 2) return []
  const pattern = likePattern(text)
  const digits = text.replace(/\D/g, '')
  const phonePattern = digits.length >= 3 ? likePattern(digits) : null
  const rows = await wsDb(ctx)`
    SELECT id, name, phone, email FROM ws.customers
    WHERE account_id = ${ctx.accountId} AND id <> ${customerId}
      AND (name ILIKE ${pattern} OR email ILIKE ${pattern} OR (${phonePattern}::text IS NOT NULL AND phone LIKE ${phonePattern}::text))
    ORDER BY name LIMIT 8
  `
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
  }))
}

// --- Zápisy -------------------------------------------------------------------

export type CustomerUpdate = {
  name: string
  phone: string | null
  email: string | null
  birthday: string | null
  note: string | null
}

export type UpdateCustomerResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'duplicate'; other: { id: string; name: string } | null }

/** Úprava kontaktu. Telefon nebo e-mail jiného zákazníka → nabídne sloučení. */
export async function updateCustomer(ctx: WsContext, customerId: string, input: CustomerUpdate): Promise<UpdateCustomerResult> {
  const acc = ctx.accountId
  try {
    const rows = await wsDb(ctx)`
      UPDATE ws.customers SET name = ${input.name}, phone = ${input.phone}, email = ${input.email},
        birthday = ${input.birthday}::date, note = ${input.note}
      WHERE account_id = ${acc} AND id = ${customerId}
      RETURNING id
    `
    return rows[0] ? { ok: true } : { ok: false, reason: 'not_found' }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const [other] = await wsDb(ctx)`
      SELECT id, name FROM ws.customers
      WHERE account_id = ${acc} AND id <> ${customerId}
        AND ((${input.phone}::text IS NOT NULL AND phone = ${input.phone}::text) OR (${input.email}::text IS NOT NULL AND email = ${input.email}::text))
      LIMIT 1
    `
    return { ok: false, reason: 'duplicate', other: other ? { id: String(other.id), name: String(other.name) } : null }
  }
}

/** Doplnění telefonu nebo e-mailu přímo z karty zákazníka. */
export async function updateCustomerContact(
  ctx: WsContext,
  customerId: string,
  field: 'phone' | 'email',
  value: string,
): Promise<UpdateCustomerResult> {
  const acc = ctx.accountId
  try {
    const rows = field === 'phone'
      ? await wsDb(ctx)`UPDATE ws.customers SET phone = ${value} WHERE account_id = ${acc} AND id = ${customerId} RETURNING id`
      : await wsDb(ctx)`UPDATE ws.customers SET email = ${value} WHERE account_id = ${acc} AND id = ${customerId} RETURNING id`
    return rows[0] ? { ok: true } : { ok: false, reason: 'not_found' }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const [other] = field === 'phone'
      ? await wsDb(ctx)`SELECT id, name FROM ws.customers WHERE account_id = ${acc} AND id <> ${customerId} AND phone = ${value} LIMIT 1`
      : await wsDb(ctx)`SELECT id, name FROM ws.customers WHERE account_id = ${acc} AND id <> ${customerId} AND email = ${value} LIMIT 1`
    return { ok: false, reason: 'duplicate', other: other ? { id: String(other.id), name: String(other.name) } : null }
  }
}

/** Souhlas se zasíláním nabídek („Komu napsat“ ukazuje jen zákazníky se souhlasem). */
export async function setContactConsent(ctx: WsContext, customerId: string, consent: boolean): Promise<boolean> {
  const rows = await wsDb(ctx)`
    UPDATE ws.customers SET
      contact_consent_at = CASE WHEN ${consent} THEN COALESCE(contact_consent_at, now()) ELSE NULL END,
      unsubscribed_at = CASE WHEN ${consent} THEN NULL ELSE unsubscribed_at END
    WHERE account_id = ${ctx.accountId} AND id = ${customerId}
    RETURNING id
  `
  return rows.length > 0
}

/** Ruční ukončení spolupráce (skupina Ukončení) a jeho vrácení. */
export async function setCustomerEnded(ctx: WsContext, customerId: string, ended: boolean, reason: string | null): Promise<boolean> {
  const rows = await wsDb(ctx)`
    UPDATE ws.customers SET
      ended_at = CASE WHEN ${ended} THEN COALESCE(ended_at, now()) ELSE NULL END,
      ended_reason = CASE WHEN ${ended} THEN ${reason}::text ELSE NULL END
    WHERE account_id = ${ctx.accountId} AND id = ${customerId}
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Sloučí duplicitního zákazníka `dropId` do `keepId` (R-046): všechno se
 * přesune, razítka se sečtou, duplikát se smaže, záznam v audit_log.
 */
export async function mergeCustomers(ctx: WsContext, keepId: string, dropId: string): Promise<boolean> {
  const [row] = await wsDb(ctx)`SELECT ws.merge_customers(${ctx.accountId}, ${keepId}::uuid, ${dropId}::uuid, ${ctx.userId}) AS ok`
  return Boolean(row?.ok)
}

// --- Pomůcky pro „Komu napsat“ a kartu -----------------------------------------

/** Nejbližší narozeniny od `today` (29. 2. slaví v nepřestupném roce 28. 2.). */
export function nextBirthday(birthday: string, today: string): { date: string; inDays: number } {
  const [, m, d] = birthday.split('-').map(Number)
  const year = Number(today.slice(0, 4))
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
    const day = m === 2 && d === 29 && !leap ? 28 : d
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  let date = on(year)
  if (date < today) date = on(year + 1)
  return { date, inDays: daysBetween(today, date) }
}
