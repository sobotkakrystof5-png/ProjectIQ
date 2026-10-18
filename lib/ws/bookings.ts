import 'server-only'
import { isOverlapError, pgErrorCode, q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'

// Poptávky a termíny (S10): potvrzení, jiný čas, odmítnutí, ruční rezervace,
// přesun, zrušení, blokace a přesun zakázky mezi stavy.
//
// Každý zápis je jeden příkaz (nebo jedna dávka) v transakci s app.account_id
// a filtrem account_id + business_id. Kolize termínů hlídá DB
// (appointments_no_overlap, R-005) — aplikace nic „nekontroluje a pak
// nevkládá“, jen převede 23P01 na lidskou hlášku. Souběžné potvrzení téže
// poptávky pustí jen jeden zápis (UPDATE … WHERE status = 'new').

type Biz = Pick<WsBusiness, 'id' | 'name'>

export type BookingError =
  | 'overlap'
  | 'not_found'
  | 'already_handled'
  | 'needs_time'
  | 'invalid_staff'
  | 'invalid_customer'
  | 'bad_length'
  | 'invalid_service'
  | 'session_full'
  | 'session_closed'
  | 'session_cancelled'
  | 'session_time_fixed'

export type BookingResult<T> = { ok: true; data: T } | { ok: false; reason: BookingError }

const done = <T>(data: T): BookingResult<T> => ({ ok: true, data })
const no = (reason: BookingError): { ok: false; reason: BookingError } => ({ ok: false, reason })

/** Převede chybu DB na důvod; neznámou pošle dál (zaloguje ji akce). */
function asReason(e: unknown): BookingError {
  if (isOverlapError(e)) return 'overlap'
  // 23514: termín bez pracovníka (pracovník z jiného byznysu) nebo konec před začátkem
  if (pgErrorCode(e) === '23514') return 'invalid_staff'
  throw e
}

const MINUTE = 60_000

// --- Pracovníci --------------------------------------------------------------

/**
 * Návštěva musí mít pracovníka (migrace 068). Nový byznys žádného nemá
 * (šablony pracovníky nezakládají, tým je S13) — první termín proto založí
 * jednoho pracovníka se jménem byznysu (R-044). Zámek na byznys zabrání
 * dvěma souběžným založením.
 */
export async function ensureStaff(ctx: WsContext, business: Biz): Promise<void> {
  await wsDb(ctx).batch([
    q`SELECT pg_advisory_xact_lock(hashtext(${business.id}::text))`,
    q`
      INSERT INTO ws.staff (account_id, business_id, name)
      SELECT ${ctx.accountId}, ${business.id}, ${business.name.slice(0, 80)}
      WHERE NOT EXISTS (
        SELECT 1 FROM ws.staff WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND active
      )
    `,
  ])
}

/**
 * Výraz pro pracovníka termínu: zadaný (jen z tohoto byznysu, jinak NULL →
 * CHECK selže), nebo první aktivní, který službu dělá a v tu dobu je volný.
 * Když volný není nikdo, vybere prvního — a vložení skončí na kolizi.
 */
function staffExpr(acc: string, biz: string, staffId: string | null, serviceIds: readonly string[], start: Date, end: Date) {
  const services = [...serviceIds]
  return q`(CASE WHEN ${staffId}::uuid IS NOT NULL THEN (
      SELECT st.id FROM ws.staff st WHERE st.account_id = ${acc} AND st.business_id = ${biz} AND st.id = ${staffId}::uuid
        AND st.active
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${services}::uuid[]) wanted(service_id)
          WHERE EXISTS (
            SELECT 1 FROM ws.service_staff x JOIN ws.staff active_staff
              ON active_staff.account_id = x.account_id AND active_staff.id = x.staff_id AND active_staff.active
            WHERE x.account_id = ${acc} AND x.service_id = wanted.service_id
          ) AND NOT EXISTS (
            SELECT 1 FROM ws.service_staff x WHERE x.account_id = ${acc}
              AND x.service_id = wanted.service_id AND x.staff_id = st.id
          )
        )
    ) ELSE (
      SELECT st.id FROM ws.staff st
      WHERE st.account_id = ${acc} AND st.business_id = ${biz} AND st.active
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${services}::uuid[]) wanted(service_id)
          WHERE EXISTS (
            SELECT 1 FROM ws.service_staff x JOIN ws.staff active_staff
              ON active_staff.account_id = x.account_id AND active_staff.id = x.staff_id AND active_staff.active
            WHERE x.account_id = ${acc} AND x.service_id = wanted.service_id
          ) AND NOT EXISTS (
            SELECT 1 FROM ws.service_staff x WHERE x.account_id = ${acc}
              AND x.service_id = wanted.service_id AND x.staff_id = st.id
          )
        )
      ORDER BY EXISTS (
          SELECT 1 FROM ws.appointments a
          WHERE a.account_id = st.account_id AND a.staff_id = st.id AND a.status <> 'cancelled'
            AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)')
        ), st.position, st.created_at
      LIMIT 1
    ) END)`
}

/** Vloží dotaz `inner` (z q``) do jiného: parametry se přečíslují. */
function embed(outer: { text: string; params: unknown[] }, inner: { text: string; params: readonly unknown[] }): string {
  const offset = outer.params.length
  outer.params.push(...inner.params)
  return inner.text.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`)
}

/** Skládá dotaz z kousků q`` — tag q sám fragmenty neumí. */
class Sql {
  text = ''
  params: unknown[] = []
  add(part: { text: string; params: readonly unknown[] }): this {
    this.text += embed(this, part)
    return this
  }
  build() {
    return { text: this.text, params: this.params }
  }
}

// --- Volno a kolize ---------------------------------------------------------

export type SlotCheck =
  | { free: true; staffName: string | null }
  | { free: false; conflict: { title: string; start: Date; end: Date } }

/**
 * Tip v detailu poptávky: „Termín je volný“ / „Koliduje s …“. Jen pro
 * informaci — skutečnou kolizi stejně rozhodne DB při potvrzení.
 */
export async function checkSlot(
  ctx: WsContext,
  business: Biz,
  input: {
    start: Date
    end: Date
    serviceId: string | null
    serviceIds?: readonly string[]
    excludeAppointmentId?: string | null
    /** Ověřit jen tohoto pracovníka (sloupec kalendáře, výběr ve formuláři); jinak stačí kdokoli volný. */
    staffId?: string | null
  },
): Promise<SlotCheck> {
  const acc = ctx.accountId
  const biz = business.id
  const { start, end, serviceId } = input
  const serviceIds = input.serviceIds?.length ? [...input.serviceIds] : serviceId ? [serviceId] : []
  const exclude = input.excludeAppointmentId ?? null
  const onlyStaff = input.staffId ?? null
  const [staffRows, conflicts] = await wsDb(ctx).batch([
    q`
      SELECT st.id, st.name, count(*) OVER ()::int AS total,
        EXISTS (
          SELECT 1 FROM ws.appointments a
          WHERE a.account_id = st.account_id AND a.staff_id = st.id AND a.status <> 'cancelled'
            AND a.id IS DISTINCT FROM ${exclude}::uuid
            AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)')
        ) AS busy
      FROM ws.staff st
      WHERE st.account_id = ${acc} AND st.business_id = ${biz} AND st.active
        AND (${onlyStaff}::uuid IS NULL OR st.id = ${onlyStaff}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${serviceIds}::uuid[]) wanted(service_id)
          WHERE EXISTS (SELECT 1 FROM ws.service_staff x JOIN ws.staff active_staff
            ON active_staff.account_id = x.account_id AND active_staff.id = x.staff_id AND active_staff.active
            WHERE x.account_id = ${acc} AND x.service_id = wanted.service_id)
            AND NOT EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = ${acc}
              AND x.service_id = wanted.service_id AND x.staff_id = st.id)
        )
      ORDER BY st.position, st.created_at
    `,
    q`
      SELECT a.kind, a.starts_at, a.ends_at, a.title, c.name AS customer_name, a.staff_id
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.status <> 'cancelled'
        AND a.id IS DISTINCT FROM ${exclude}::uuid
        AND (${onlyStaff}::uuid IS NULL OR a.staff_id = ${onlyStaff}::uuid OR a.staff_id IS NULL)
        AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)')
      ORDER BY a.starts_at
      LIMIT 5
    `,
  ])
  const staff = staffRows as WsRow[]
  const freeStaff = staff.find((s) => !s.busy)
  // Bez pracovníků: první termín ho založí (ensureStaff), takže je volno,
  // pokud nic nekoliduje (blokace celého byznysu).
  const businessBlock = (conflicts as WsRow[]).find((c) => c.kind === 'block' && c.staff_id === null)
  if ((staff.length === 0 || freeStaff) && !businessBlock) {
    return { free: true, staffName: staff.length > 1 && freeStaff ? String(freeStaff.name) : null }
  }
  const c = businessBlock ?? (conflicts as WsRow[])[0]
  if (!c) return { free: true, staffName: null }
  return {
    free: false,
    conflict: {
      title: c.kind === 'block' ? String(c.title ?? 'Blokace') : String(c.customer_name ?? c.title ?? 'Termín'),
      start: c.starts_at as Date,
      end: c.ends_at as Date,
    },
  }
}

// --- Poptávky ---------------------------------------------------------------

type RequestState = {
  status: string
  wanted_start: Date | null
  wanted_end: Date | null
  service_id: string | null
  service_ids: string[]
  session_id: string | null
  session_appointment_id: string | null
  session_status: string | null
  session_appointment_status: string | null
  requested_staff_id: string | null
  duration_min: number | null
  calendar: boolean
  jobs: boolean
}

async function requestState(ctx: WsContext, business: Biz, requestId: string): Promise<RequestState | null> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT r.status, r.wanted_start, r.wanted_end, r.service_id, r.requested_staff_id, r.session_id,
        se.appointment_id AS session_appointment_id, se.status AS session_status, session_appointment.status AS session_appointment_status,
        COALESCE((SELECT array_agg(rs.service_id ORDER BY rs.position) FILTER (WHERE rs.service_id IS NOT NULL)
          FROM ws.request_services rs WHERE rs.account_id = r.account_id AND rs.request_id = r.id),
          CASE WHEN r.service_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[r.service_id] END) AS service_ids,
        COALESCE((SELECT sum(s2.duration_min)::int FROM ws.request_services rs
          JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
          WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.duration_min) AS duration_min,
        EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = r.account_id AND m.business_id = r.business_id
                AND m.module = 'calendar' AND m.enabled) AS calendar,
        EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = r.account_id AND m.business_id = r.business_id
                AND m.module = 'jobs' AND m.enabled) AS jobs
      FROM ws.requests r
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      LEFT JOIN ws.sessions se ON se.account_id = r.account_id AND se.business_id = r.business_id AND se.id = r.session_id
      LEFT JOIN ws.appointments session_appointment ON session_appointment.account_id = se.account_id
        AND session_appointment.business_id = se.business_id AND session_appointment.id = se.appointment_id
      WHERE r.account_id = ${ctx.accountId} AND r.business_id = ${business.id} AND r.id = ${requestId}
    `,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  return {
    status: String(r.status),
    wanted_start: (r.wanted_start as Date | null) ?? null,
    wanted_end: (r.wanted_end as Date | null) ?? null,
    service_id: (r.service_id as string | null) ?? null,
    service_ids: Array.isArray(r.service_ids) ? r.service_ids.map(String) : r.service_id ? [String(r.service_id)] : [],
    session_id: (r.session_id as string | null) ?? null,
    session_appointment_id: (r.session_appointment_id as string | null) ?? null,
    session_status: (r.session_status as string | null) ?? null,
    session_appointment_status: (r.session_appointment_status as string | null) ?? null,
    requested_staff_id: (r.requested_staff_id as string | null) ?? null,
    duration_min: r.duration_min === null || r.duration_min === undefined ? null : Number(r.duration_min),
    calendar: Boolean(r.calendar),
    jobs: Boolean(r.jobs),
  }
}

