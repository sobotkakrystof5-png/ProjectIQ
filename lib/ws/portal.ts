import 'server-only'
import { q, wsDb, wsSystem, type WsRow } from './db'
import type { WsContext } from './context'
import { cancelAppointment, moveAppointment } from './bookings'
import { loadIntakeConfig, loadSlotData, loadSlots } from './intake/intake'
import { freeStaffAt, type DaySlots } from './intake/slots'
import { calendarUrl, signLink } from './email/links'
import { deliver, notifyAppointmentMoved, notifyPortalEvent } from './email/notify'
import { cancelQueued } from './email/queue'
import { changeDeadline, portalRules, type PortalRules } from './portal-rules'
import { pragueToUtc } from './time'

// Klientský portál /z/[token] (S16, R-051). Zákazník bez přihlášení vidí svůj
// termín nebo zakázku. Token je náhodný (generuje DB), účet z něj zjistí jen
// úzká funkce ws.portal_lookup — potom už všechno běží pod RLS s filtrem
// account_id + business_id jako v aplikaci.
//
// Co se ze záznamu čte, je vyjmenované tady. Interní poznámky
// (appointments.note, customers.note, field_values), kontakty a ceny se do
// portálu nikdy nedostanou; zákazník vidí jen zprávy z ws.job_updates.
//
// Neplatný token, cizí token, vypnutá funkce i archivovaný byznys = null
// (stránka vrátí stejnou 404, nic se neprozradí).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PortalRef = { accountId: string; businessId: string; kind: 'appointment' | 'job' | 'request'; id: string }

/** Kontext pro sdílené funkce (bookings, intake): jen účet, žádný přihlášený člověk. */
const portalCtx = (accountId: string): WsContext => ({ userId: 'system:portal', accountId, role: 'staff' })

export async function resolvePortal(token: unknown): Promise<PortalRef | null> {
  if (typeof token !== 'string' || !UUID_RE.test(token)) return null
  const [row] = await wsSystem`SELECT * FROM ws.portal_lookup(${token.toLowerCase()}::uuid)`
  if (!row) return null
  const ref: PortalRef = {
    accountId: String(row.account_id),
    businessId: String(row.business_id),
    kind: row.kind === 'job' || row.kind === 'request' ? row.kind : 'appointment',
    id: String(row.record_id),
  }
  const [on] = await wsDb(ref)`
    SELECT 1 FROM ws.business_modules
    WHERE account_id = ${ref.accountId} AND business_id = ${ref.businessId} AND module = 'portal' AND enabled`
  return on ? ref : null
}

// --- Co portál ukazuje -------------------------------------------------------

export type PortalBrand = { name: string; slug: string; color: string | null; address: string | null }

export type PortalVisit = {
  start: Date
  end: Date
  service: string | null
  state: 'upcoming' | 'past' | 'completed' | 'cancelled' | 'no_show'
  canCancel: boolean
  canMove: boolean
  /** Do kdy jde termín změnit (jen když teď jde). */
  deadline: Date | null
  /** Proč změnit nejde: off = firma to nedovoluje, late = je pozdě. */
  locked: 'off' | 'late' | null
  calendarUrl: string | null
}

export type PortalStage = { name: string; state: 'done' | 'current' | 'todo' }

export type PortalJob = {
  title: string
  stages: PortalStage[]
  cancelled: boolean
  finished: boolean
  updates: { body: string; at: Date }[]
  resultUrl: string | null
  invoices: { id: string; number: string; amount: number; currency: string; dueOn: string | null; paid: boolean }[]
  visits: { start: Date; end: Date; service: string | null; token: string }[]
}

export type PortalRequest = {
  status: string
  start: Date | null
  end: Date | null
  service: string | null
}

export type PortalView = {
  brand: PortalBrand
  firstName: string | null
  visit: PortalVisit | null
  job: PortalJob | null
  request: PortalRequest | null
  loyalty: { stamps: number; needed: number; status: 'active' | 'full' | 'redeemed' | 'empty'; reward: string } | null
  /** null = hodnocení je vypnuté. */
  review: { eligible: boolean; done: { score: number; comment: string | null } | null } | null
}

type Base = {
  brand: PortalBrand
  rules: PortalRules
  modules: Set<string>
  hasHours: boolean
  customerId: string | null
  customerName: string | null
  row: WsRow
}

