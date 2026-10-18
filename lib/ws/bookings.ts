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
function staffExpr(acc: string, biz: string, staffId: string | null, serviceId: string | null, start: Date, end: Date) {
  return q`(CASE WHEN ${staffId}::uuid IS NOT NULL THEN (
      SELECT id FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${staffId}::uuid
    ) ELSE (
      SELECT st.id FROM ws.staff st
      WHERE st.account_id = ${acc} AND st.business_id = ${biz} AND st.active
        AND (${serviceId}::uuid IS NULL
          OR NOT EXISTS (SELECT 1 FROM ws.service_staff x JOIN ws.staff y ON y.account_id = x.account_id AND y.id = x.staff_id AND y.active WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid)
          OR EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid AND x.staff_id = st.id))
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
  input: { start: Date; end: Date; serviceId: string | null; excludeAppointmentId?: string | null },
): Promise<SlotCheck> {
  const acc = ctx.accountId
  const biz = business.id
  const { start, end, serviceId } = input
  const exclude = input.excludeAppointmentId ?? null
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
        AND (${serviceId}::uuid IS NULL
          OR NOT EXISTS (SELECT 1 FROM ws.service_staff x JOIN ws.staff y ON y.account_id = x.account_id AND y.id = x.staff_id AND y.active WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid)
          OR EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid AND x.staff_id = st.id))
      ORDER BY st.position, st.created_at
    `,
    q`
      SELECT a.kind, a.starts_at, a.ends_at, a.title, c.name AS customer_name, a.staff_id
      FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.status <> 'cancelled'
        AND a.id IS DISTINCT FROM ${exclude}::uuid
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
  duration_min: number | null
  calendar: boolean
  jobs: boolean
}

async function requestState(ctx: WsContext, business: Biz, requestId: string): Promise<RequestState | null> {
  const [rows] = await wsDb(ctx).batch([
    q`
      SELECT r.status, r.wanted_start, r.wanted_end, r.service_id, s.duration_min,
        EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = r.account_id AND m.business_id = r.business_id
                AND m.module = 'calendar' AND m.enabled) AS calendar,
        EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = r.account_id AND m.business_id = r.business_id
                AND m.module = 'jobs' AND m.enabled) AS jobs
      FROM ws.requests r
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
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

  const other = input.start ? !st.wanted_start || input.start.getTime() !== st.wanted_start.getTime() : false
  const start = input.start ?? st.wanted_start
  const durationMs =
    !other && st.wanted_start && st.wanted_end
      ? st.wanted_end.getTime() - st.wanted_start.getTime()
      : (st.duration_min ?? 60) * MINUTE
  const withAppointment = st.calendar && start !== null
  // Kalendář bez zakázek: potvrdit jde jen s časem (jinak není co potvrdit).
  if (st.calendar && !st.jobs && !start) return no('needs_time')
  const end = start ? new Date(start.getTime() + durationMs) : null

  if (withAppointment) await ensureStaff(ctx, business)

  const acc = ctx.accountId
  const biz = business.id
  const sql = new Sql().add(q`
    WITH req AS (
      UPDATE ws.requests SET status = ${other ? 'rescheduled' : 'confirmed'}, handled_at = now()
      WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.requestId} AND status = 'new'
      RETURNING id, customer_id, service_id
    ),
    job AS (
      INSERT INTO ws.jobs (account_id, business_id, customer_id, request_id, stage_id, title)
      SELECT ${acc}, ${biz}, req.customer_id, req.id,
        (SELECT id FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} AND type <> 'cancelled'
          ORDER BY (type = ${withAppointment ? 'in_progress' : 'new'}) DESC, position LIMIT 1),
        COALESCE((SELECT name FROM ws.services WHERE account_id = ${acc} AND id = req.service_id), 'Zakázka')
      FROM req WHERE ${st.jobs}::boolean
      RETURNING id
    ),
    appt AS (
      INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, customer_id, job_id, request_id, service_id, starts_at, ends_at)
      SELECT ${acc}, ${biz}, 'visit', `)
  if (withAppointment) sql.add(staffExpr(acc, biz, input.staffId ?? null, st.service_id, start!, end!))
  else sql.add(q`NULL::uuid`)
  sql.add(q`, req.customer_id, (SELECT id FROM job), req.id, req.service_id, ${start}::timestamptz, ${end}::timestamptz
      FROM req WHERE ${withAppointment}::boolean
      RETURNING id
    )
    SELECT (SELECT id FROM req) AS request_id, (SELECT id FROM appt) AS appointment_id, (SELECT id FROM job) AS job_id
  `)

  try {
    const [rows] = await wsDb(ctx).batch([sql.build()])
    const r = (rows as WsRow[])[0]
    // Mezi čtením a zápisem ji vyřídil někdo jiný.
    if (!r?.request_id) return no('already_handled')
    return done({
      appointmentId: (r.appointment_id as string | null) ?? null,
      jobId: (r.job_id as string | null) ?? null,
      start: withAppointment ? start : null,
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
      RETURNING id
    )
    SELECT (SELECT id FROM found) AS found, (SELECT id FROM upd) AS updated
  `
  if (!r?.found) return no('not_found')
  return r.updated ? done(null) : no('already_handled')
}

/** „Zpět“ po odmítnutí: poptávka je zase nová. */
export async function reopenRequest(ctx: WsContext, business: Biz, requestId: string): Promise<BookingResult<null>> {
  const rows = await wsDb(ctx)`
    UPDATE ws.requests SET status = 'new', handled_at = NULL
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${requestId} AND status = 'declined'
    RETURNING id
  `
  return rows.length ? done(null) : no('not_found')
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
    staffId: string | null
    start: Date
    durationMin?: number | null
    note: string | null
  },
): Promise<BookingResult<{ appointmentId: string; customerId: string | null }>> {
  const acc = ctx.accountId
  const biz = business.id
  const db = wsDb(ctx)

  const [svcRows] = await db.batch([
    q`SELECT id, duration_min FROM ws.services WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.serviceId}::uuid`,
  ])
  const svc = (svcRows as WsRow[])[0]
  const serviceId = svc ? String(svc.id) : null
  const minutes = input.durationMin ?? (svc ? Number(svc.duration_min) : 60)
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
  const sql = new Sql()
    .add(q`
      INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, customer_id, service_id, starts_at, ends_at, note)
      VALUES (${acc}, ${biz}, 'visit', `)
    .add(staffExpr(acc, biz, input.staffId, serviceId, input.start, end))
    .add(q`, ${customerId}::uuid, ${serviceId}::uuid, ${input.start}::timestamptz, ${end}::timestamptz, ${input.note})
      RETURNING id
    `)
  try {
    const [rows] = await db.batch([sql.build()])
    return done({ appointmentId: String((rows as WsRow[])[0].id), customerId })
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
    const rows = await wsDb(ctx)`
      WITH old AS (
        SELECT id, starts_at, ends_at, staff_id FROM ws.appointments
        WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.appointmentId} AND status = 'confirmed'
        FOR UPDATE
      )
      UPDATE ws.appointments a SET
        starts_at = ${input.start}::timestamptz,
        ends_at = ${input.start}::timestamptz + (old.ends_at - old.starts_at),
        staff_id = CASE WHEN ${staffId}::uuid IS NULL THEN a.staff_id ELSE (
          SELECT id FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${staffId}::uuid
        ) END
      FROM old
      WHERE a.account_id = ${acc} AND a.id = old.id
      RETURNING old.starts_at AS prev_start, old.staff_id AS prev_staff, a.starts_at, a.ends_at
    `
    const r = rows[0]
    if (!r) return no('not_found')
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

/** Zruší termín nebo blokaci. Vrátit jde přes restoreAppointment. */
export async function cancelAppointment(ctx: WsContext, business: Biz, appointmentId: string): Promise<BookingResult<null>> {
  const rows = await wsDb(ctx)`
    UPDATE ws.appointments SET status = 'cancelled', cancelled_at = now()
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${appointmentId} AND status = 'confirmed'
    RETURNING id
  `
  return rows.length ? done(null) : no('not_found')
}

/** „Zpět“ po zrušení. Když čas mezitím někdo obsadil, vrátí kolizi. */
export async function restoreAppointment(ctx: WsContext, business: Biz, appointmentId: string): Promise<BookingResult<null>> {
  try {
    const rows = await wsDb(ctx)`
      UPDATE ws.appointments SET status = 'confirmed', cancelled_at = NULL
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${appointmentId} AND status = 'cancelled'
      RETURNING id
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

/** Přesun zakázky do jiného stavu (tabule). Vrací předchozí stav pro „Zpět“. */
export async function setJobStage(
  ctx: WsContext,
  business: Biz,
  input: { jobId: string; stageId: string },
): Promise<BookingResult<{ prevStageId: string | null }>> {
  const acc = ctx.accountId
  const biz = business.id
  const rows = await wsDb(ctx)`
    WITH old AS (
      SELECT id, stage_id FROM ws.jobs
      WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.jobId}
      FOR UPDATE
    ),
    stage AS (
      SELECT id, type FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.stageId}
    )
    UPDATE ws.jobs j SET
      stage_id = stage.id,
      closed_at = CASE WHEN stage.type = ANY(${CLOSED_TYPES}::text[]) THEN COALESCE(j.closed_at, now()) ELSE NULL END
    FROM old, stage
    WHERE j.account_id = ${acc} AND j.id = old.id
    RETURNING old.stage_id AS prev_stage
  `
  if (!rows[0]) return no('not_found')
  return done({ prevStageId: (rows[0].prev_stage as string | null) ?? null })
}