/** Stav poptávky (např. „rescheduled“ po potvrzení na jiný čas), null = není. */
export async function requestStatus(ctx: WsContext, business: Biz, requestId: string): Promise<string | null> {
  return (await requestState(ctx, business, requestId))?.status ?? null
}

export type ConfirmResult = { appointmentId: string | null; jobId: string | null; start: Date | null }

/**
 * Potvrdí poptávku. Bez `start` platí chtěný termín; jiný čas = stav
 * „rescheduled“ (domluvený jiný termín, R-044). S kalendářem vznikne termín,
 * se zakázkami zakázka. Bez času a bez zakázek jen „přijato“.
 */
export async function confirmRequest(
  ctx: WsContext,
  business: Biz,
  input: { requestId: string; start?: Date | null; staffId?: string | null },
): Promise<BookingResult<ConfirmResult>> {
  const st = await requestState(ctx, business, input.requestId)
  if (!st) return no('not_found')
  if (st.status !== 'new') return no('already_handled')
  if (st.session_id && (st.session_status === 'cancelled' || st.session_appointment_status !== 'confirmed')) return no('session_cancelled')

  const other = input.start ? !st.wanted_start || input.start.getTime() !== st.wanted_start.getTime() : false
  if (st.session_appointment_id && other) return no('session_time_fixed')
  const start = input.start ?? st.wanted_start
  const durationMs =
    !other && st.wanted_start && st.wanted_end
      ? st.wanted_end.getTime() - st.wanted_start.getTime()
      : (st.duration_min ?? 60) * MINUTE
  const withAppointment = st.calendar && start !== null && !st.session_appointment_id
  const hasScheduledAppointment = withAppointment || Boolean(st.session_appointment_id && start)
  // Kalendář bez zakázek: potvrdit jde jen s časem (jinak není co potvrdit).
  if (st.calendar && !st.jobs && !start) return no('needs_time')
  const end = start ? new Date(start.getTime() + durationMs) : null

  if (withAppointment) await ensureStaff(ctx, business)

  const acc = ctx.accountId
  const biz = business.id
  const serviceIds = st.service_ids
  const segmentMinutes = st.duration_min ?? Math.max(15, Math.round(durationMs / MINUTE))
  const sql = new Sql().add(q`
    WITH req AS (
      UPDATE ws.requests SET status = ${other ? 'rescheduled' : 'confirmed'}, handled_at = now()
      WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.requestId} AND status = 'new'
        AND (session_id IS NULL OR EXISTS (
          SELECT 1 FROM ws.sessions se
          JOIN ws.appointments sa ON sa.account_id = se.account_id AND sa.business_id = se.business_id AND sa.id = se.appointment_id
          WHERE se.account_id = ${acc} AND se.business_id = ${biz} AND se.id = ws.requests.session_id
            AND se.status <> 'cancelled' AND sa.status = 'confirmed'
        ))
      RETURNING id, customer_id, service_id
    ),
    req_data AS (
      SELECT req.*, CASE WHEN cardinality(${serviceIds}::uuid[]) > 1 THEN gen_random_uuid() ELSE NULL::uuid END AS group_id
      FROM req
    ),
    attendee AS (
      UPDATE ws.session_attendees sa SET status = 'confirmed'
      FROM req_data req WHERE sa.account_id = ${acc} AND sa.business_id = ${biz} AND sa.request_id = req.id
      RETURNING sa.id
    ),
    job AS (
      INSERT INTO ws.jobs (account_id, business_id, customer_id, request_id, stage_id, title)
      SELECT ${acc}, ${biz}, req.customer_id, req.id,
        (SELECT id FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} AND type <> 'cancelled'
          ORDER BY (type = ${hasScheduledAppointment ? 'in_progress' : 'new'}) DESC, position LIMIT 1),
        COALESCE((SELECT string_agg(s.name, ' + ' ORDER BY picked.ordinality)
          FROM unnest(${serviceIds}::uuid[]) WITH ORDINALITY picked(service_id, ordinality)
          JOIN ws.services s ON s.account_id = ${acc} AND s.id = picked.service_id),
          (SELECT name FROM ws.services WHERE account_id = ${acc} AND id = req.service_id), 'Zakázka')
      FROM req_data req WHERE ${st.jobs}::boolean
      RETURNING id
    ),
    segments AS (
      SELECT picked.service_id, picked.ordinality,
        COALESCE(s.duration_min, ${Math.max(15, Math.round(segmentMinutes))})::int AS duration_min,
        COALESCE(sum(COALESCE(s.duration_min, ${Math.max(15, Math.round(segmentMinutes))})) OVER (
          ORDER BY picked.ordinality ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::int AS offset_min
      FROM unnest(CASE WHEN cardinality(${serviceIds}::uuid[]) = 0 THEN ARRAY[NULL::uuid] ELSE ${serviceIds}::uuid[] END)
        WITH ORDINALITY picked(service_id, ordinality)
      LEFT JOIN ws.services s ON s.account_id = ${acc} AND s.id = picked.service_id
    ),
    chosen_staff AS (
      SELECT `)
  if (withAppointment) sql.add(staffExpr(acc, biz, input.staffId ?? st.requested_staff_id, serviceIds, start!, end!))
  else sql.add(q`NULL::uuid`)
  sql.add(q` AS id
    ),
    appt AS (
      INSERT INTO ws.appointments (account_id, business_id, group_id, kind, staff_id, customer_id, job_id, request_id, service_id, starts_at, ends_at)
      SELECT ${acc}, ${biz}, req.group_id, 'visit', chosen_staff.id, req.customer_id, (SELECT id FROM job), req.id,
        segments.service_id, ${start}::timestamptz + make_interval(mins => segments.offset_min),
        ${start}::timestamptz + make_interval(mins => segments.offset_min + segments.duration_min)
      FROM req_data req CROSS JOIN segments CROSS JOIN chosen_staff
      WHERE ${withAppointment}::boolean
      RETURNING id, starts_at
    )
    SELECT (SELECT id FROM req_data) AS request_id,
      COALESCE((SELECT id FROM appt ORDER BY starts_at LIMIT 1), ${st.session_appointment_id}::uuid) AS appointment_id,
      (SELECT id FROM job) AS job_id
  `)

  try {
    const [rows] = await wsDb(ctx).batch([sql.build()])
    const r = (rows as WsRow[])[0]
    // Mezi čtením a zápisem ji vyřídil někdo jiný.
    if (!r?.request_id) {
      const latest = await requestState(ctx, business, input.requestId)
      if (!latest) return no('not_found')
      if (latest.status !== 'new') return no('already_handled')
      if (latest.session_id && (latest.session_status === 'cancelled' || latest.session_appointment_status !== 'confirmed')) {
        return no('session_cancelled')
      }
      return no('already_handled')
    }
    return done({
      appointmentId: (r.appointment_id as string | null) ?? null,
      jobId: (r.job_id as string | null) ?? null,
      start: hasScheduledAppointment ? start : null,
    })
  } catch (e) {
    return no(asReason(e))
  }
}