async function loadBase(ref: PortalRef): Promise<Base | null> {
  const acc = ref.accountId
  const biz = ref.businessId
  const record =
    ref.kind === 'appointment'
      ? q`SELECT a.status, a.starts_at, a.ends_at, a.staff_id, a.service_id, a.customer_id, c.name AS customer_name,
                 a.group_id,
                 (SELECT min(a2.starts_at) FROM ws.appointments a2 WHERE a2.account_id = a.account_id AND a2.business_id = a.business_id
                   AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))) AS group_starts_at,
                 (SELECT max(a2.ends_at) FROM ws.appointments a2 WHERE a2.account_id = a.account_id AND a2.business_id = a.business_id
                   AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))) AS group_ends_at,
                 ARRAY(SELECT a2.service_id FROM ws.appointments a2 WHERE a2.account_id = a.account_id AND a2.business_id = a.business_id
                   AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))
                   ORDER BY a2.starts_at) AS service_ids,
                 (SELECT sum(COALESCE(s2.buffer_min, 0)) FROM ws.appointments a2
                   LEFT JOIN ws.services s2 ON s2.account_id = a2.account_id AND s2.id = a2.service_id
                   WHERE a2.account_id = a.account_id AND a2.business_id = a.business_id
                     AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))) AS buffer_min,
                 COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY a2.starts_at) FROM ws.appointments a2
                   LEFT JOIN ws.services s2 ON s2.account_id = a2.account_id AND s2.id = a2.service_id
                   WHERE a2.account_id = a.account_id AND a2.business_id = a.business_id
                     AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))), s.name) AS service
          FROM ws.appointments a
          LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
          LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
          WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.id = ${ref.id} AND a.kind = 'visit'`
      : ref.kind === 'request'
        ? q`SELECT r.status, r.wanted_start AS starts_at, r.wanted_end AS ends_at,
                   r.customer_id, c.name AS customer_name,
                   COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY rs.position)
                     FROM ws.request_services rs JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
                     WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.name) AS service
            FROM ws.requests r
            LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
            LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
            WHERE r.account_id = ${acc} AND r.business_id = ${biz} AND r.id = ${ref.id}
              AND NOT r.is_test AND r.customer_id IS NOT NULL`
        : q`SELECT j.title, j.stage_id, j.closed_at, j.result_url, j.customer_id, c.name AS customer_name, st.type AS stage_type
          FROM ws.jobs j
          LEFT JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
          LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
          WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.id = ${ref.id}`
  const [bizRows, modules, hours, rows] = await wsDb(ref).batch([
    q`SELECT name, slug, color, settings FROM ws.businesses WHERE account_id = ${acc} AND id = ${biz} AND archived_at IS NULL`,
    q`SELECT module FROM ws.business_modules WHERE account_id = ${acc} AND business_id = ${biz} AND enabled`,
    q`SELECT EXISTS (SELECT 1 FROM ws.opening_hours WHERE account_id = ${acc} AND business_id = ${biz}) AS has`,
    record,
  ])
  const b = (bizRows as WsRow[])[0]
  const row = (rows as WsRow[])[0]
  if (!b || !row) return null
  const rules = portalRules(b.settings)
  return {
    brand: { name: String(b.name), slug: String(b.slug), color: (b.color as string | null) ?? null, address: rules.address },
    rules,
    modules: new Set((modules as WsRow[]).map((m) => String(m.module))),
    hasHours: Boolean((hours as WsRow[])[0]?.has),
    customerId: (row.customer_id as string | null) ?? null,
    customerName: (row.customer_name as string | null) ?? null,
    row,
  }
}

function visitView(ref: PortalRef, base: Base, now: Date): PortalVisit {
  const r = base.row
  const start = new Date((r.group_starts_at as string | null) ?? (r.starts_at as string))
  const end = new Date((r.group_ends_at as string | null) ?? (r.ends_at as string))
  const status = String(r.status)
  const upcoming = status === 'confirmed' && start > now
  const deadline = changeDeadline(start, base.rules.changeHours)
  const open = upcoming && deadline !== null && now <= deadline
  const state: PortalVisit['state'] =
    status === 'cancelled' ? 'cancelled' : status === 'no_show' ? 'no_show' : status === 'completed' ? 'completed' : upcoming ? 'upcoming' : 'past'
  return {
    start,
    end,
    service: (r.service as string | null) ?? null,
    state,
    canCancel: open,
    canMove: open && base.modules.has('calendar') && base.hasHours,
    deadline: open ? deadline : null,
    locked: !upcoming ? null : base.rules.changeHours === null ? 'off' : open ? null : 'late',
    calendarUrl: upcoming ? calendarUrl(signLink({ kind: 'c', accountId: ref.accountId, id: ref.id })) : null,
  }
}