/** Odmítne novou poptávku. Vrátit jde přes reopenRequest. */
export async function declineRequest(ctx: WsContext, business: Biz, requestId: string): Promise<BookingResult<null>> {
  const [r] = await wsDb(ctx)`
    WITH found AS (
      SELECT id FROM ws.requests WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${requestId}
    ),
    upd AS (
      UPDATE ws.requests SET status = 'declined', handled_at = now()
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${requestId} AND status = 'new'
      RETURNING id, session_id
    )
    , attendee AS (
      UPDATE ws.session_attendees sa SET status = 'cancelled'
      FROM upd WHERE sa.account_id = ${ctx.accountId} AND sa.business_id = ${business.id}
        AND sa.request_id = upd.id AND sa.status <> 'cancelled'
      RETURNING sa.session_id
    ), release AS (
      UPDATE ws.sessions se SET reserved = greatest(0, se.reserved - 1)
      FROM attendee WHERE se.account_id = ${ctx.accountId} AND se.business_id = ${business.id} AND se.id = attendee.session_id
      RETURNING se.id
    )
    SELECT (SELECT id FROM found) AS found, (SELECT id FROM upd) AS updated
  `
  if (!r?.found) return no('not_found')
  return r.updated ? done(null) : no('already_handled')
}

/** „Zpět“ po odmítnutí: poptávka je zase nová. */
export async function reopenRequest(ctx: WsContext, business: Biz, requestId: string): Promise<BookingResult<null>> {
  const [rows] = await wsDb(ctx).batch([q`
    WITH target AS (
      SELECT r.id, r.session_id, se.status AS session_status, a.status AS appointment_status
      FROM ws.requests r
      LEFT JOIN ws.sessions se ON se.account_id = r.account_id AND se.business_id = r.business_id AND se.id = r.session_id
      LEFT JOIN ws.appointments a ON a.account_id = se.account_id AND a.business_id = se.business_id AND a.id = se.appointment_id
      WHERE r.account_id = ${ctx.accountId} AND r.business_id = ${business.id} AND r.id = ${requestId} AND r.status = 'declined'
    ), reserve AS (
      UPDATE ws.sessions se SET reserved = se.reserved + 1
      FROM target WHERE target.session_id IS NOT NULL AND se.account_id = ${ctx.accountId}
        AND se.business_id = ${business.id} AND se.id = target.session_id AND se.status = 'open' AND se.reserved < se.capacity
      RETURNING se.id
    ), updated AS (
      UPDATE ws.requests r SET status = 'new', handled_at = NULL
      FROM target WHERE r.account_id = ${ctx.accountId} AND r.business_id = ${business.id} AND r.id = target.id
        AND (target.session_id IS NULL OR EXISTS (SELECT 1 FROM reserve))
      RETURNING r.id
    ), attendee AS (
      UPDATE ws.session_attendees sa SET status = 'requested'
      FROM updated WHERE sa.account_id = ${ctx.accountId} AND sa.business_id = ${business.id}
        AND sa.request_id = updated.id
      RETURNING sa.id
    )
    SELECT (SELECT id FROM target) AS found, (SELECT id FROM updated) AS updated,
      (SELECT session_id FROM target) AS session_id,
      (SELECT session_status FROM target) AS session_status,
      (SELECT appointment_status FROM target) AS appointment_status
  `])
  const r = rows[0]
  if (!r?.found) return no('not_found')
  if (!r.updated && r.session_id) {
    if (r.session_status === 'cancelled' || r.appointment_status !== 'confirmed') return no('session_cancelled')
    if (r.session_status !== 'open') return no('session_closed')
    return no('session_full')
  }
  return r.updated ? done(null) : no('not_found')
}

// --- Zákazník pro ruční rezervaci ------------------------------------------

/** Telefon do E.164 (+420…). Devět číslic = české číslo. Neplatný = null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.replace(/[\s().-]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (/^\d{9}$/.test(s)) s = `+420${s}`
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null
}

/**
 * Najde zákazníka účtu podle telefonu, pak e-mailu, jinak založí nového.
 * Souběžné založení téhož člověka skončí na unikátním indexu → druhý pokus
 * ho už najde.
 */
export async function findOrCreateCustomer(
  ctx: WsContext,
  input: { name: string; phone: string | null; email: string | null },
): Promise<string> {
  const acc = ctx.accountId
  const { name, phone, email } = input
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = await wsDb(ctx)<{ id: string }>`
      WITH found AS (
        SELECT id FROM ws.customers
        WHERE account_id = ${acc}
          AND ((${phone}::text IS NOT NULL AND phone = ${phone}::text) OR (${email}::text IS NOT NULL AND email = ${email}::text))
        ORDER BY (phone IS NOT DISTINCT FROM ${phone}::text) DESC
        LIMIT 1
      ),
      ins AS (
        INSERT INTO ws.customers (account_id, name, phone, email)
        SELECT ${acc}, ${name}, ${phone}::text, ${email}::text
        WHERE NOT EXISTS (SELECT 1 FROM found)
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT id FROM found UNION ALL SELECT id FROM ins
    `
    if (rows[0]) return rows[0].id
  }
  throw new Error('findOrCreateCustomer: zákazník se nenašel ani nezaložil')
}