const isFinishedType = (t: unknown) => t === 'done' || t === 'paid'

function visitReviewable(base: Base, now: Date): boolean {
  const s = String(base.row.status)
  const end = (base.row.group_ends_at as string | null) ?? (base.row.ends_at as string)
  return s === 'completed' || (s === 'confirmed' && new Date(end) <= now)
}

function jobFinished(base: Base): { finished: boolean; cancelled: boolean } {
  const cancelled = base.row.stage_type === 'cancelled'
  return { cancelled, finished: !cancelled && (isFinishedType(base.row.stage_type) || base.row.closed_at !== null) }
}

export async function loadPortal(ref: PortalRef, now: Date = new Date()): Promise<PortalView | null> {
  const base = await loadBase(ref)
  if (!base) return null
  if (ref.kind === 'request') {
    return {
      brand: base.brand,
      firstName: base.customerName ? base.customerName.trim().split(/\s+/)[0].slice(0, 40) || null : null,
      visit: null,
      job: null,
      request: {
        status: String(base.row.status),
        start: (base.row.starts_at as Date | null) ?? null,
        end: (base.row.ends_at as Date | null) ?? null,
        service: (base.row.service as string | null) ?? null,
      },
      loyalty: null,
      review: null,
    }
  }
  const acc = ref.accountId
  const biz = ref.businessId
  const cust = base.customerId
  const loyaltyOn = base.modules.has('loyalty') && cust !== null
  const reviewsOn = base.modules.has('reviews')
  const isJob = ref.kind === 'job'

  const none = q`SELECT 1 WHERE false`
  const [loyalty, review, stages, updates, invoices, visits] = await wsDb(ref).batch([
    loyaltyOn
      ? q`SELECT p.stamps_needed, p.reward_text, c.stamps, c.status
          FROM ws.loyalty_programs p
          LEFT JOIN LATERAL (
            SELECT lc.stamps, lc.status FROM ws.loyalty_cards lc
            WHERE lc.account_id = p.account_id AND lc.program_id = p.id AND lc.customer_id = ${cust}
              AND lc.status IN ('active', 'full', 'redeemed')
            ORDER BY CASE WHEN lc.status IN ('active', 'full') THEN 0 ELSE 1 END, lc.created_at DESC
            LIMIT 1
          ) c ON true
          WHERE p.account_id = ${acc} AND p.business_id = ${biz} AND p.enabled`
      : none,
    reviewsOn
      ? isJob
        ? q`SELECT score, comment FROM ws.reviews WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${ref.id}`
        : q`SELECT score, comment FROM ws.reviews WHERE account_id = ${acc} AND business_id = ${biz} AND appointment_id = ${ref.id}`
      : none,
    isJob ? q`SELECT id, name, type FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} ORDER BY position, created_at` : none,
    isJob
      ? q`SELECT body, created_at FROM ws.job_updates
          WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${ref.id} AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 50`
      : none,
    isJob && base.modules.has('invoices')
      ? q`SELECT id, number, amount, currency, due_on::text AS due_on, status FROM ws.invoices
          WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${ref.id}
            AND direction = 'issued' AND status IN ('issued', 'paid') AND number IS NOT NULL
          ORDER BY issued_on DESC NULLS LAST LIMIT 20`
      : none,
    isJob && base.modules.has('calendar')
      ? q`SELECT min(a.starts_at) AS starts_at, max(a.ends_at) AS ends_at,
            (array_agg(a.public_token ORDER BY a.starts_at))[1] AS public_token,
            string_agg(s.name, ' + ' ORDER BY a.starts_at) AS service
          FROM ws.appointments a LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
          WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.job_id = ${ref.id}
            AND a.kind = 'visit' AND a.status = 'confirmed'
          GROUP BY COALESCE(a.group_id, a.id)
          HAVING max(a.ends_at) > ${now}::timestamptz
          ORDER BY min(a.starts_at) LIMIT 10`
      : none,
  ])

  let job: PortalJob | null = null
  if (isJob) {
    const { finished, cancelled } = jobFinished(base)
    const visible = (stages as WsRow[]).filter((s) => s.type !== 'cancelled')
    const idx = Math.max(0, visible.findIndex((s) => s.id === base.row.stage_id))
    job = {
      title: String(base.row.title),
      cancelled,
      finished,
      stages: visible.map((s, i) => ({
        name: String(s.name),
        state: cancelled ? 'todo' : i < idx || (i === idx && finished) ? 'done' : i === idx ? 'current' : 'todo',
      })),
      updates: (updates as WsRow[]).map((u) => ({ body: String(u.body), at: new Date(u.created_at as string) })),
      resultUrl: (base.row.result_url as string | null) ?? null,
      invoices: (invoices as WsRow[]).map((i) => ({
        id: String(i.id),
        number: String(i.number),
        amount: Number(i.amount),
        currency: String(i.currency),
        dueOn: (i.due_on as string | null) ?? null,
        paid: i.status === 'paid',
      })),
      visits: (visits as WsRow[]).map((v) => ({
        start: new Date(v.starts_at as string),
        end: new Date(v.ends_at as string),
        service: (v.service as string | null) ?? null,
        token: String(v.public_token),
      })),
    }
  }

  const l = (loyalty as WsRow[])[0]
  const rv = (review as WsRow[])[0]
  return {
    brand: base.brand,
    firstName: base.customerName ? base.customerName.trim().split(/\s+/)[0].slice(0, 40) || null : null,
    visit: ref.kind === 'appointment' ? visitView(ref, base, now) : null,
    job,
    request: null,
    loyalty: l
      ? {
          stamps: Number(l.stamps ?? 0),
          needed: Number(l.stamps_needed),
          status: (l.status as 'active' | 'full' | 'redeemed' | null) ?? 'empty',
          reward: String(l.reward_text ?? ''),
        }
      : null,
    review: reviewsOn
      ? {
          eligible: !rv && (isJob ? jobFinished(base).finished : visitReviewable(base, now)),
          done: rv ? { score: Number(rv.score), comment: (rv.comment as string | null) ?? null } : null,
        }
      : null,
  }
}