// --- Termíny ----------------------------------------------------------------

/** Ruční rezervace (telefonem, osobně). Zákazník se najde nebo založí. */
export async function createBooking(
  ctx: WsContext,
  business: Biz,
  input: {
    customerId?: string | null
    customer?: { name: string; phone: string | null; email: string | null } | null
    serviceId: string | null
    serviceIds?: readonly string[]
    staffId: string | null
    start: Date
    durationMin?: number | null
    note: string | null
  },
): Promise<BookingResult<{ appointmentId: string; customerId: string | null }>> {
  const acc = ctx.accountId
  const biz = business.id
  const db = wsDb(ctx)

  const serviceIds = input.serviceIds?.length ? [...input.serviceIds] : input.serviceId ? [input.serviceId] : []
  if (new Set(serviceIds).size !== serviceIds.length || (serviceIds.length && input.serviceId && serviceIds[0] !== input.serviceId)) return no('invalid_service')
  const [svcRows] = await db.batch([
    q`SELECT id, duration_min FROM ws.services WHERE account_id = ${acc} AND business_id = ${biz}
      AND active AND id = ANY(${serviceIds}::uuid[]) ORDER BY array_position(${serviceIds}::uuid[], id)`,
  ])
  const services = svcRows as WsRow[]
  if (services.length !== serviceIds.length) return no('invalid_service')
  const minutes = serviceIds.length > 1 ? services.reduce((sum, svc) => sum + Number(svc.duration_min), 0)
    : input.durationMin ?? (services[0] ? Number(services[0].duration_min) : 60)
  if (!Number.isFinite(minutes) || minutes < MIN_DURATION_MIN || minutes > MAX_DURATION_MIN) return no('bad_length')
  const serviceId = serviceIds[0] ?? null
  const end = new Date(input.start.getTime() + minutes * MINUTE)

  let customerId: string | null = null
  if (input.customerId) {
    const [found] = await db<{ id: string }>`SELECT id FROM ws.customers WHERE account_id = ${acc} AND id = ${input.customerId}`
    if (!found) return no('invalid_customer')
    customerId = found.id
  } else if (input.customer) {
    customerId = await findOrCreateCustomer(ctx, input.customer)
  }

  await ensureStaff(ctx, business)
  const sql = new Sql().add(q`
    WITH segments AS (
      SELECT picked.service_id, picked.ordinality,
        COALESCE(s.duration_min, ${minutes})::int AS duration_min,
        COALESCE(sum(COALESCE(s.duration_min, ${minutes})) OVER (
          ORDER BY picked.ordinality ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::int AS offset_min
      FROM unnest(CASE WHEN cardinality(${serviceIds}::uuid[]) = 0 THEN ARRAY[NULL::uuid] ELSE ${serviceIds}::uuid[] END)
        WITH ORDINALITY picked(service_id, ordinality)
      LEFT JOIN ws.services s ON s.account_id = ${acc} AND s.id = picked.service_id
    ),
    chosen_staff AS (SELECT `)
    .add(staffExpr(acc, biz, input.staffId, serviceIds, input.start, end))
    .add(q` AS id),
    booking_group AS (SELECT CASE WHEN cardinality(${serviceIds}::uuid[]) > 1 THEN gen_random_uuid() ELSE NULL::uuid END AS id),
    inserted AS (
      INSERT INTO ws.appointments (account_id, business_id, group_id, kind, staff_id, customer_id, service_id, starts_at, ends_at, note)
      SELECT ${acc}, ${biz}, booking_group.id, 'visit', chosen_staff.id, ${customerId}::uuid, segments.service_id,
        ${input.start}::timestamptz + make_interval(mins => segments.offset_min),
        ${input.start}::timestamptz + make_interval(mins => segments.offset_min + segments.duration_min), ${input.note}
      FROM segments CROSS JOIN chosen_staff CROSS JOIN booking_group
      RETURNING id, starts_at
    )
    SELECT id, starts_at FROM inserted ORDER BY starts_at
  `)
  try {
    const [rows] = await db.batch([sql.build()])
    const first = (rows as WsRow[]).sort((a, b) => new Date(a.starts_at as Date).getTime() - new Date(b.starts_at as Date).getTime())[0]
    if (!first) return no('invalid_service')
    return done({ appointmentId: String(first.id), customerId })
  } catch (e) {
    return no(asReason(e))
  }
}

export type MovedAppointment = { prevStart: Date; prevStaffId: string | null; start: Date; end: Date }

/** Přesune termín (nebo blokaci) na nový začátek, délka zůstane. */
export async function moveAppointment(
  ctx: WsContext,
  business: Biz,
  input: { appointmentId: string; start: Date; staffId?: string | null },
): Promise<BookingResult<MovedAppointment>> {
  const acc = ctx.accountId
  const biz = business.id
  const staffId = input.staffId ?? null
  try {
    const [, rows] = await wsDb(ctx).batch([q`SET CONSTRAINTS ws.appointments_no_overlap DEFERRED`, q`
      WITH target AS (
        SELECT id, group_id FROM ws.appointments
        WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.appointmentId} AND status = 'confirmed'
      )
      , old AS (
        SELECT a.id, a.starts_at, a.ends_at, a.staff_id, a.service_id,
          min(a.starts_at) OVER () AS group_start,
          array_remove(array_agg(a.service_id) OVER (), NULL::uuid) AS service_ids
        FROM ws.appointments a JOIN target t ON a.account_id = ${acc}
          AND ((t.group_id IS NOT NULL AND a.group_id = t.group_id) OR (t.group_id IS NULL AND a.id = t.id))
        WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.status = 'confirmed'
      ),
      summary AS (
        SELECT min(starts_at) AS prev_start, (array_agg(staff_id ORDER BY starts_at))[1] AS prev_staff,
          array_agg(DISTINCT service_id) FILTER (WHERE service_id IS NOT NULL) AS service_ids
        FROM old
      ),
      changed AS (
        UPDATE ws.appointments a SET
          starts_at = ${input.start}::timestamptz + (old.starts_at - old.group_start),
          ends_at = ${input.start}::timestamptz + (old.ends_at - old.group_start),
          staff_id = CASE WHEN ${staffId}::uuid IS NULL THEN a.staff_id ELSE (
            SELECT id FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${staffId}::uuid AND active
          ) END
        FROM old, summary
        WHERE a.account_id = ${acc} AND a.id = old.id
          AND (${staffId}::uuid IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(summary.service_ids) wanted(service_id)
            WHERE EXISTS (SELECT 1 FROM ws.service_staff x JOIN ws.staff active_staff
              ON active_staff.account_id = x.account_id AND active_staff.id = x.staff_id AND active_staff.active
              WHERE x.account_id = ${acc} AND x.service_id = wanted.service_id)
              AND NOT EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = ${acc}
                AND x.service_id = wanted.service_id AND x.staff_id = ${staffId}::uuid)
          ))
        RETURNING a.id
      )
      SELECT summary.prev_start, summary.prev_staff,
        ${input.start}::timestamptz AS starts_at,
        ${input.start}::timestamptz + (SELECT max(old.ends_at - old.group_start) FROM old) AS ends_at,
        (SELECT count(*) FROM changed)::int AS changed_count,
        (SELECT count(*) FROM old)::int AS found_count
      FROM summary
    `])
    const r = rows[0]
    if (!r || !r.prev_start) return no('not_found')
    if (Number(r.changed_count) === 0) return no('invalid_staff')
    return done({
      prevStart: r.prev_start as Date,
      prevStaffId: (r.prev_staff as string | null) ?? null,
      start: r.starts_at as Date,
      end: r.ends_at as Date,
    })
  } catch (e) {
    return no(asReason(e))
  }
}

export type ResizedAppointment = { prevDurationMin: number; start: Date; end: Date }

export type GroupSessionResult = { appointmentId: string; sessionId: string }

/** Vypíše skupinovou lekci z kalendáře: jeden termín pracovníka a 2–30 míst. */
export async function createGroupSession(
  ctx: WsContext,
  business: Biz,
  input: { serviceId: string; staffId: string | null; start: Date; title: string; capacity: number },
): Promise<BookingResult<GroupSessionResult>> {
  const capacity = Math.round(input.capacity)
  const title = input.title.trim().slice(0, 120)
  if (capacity < 2 || capacity > 30 || !title) return no('bad_length')
  const acc = ctx.accountId
  const biz = business.id
  const [services] = await wsDb(ctx).batch([
    q`SELECT id, duration_min FROM ws.services WHERE account_id = ${acc} AND business_id = ${biz} AND active AND id = ${input.serviceId}::uuid`,
  ])
  const service = (services as WsRow[])[0]
  if (!service) return no('invalid_service')
  const end = new Date(input.start.getTime() + Number(service.duration_min) * MINUTE)
  await ensureStaff(ctx, business)
  const sql = new Sql().add(q`
    WITH service AS (
      SELECT id FROM ws.services WHERE account_id = ${acc} AND business_id = ${biz} AND active AND id = ${input.serviceId}::uuid
    ), chosen_staff AS (SELECT `)
    .add(staffExpr(acc, biz, input.staffId, [input.serviceId], input.start, end))
    .add(q` AS id), appointment AS (
      INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, service_id, starts_at, ends_at, title)
      SELECT ${acc}, ${biz}, 'visit', chosen_staff.id, service.id,
        ${input.start}::timestamptz, ${end}::timestamptz, ${title}
      FROM service CROSS JOIN chosen_staff
      RETURNING id
    ), session AS (
      INSERT INTO ws.sessions (account_id, business_id, appointment_id, service_id, capacity)
      SELECT ${acc}, ${biz}, appointment.id, service.id, ${capacity}::smallint
      FROM appointment CROSS JOIN service
      RETURNING id
    )
    SELECT appointment.id AS appointment_id, session.id AS session_id FROM appointment CROSS JOIN session
  `)
  try {
    const [rows] = await wsDb(ctx).batch([sql.build()])
    const row = (rows as WsRow[])[0]
    if (!row) return no('invalid_staff')
    return done({ appointmentId: String(row.appointment_id), sessionId: String(row.session_id) })
  } catch (e) {
    return no(asReason(e))
  }
}