// --- Akce zákazníka ---------------------------------------------------------

export type PortalFailure = 'not_allowed' | 'taken' | 'not_found' | 'duplicate'
export type PortalOutcome = { ok: true } | { ok: false; reason: PortalFailure }

const failed = (reason: PortalFailure): PortalOutcome => ({ ok: false, reason })

async function visitForChange(ref: PortalRef, now: Date) {
  if (ref.kind !== 'appointment') return null
  const base = await loadBase(ref)
  if (!base) return null
  return { base, view: visitView(ref, base, now) }
}

function slotOptions(ref: PortalRef, base: Base) {
  const start = new Date(((base.row.group_starts_at as string | null) ?? (base.row.starts_at as string))).getTime()
  const end = new Date(((base.row.group_ends_at as string | null) ?? (base.row.ends_at as string))).getTime()
  return {
    excludeAppointmentId: ref.id,
    excludeGroupId: (base.row.group_id as string | null) ?? null,
    durationMin: Math.round((end - start) / 60_000) + Number(base.row.buffer_min ?? 0),
  }
}

function appointmentServices(base: Base): string[] {
  return Array.isArray(base.row.service_ids)
    ? (base.row.service_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : typeof base.row.service_id === 'string' ? [base.row.service_id] : []
}

/** Volné časy pro přesun. null = přesunout nejde. */
export async function portalSlots(ref: PortalRef, now: Date = new Date()): Promise<DaySlots[] | null> {
  const v = await visitForChange(ref, now)
  if (!v || !v.view.canMove) return null
  const config = await loadIntakeConfig(ref.accountId, ref.businessId)
  if (!config || config.booking !== 'slots') return null
  const slots = await loadSlots(ref.accountId, config, appointmentServices(v.base), now, slotOptions(ref, v.base))
  const current = v.view.start.getTime()
  return slots
    .map((d) => ({ date: d.date, times: d.times.filter((m) => pragueToUtc(d.date, m).getTime() !== current) }))
    .filter((d) => d.times.length > 0)
}

export async function portalMove(ref: PortalRef, day: string, minutes: number, now: Date = new Date()): Promise<PortalOutcome> {
  const v = await visitForChange(ref, now)
  if (!v) return failed('not_found')
  if (!v.view.canMove) return failed('not_allowed')
  const config = await loadIntakeConfig(ref.accountId, ref.businessId)
  if (!config || config.booking !== 'slots') return failed('not_allowed')
  const start = pragueToUtc(day, minutes)
  const prevStart = v.view.start
  if (start.getTime() === prevStart.getTime()) return { ok: true }

  const data = await loadSlotData(ref.accountId, config, appointmentServices(v.base), now, slotOptions(ref, v.base))
  const staff = freeStaffAt(data, start, (v.base.row.staff_id as string | null) ?? null)
  if (staff === null) return failed('taken')

  const moved = await moveAppointment(portalCtx(ref.accountId), { id: ref.businessId, name: v.base.brand.name }, {
    appointmentId: ref.id,
    start,
    staffId: staff || null,
  })
  if (!moved.ok) return failed(moved.reason === 'overlap' ? 'taken' : moved.reason === 'not_found' ? 'not_found' : 'not_allowed')

  await afterChange(ref, () => [
    notifyAppointmentMoved(ref, ref.businessId, ref.id, prevStart, { immediate: true }),
    notifyPortalEvent(ref, ref.businessId, { kind: 'moved', appointmentId: ref.id, prevStart }),
  ])
  return { ok: true }
}

export async function portalCancel(ref: PortalRef, now: Date = new Date()): Promise<PortalOutcome> {
  const v = await visitForChange(ref, now)
  if (!v) return failed('not_found')
  if (!v.view.canCancel) return failed('not_allowed')
  const r = await cancelAppointment(portalCtx(ref.accountId), { id: ref.businessId, name: v.base.brand.name }, ref.id)
  if (!r.ok) return failed('not_found')
  // Zákazník rušil sám: žádný e-mail „termín se nepodařilo zajistit“, jen
  // zastavit připomínku a dát vědět firmě.
  await afterChange(ref, () => [
    cancelQueued(ref, `reminder:${ref.id}`),
    notifyPortalEvent(ref, ref.businessId, { kind: 'cancelled', appointmentId: ref.id }),
  ])
  return { ok: true }
}

export async function portalReview(ref: PortalRef, score: number, comment: string | null, now: Date = new Date()): Promise<PortalOutcome> {
  if (ref.kind === 'request') return failed('not_allowed')
  const view = await loadPortal(ref, now)
  if (!view) return failed('not_found')
  if (!view.review) return failed('not_allowed')
  if (view.review.done) return failed('duplicate')
  if (!view.review.eligible) return failed('not_allowed')
  const jobId = ref.kind === 'job' ? ref.id : null
  const appointmentId = ref.kind === 'appointment' ? ref.id : null
  const rows = await wsDb(ref)`
    INSERT INTO ws.reviews (account_id, business_id, customer_id, job_id, appointment_id, score, comment)
    SELECT ${ref.accountId}, ${ref.businessId},
      CASE WHEN ${jobId}::uuid IS NOT NULL
        THEN (SELECT customer_id FROM ws.jobs WHERE account_id = ${ref.accountId} AND id = ${jobId}::uuid)
        ELSE (SELECT customer_id FROM ws.appointments WHERE account_id = ${ref.accountId} AND id = ${appointmentId}::uuid) END,
      ${jobId}::uuid, ${appointmentId}::uuid, ${score}, ${comment}
    ON CONFLICT DO NOTHING
    RETURNING id`
  if (!rows.length) return failed('duplicate')
  await afterChange(ref, () => [notifyPortalEvent(ref, ref.businessId, { kind: 'review', score, comment, jobId, appointmentId })])
  return { ok: true }
}

/** Upozornění a e-maily po akci. Chyba nesmí zrušit, co už je uložené. */
async function afterChange(ref: PortalRef, tasks: () => Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks())
  for (const r of results) {
    if (r.status === 'rejected') console.error('ws.portal.after', { accountId: ref.accountId, error: r.reason instanceof Error ? r.reason.message : 'unknown' })
  }
  await deliver(ref).catch(() => undefined)
}