/** Zastaví nebo obnoví přihlašování na budoucí lekci; místo pro obsazenou lekci obnovit nejde. */
export async function setGroupSessionOpen(
  ctx: WsContext,
  business: Biz,
  sessionId: string,
  open: boolean,
): Promise<BookingResult<null>> {
  const [rows] = await wsDb(ctx).batch([q`
    WITH target AS (
      SELECT se.id, se.reserved, se.capacity
      FROM ws.sessions se JOIN ws.appointments a
        ON a.account_id = se.account_id AND a.business_id = se.business_id AND a.id = se.appointment_id
      WHERE se.account_id = ${ctx.accountId} AND se.business_id = ${business.id} AND se.id = ${sessionId}
        AND se.status IN ('open', 'closed') AND a.status = 'confirmed' AND a.starts_at > now()
    ), changed AS (
      UPDATE ws.sessions se SET status = ${open ? 'open' : 'closed'}
      FROM target WHERE se.account_id = ${ctx.accountId} AND se.business_id = ${business.id} AND se.id = target.id
        AND (${!open}::boolean OR target.reserved < target.capacity)
      RETURNING se.id
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM changed) AS changed,
      EXISTS (SELECT 1 FROM target WHERE reserved >= capacity) AS full
  `])
  const row = (rows as WsRow[])[0]
  if (!row?.found) return no('not_found')
  if (!row.changed && row.full) return no('session_full')
  return row.changed ? done(null) : no('not_found')
}

/** Nejkratší a nejdelší termín, který jde změnit tažením nebo výběrem délky. */
export const MIN_DURATION_MIN = 15
export const MAX_DURATION_MIN = 12 * 60

/**
 * Změní délku termínu (nebo blokace), začátek zůstává. Kolizi s dalším
 * termínem pracovníka rozhodne DB (23P01 → 'overlap'), stejně jako u přesunu.
 * Vrací předchozí délku pro „Zpět“.
 */
export async function resizeAppointment(
  ctx: WsContext,
  business: Biz,
  input: { appointmentId: string; durationMin: number },
): Promise<BookingResult<ResizedAppointment>> {
  const acc = ctx.accountId
  const biz = business.id
  const minutes = Math.round(input.durationMin)
  if (!Number.isFinite(minutes) || minutes < MIN_DURATION_MIN || minutes > MAX_DURATION_MIN) return no('bad_length')
  try {
    const rows = await wsDb(ctx)`
      WITH target AS (
        SELECT id, group_id FROM ws.appointments
        WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.appointmentId} AND status = 'confirmed'
      ), ranked AS (
        SELECT a.id, a.starts_at, a.ends_at, min(a.starts_at) OVER () AS group_start,
          row_number() OVER (ORDER BY a.starts_at DESC) AS reverse_position,
          max(a.ends_at) OVER () AS group_end
        FROM ws.appointments a JOIN target t ON a.account_id = ${acc}
          AND ((t.group_id IS NOT NULL AND a.group_id = t.group_id) OR (t.group_id IS NULL AND a.id = t.id))
        WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.status = 'confirmed'
      ), old AS (
        SELECT ranked.*, max(ends_at) FILTER (WHERE reverse_position > 1) OVER () AS leading_end
        FROM ranked
      ), summary AS (
        SELECT min(group_start) AS starts_at, max(group_end) AS ends_at, max(leading_end) AS leading_end,
          (array_agg(id ORDER BY reverse_position))[1] AS last_id, count(*)::int AS row_count FROM old
      ), changed AS (
        UPDATE ws.appointments a SET ends_at = summary.starts_at + make_interval(mins => ${minutes}::int)
        FROM summary WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.id = summary.last_id
          AND ${minutes}::int >= COALESCE((extract(epoch FROM summary.leading_end - summary.starts_at) / 60)::int, 0) + ${MIN_DURATION_MIN}
        RETURNING a.starts_at, a.ends_at
      )
      SELECT summary.starts_at,
        (extract(epoch FROM summary.ends_at - summary.starts_at) / 60)::int AS prev_min,
        summary.starts_at AS starts_at, changed.ends_at AS ends_at,
        summary.row_count > 0 AS found,
        EXISTS (SELECT 1 FROM summary WHERE ${minutes}::int < COALESCE((extract(epoch FROM leading_end - starts_at) / 60)::int, 0) + ${MIN_DURATION_MIN}) AS too_short
      FROM summary LEFT JOIN changed ON true
    `
    const r = rows[0]
    if (!r) return no('not_found')
    if (r.too_short) return no('bad_length')
    if (!r.ends_at) return no('not_found')
    return done({ prevDurationMin: Number(r.prev_min), start: r.starts_at as Date, end: r.ends_at as Date })
  } catch (e) {
    return no(asReason(e))
  }
}

/** Zruší termín nebo blokaci. Vrátit jde přes restoreAppointment. */
export async function cancelAppointment(ctx: WsContext, business: Biz, appointmentId: string): Promise<BookingResult<null>> {
  const rows = await wsDb(ctx)`
    WITH target AS (SELECT id, group_id FROM ws.appointments
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${appointmentId} AND status = 'confirmed')
    , changed AS (
      UPDATE ws.appointments a SET status = 'cancelled', cancelled_at = now()
      FROM target t WHERE a.account_id = ${ctx.accountId} AND a.business_id = ${business.id} AND a.status = 'confirmed'
        AND ((t.group_id IS NOT NULL AND a.group_id = t.group_id) OR (t.group_id IS NULL AND a.id = t.id))
      RETURNING a.id
    ), closed AS (
      UPDATE ws.sessions se SET status = 'cancelled'
      FROM changed WHERE se.account_id = ${ctx.accountId} AND se.business_id = ${business.id} AND se.appointment_id = changed.id
      RETURNING se.id
    )
    SELECT id FROM changed
  `
  return rows.length ? done(null) : no('not_found')
}

/** „Zpět“ po zrušení. Když čas mezitím někdo obsadil, vrátí kolizi. */
export async function restoreAppointment(ctx: WsContext, business: Biz, appointmentId: string): Promise<BookingResult<null>> {
  try {
    const rows = await wsDb(ctx)`
      WITH target AS (SELECT id, group_id FROM ws.appointments
        WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${appointmentId} AND status = 'cancelled')
      , changed AS (
        UPDATE ws.appointments a SET status = 'confirmed', cancelled_at = NULL
        FROM target t WHERE a.account_id = ${ctx.accountId} AND a.business_id = ${business.id} AND a.status = 'cancelled'
          AND ((t.group_id IS NOT NULL AND a.group_id = t.group_id) OR (t.group_id IS NULL AND a.id = t.id))
        RETURNING a.id
      ), reopened AS (
        UPDATE ws.sessions se SET status = 'open'
        FROM changed WHERE se.account_id = ${ctx.accountId} AND se.business_id = ${business.id} AND se.appointment_id = changed.id
        RETURNING se.id
      )
      SELECT id FROM changed
    `
    return rows.length ? done(null) : no('not_found')
  } catch (e) {
    return no(asReason(e))
  }
}

/**
 * Blokace (dovolená, školení, zavřeno). S pracovníkem ji hlídá stejné
 * omezení jako návštěvy; bez pracovníka platí pro celý byznys (R-035).
 */
export async function createBlock(
  ctx: WsContext,
  business: Biz,
  input: { staffId: string | null; start: Date; end: Date; title: string },
): Promise<BookingResult<{ appointmentId: string }>> {
  const acc = ctx.accountId
  const biz = business.id
  try {
    const rows = await wsDb(ctx)`
      INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, starts_at, ends_at, title)
      SELECT ${acc}, ${biz}, 'block',
        CASE WHEN ${input.staffId}::uuid IS NULL THEN NULL ELSE (
          SELECT id FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.staffId}::uuid
        ) END,
        ${input.start}::timestamptz, ${input.end}::timestamptz, ${input.title}
      WHERE ${input.staffId}::uuid IS NULL
         OR EXISTS (SELECT 1 FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.staffId}::uuid)
      RETURNING id
    `
    if (!rows[0]) return no('invalid_staff')
    return done({ appointmentId: String(rows[0].id) })
  } catch (e) {
    return no(asReason(e))
  }
}

// --- Zakázky ----------------------------------------------------------------

const CLOSED_TYPES = ['done', 'paid', 'cancelled']

/**
 * Přesun zakázky do jiného stavu (tabule, seznam, panel). Vrací předchozí stav
 * pro „Zpět“. Změna se zapíše do ws.audit_log (`job.stage_changed`, názvy stavů
 * jsou opsané, takže historie přežije přejmenování), z čehož čte „Historie
 * stavů“ v detailu zakázky. Přesun do téhož stavu nic nezapisuje.
 */
export async function setJobStage(
  ctx: WsContext,
  business: Biz,
  input: { jobId: string; stageId: string },
): Promise<BookingResult<{ prevStageId: string | null }>> {
  const acc = ctx.accountId
  const biz = business.id
  const rows = await wsDb(ctx)`
    WITH old AS (
      SELECT j.id, j.stage_id, os.name AS stage_name
      FROM ws.jobs j
      LEFT JOIN ws.stages os ON os.account_id = j.account_id AND os.id = j.stage_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.id = ${input.jobId}
      FOR UPDATE OF j
    ),
    stage AS (
      SELECT id, type, name FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.stageId}
    ),
    upd AS (
      UPDATE ws.jobs j SET
        stage_id = stage.id,
        closed_at = CASE WHEN stage.type = ANY(${CLOSED_TYPES}::text[]) THEN COALESCE(j.closed_at, now()) ELSE NULL END
      FROM old, stage
      WHERE j.account_id = ${acc} AND j.id = old.id
      RETURNING j.id AS job_id, old.stage_id AS prev_stage, old.stage_name AS prev_name, stage.id AS new_stage, stage.name AS new_name
    ),
    logged AS (
      INSERT INTO ws.audit_log (account_id, business_id, actor, action, entity, entity_id, details)
      SELECT ${acc}, ${biz}, ${ctx.userId}, 'job.stage_changed', 'job', job_id,
             jsonb_build_object('from', jsonb_build_object('id', prev_stage, 'name', prev_name),
                                'to', jsonb_build_object('id', new_stage, 'name', new_name))
      FROM upd WHERE prev_stage IS DISTINCT FROM new_stage
    )
    SELECT prev_stage FROM upd
  `
  if (!rows[0]) return no('not_found')
  return done({ prevStageId: (rows[0].prev_stage as string | null) ?? null })
}
