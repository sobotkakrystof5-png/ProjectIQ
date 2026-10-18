import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import {
  cancelAppointment,
  checkSlot,
  confirmRequest,
  createBlock,
  createBooking,
  createGroupSession,
  declineRequest,
  ensureStaff,
  findOrCreateCustomer,
  moveAppointment,
  normalizePhone,
  reopenRequest,
  restoreAppointment,
  setGroupSessionOpen,
  setJobStage,
} from '../bookings'
import { getRequestsList } from '../calendar'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Poptávky a termíny (S10): potvrzení vytvoří termín a změní stav, kolize
// vrátí chybu (i souběžně), cizí účet nic nezmění, odmítnutí a zrušení jde
// vrátit.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business, name: 'Byznys a' }
const bizB = { id: B.business, name: 'Byznys b' }

const at = (iso: string) => new Date(iso)

/** Nová poptávka účtu A (jako vlastník DB, mimo RLS). */
async function newRequest(start: string | null, opts: { end?: string; service?: string | null; requestedStaff?: string | null } = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ws.requests (account_id, business_id, customer_id, service_id, wanted_start, wanted_end, requested_staff_id, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'web') RETURNING id`,
    [A.account, A.business, A.customer, opts.service === undefined ? A.service : opts.service, start, opts.end ?? null, opts.requestedStaff ?? null],
  )
  return rows[0].id
}

async function row<T>(sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query<T>(sql, params)
  return rows[0]
}

const setModule = (module: string, enabled: boolean) =>
  db.query(
    `INSERT INTO ws.business_modules (account_id, business_id, module, enabled) VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_id, module) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [A.account, A.business, module, enabled],
  )

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('potvrzení poptávky', () => {
  it('na chtěný čas vytvoří termín, změní stav a délku vezme ze služby', async () => {
    const id = await newRequest('2026-11-02T09:00:00Z')
    const res = await confirmRequest(ctxA, bizA, { requestId: id })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const req = await row<{ status: string; handled_at: Date | null }>(`SELECT status, handled_at FROM ws.requests WHERE id = $1`, [id])
    expect(req.status).toBe('confirmed')
    expect(req.handled_at).not.toBeNull()
    const appt = await row<{ starts_at: Date; ends_at: Date; staff_id: string; request_id: string; customer_id: string }>(
      `SELECT starts_at, ends_at, staff_id, request_id, customer_id FROM ws.appointments WHERE id = $1`,
      [res.data.appointmentId],
    )
    expect(appt.starts_at.toISOString()).toBe('2026-11-02T09:00:00.000Z')
    expect(appt.ends_at.toISOString()).toBe('2026-11-02T10:00:00.000Z') // služba 60 min
    expect(appt.staff_id).toBe(A.staff)
    expect(appt.request_id).toBe(id)
    expect(appt.customer_id).toBe(A.customer)
    expect(res.data.jobId).toBeNull() // byznys A nemá zapnuté zakázky
  })

  it('při potvrzení předvolí pracovníka požadovaného zákazníkem', async () => {
    const [other] = await db.query<{ id: string }>(
      `INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, 'Jana') RETURNING id`,
      [A.account, A.business],
    ).then((r) => r.rows)
    await db.query(
      `INSERT INTO ws.service_staff (account_id, business_id, service_id, staff_id) VALUES ($1, $2, $3, $4)`,
      [A.account, A.business, A.service, other.id],
    )
    try {
      const id = await newRequest('2026-11-03T09:00:00Z', { requestedStaff: other.id })
      const res = await confirmRequest(ctxA, bizA, { requestId: id })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const appt = await row<{ staff_id: string }>(`SELECT staff_id FROM ws.appointments WHERE id = $1`, [res.data.appointmentId])
      expect(appt.staff_id).toBe(other.id)
    } finally {
      await db.query(`DELETE FROM ws.appointments WHERE account_id = $1 AND staff_id = $2`, [A.account, other.id])
      await db.query(`DELETE FROM ws.service_staff WHERE account_id = $1 AND staff_id = $2`, [A.account, other.id])
      await db.query(`DELETE FROM ws.staff WHERE account_id = $1 AND id = $2`, [A.account, other.id])
    }
  })

  it('jiný čas = stav „rescheduled“ a termín na novém čase', async () => {
    const id = await newRequest('2026-11-02T11:00:00Z')
    const res = await confirmRequest(ctxA, bizA, { requestId: id, start: at('2026-11-02T13:00:00Z') })
    expect(res.ok).toBe(true)
    const req = await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [id])
    expect(req.status).toBe('rescheduled')
    const appt = await row<{ starts_at: Date }>(`SELECT starts_at FROM ws.appointments WHERE request_id = $1`, [id])
    expect(appt.starts_at.toISOString()).toBe('2026-11-02T13:00:00.000Z')
  })

  it('se zapnutými zakázkami vznikne i zakázka v prvním rozpracovaném stavu', async () => {
    await setModule('jobs', true)
    await db.query(
      `INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES ($1, $2, 'Domluveno', 'in_progress', 1)`,
      [A.account, A.business],
    )
    try {
      const id = await newRequest('2026-11-03T09:00:00Z')
      const res = await confirmRequest(ctxA, bizA, { requestId: id })
      expect(res.ok && res.data.jobId).toBeTruthy()
      if (!res.ok) return
      const job = await row<{ stage: string; title: string; request_id: string }>(
        `SELECT s.name AS stage, j.title, j.request_id FROM ws.jobs j JOIN ws.stages s ON s.id = j.stage_id WHERE j.id = $1`,
        [res.data.jobId],
      )
      expect(job).toEqual({ stage: 'Domluveno', title: 'Služba', request_id: id })
      const appt = await row<{ job_id: string }>(`SELECT job_id FROM ws.appointments WHERE id = $1`, [res.data.appointmentId])
      expect(appt.job_id).toBe(res.data.jobId)

      // bez času jen přijme: zakázka v prvním „novém“ stavu, žádný termín
      const noTime = await newRequest(null)
      const res2 = await confirmRequest(ctxA, bizA, { requestId: noTime })
      expect(res2.ok && res2.data.appointmentId).toBe(null)
      const job2 = await row<{ stage: string }>(
        `SELECT s.name AS stage FROM ws.jobs j JOIN ws.stages s ON s.id = j.stage_id WHERE j.request_id = $1`,
        [noTime],
      )
      expect(job2.stage).toBe('Nová')
    } finally {
      await setModule('jobs', false)
    }
  })

  it('kalendář bez zakázek a poptávka bez času: chce vybrat čas, nic se nezmění', async () => {
    const id = await newRequest(null)
    expect(await confirmRequest(ctxA, bizA, { requestId: id })).toEqual({ ok: false, reason: 'needs_time' })
    expect((await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [id])).status).toBe('new')
  })

  it('už vyřízenou poptávku znovu nepotvrdí', async () => {
    const id = await newRequest('2026-11-04T09:00:00Z')
    expect((await confirmRequest(ctxA, bizA, { requestId: id })).ok).toBe(true)
    expect(await confirmRequest(ctxA, bizA, { requestId: id })).toEqual({ ok: false, reason: 'already_handled' })
  })

  it('potvrdí místo ve skupinové lekci bez druhého termínu a jde zastavit přihlašování', async () => {
    const start = at('2027-01-14T12:00:00Z')
    const session = await createGroupSession(ctxA, bizA, {
      serviceId: A.service, staffId: A.staff, start, title: 'Skupinová lekce', capacity: 2,
    })
    expect(session.ok).toBe(true)
    if (!session.ok) return
    const requestId = await newRequest(start.toISOString())
    await db.query(`UPDATE ws.requests SET session_id = $2 WHERE account_id = $1 AND id = $3`, [A.account, session.data.sessionId, requestId])
    await db.query(
      `INSERT INTO ws.session_attendees (account_id, business_id, session_id, request_id, customer_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [A.account, A.business, session.data.sessionId, requestId, A.customer],
    )
    await db.query(`UPDATE ws.sessions SET reserved = 1 WHERE account_id = $1 AND id = $2`, [A.account, session.data.sessionId])

    expect((await setGroupSessionOpen(ctxA, bizA, session.data.sessionId, false)).ok).toBe(true)
    expect((await row<{ status: string }>(`SELECT status FROM ws.sessions WHERE id = $1`, [session.data.sessionId])).status).toBe('closed')
    expect((await setGroupSessionOpen(ctxA, bizA, session.data.sessionId, true)).ok).toBe(true)

    const confirmed = await confirmRequest(ctxA, bizA, { requestId })
    expect(confirmed).toMatchObject({ ok: true, data: { appointmentId: session.data.appointmentId } })
    expect((await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [requestId])).status).toBe('confirmed')
    expect((await row<{ status: string }>(`SELECT status FROM ws.session_attendees WHERE request_id = $1`, [requestId])).status).toBe('confirmed')
    expect(await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.appointments WHERE account_id = $1 AND request_id = $2`, [A.account, requestId])).toMatchObject({ n: 0 })
    expect(await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.appointments WHERE account_id = $1 AND id = $2`, [A.account, session.data.appointmentId])).toMatchObject({ n: 1 })
  })

  it('nepotvrdí ani neobnoví účastníka zrušené skupinové lekce', async () => {
    const start = at('2027-02-11T12:00:00Z')
    const session = await createGroupSession(ctxA, bizA, {
      serviceId: A.service, staffId: A.staff, start, title: 'Zrušená lekce', capacity: 2,
    })
    expect(session.ok).toBe(true)
    if (!session.ok) return
    const requestId = await newRequest(start.toISOString())
    await db.query(`UPDATE ws.requests SET session_id = $2 WHERE account_id = $1 AND id = $3`, [A.account, session.data.sessionId, requestId])
    await db.query(
      `INSERT INTO ws.session_attendees (account_id, business_id, session_id, request_id, customer_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [A.account, A.business, session.data.sessionId, requestId, A.customer],
    )
    await db.query(`UPDATE ws.sessions SET reserved = 1 WHERE account_id = $1 AND id = $2`, [A.account, session.data.sessionId])
    expect((await cancelAppointment(ctxA, bizA, session.data.appointmentId)).ok).toBe(true)
    expect(await confirmRequest(ctxA, bizA, { requestId })).toEqual({ ok: false, reason: 'session_cancelled' })

    const declinedStart = at('2027-02-12T12:00:00Z')
    const declinedSession = await createGroupSession(ctxA, bizA, {
      serviceId: A.service, staffId: A.staff, start: declinedStart, title: 'Další zrušená lekce', capacity: 2,
    })
    expect(declinedSession.ok).toBe(true)
    if (!declinedSession.ok) return
    const declinedRequest = await newRequest(declinedStart.toISOString())
    await db.query(`UPDATE ws.requests SET session_id = $2 WHERE account_id = $1 AND id = $3`, [A.account, declinedSession.data.sessionId, declinedRequest])
    await db.query(
      `INSERT INTO ws.session_attendees (account_id, business_id, session_id, request_id, customer_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [A.account, A.business, declinedSession.data.sessionId, declinedRequest, A.customer],
    )
    await db.query(`UPDATE ws.sessions SET reserved = 1 WHERE account_id = $1 AND id = $2`, [A.account, declinedSession.data.sessionId])
    expect((await declineRequest(ctxA, bizA, declinedRequest)).ok).toBe(true)
    expect((await cancelAppointment(ctxA, bizA, declinedSession.data.appointmentId)).ok).toBe(true)
    expect(await reopenRequest(ctxA, bizA, declinedRequest)).toEqual({ ok: false, reason: 'session_cancelled' })
  })

  it('více služeb vytvoří jeden přesouvatelný blok a zruší se společně', async () => {
    const [extra] = await db.query<{ id: string }>(
      `INSERT INTO ws.services (account_id, business_id, name, duration_min) VALUES ($1, $2, 'Druhá služba', 30) RETURNING id`,
      [A.account, A.business],
    ).then((r) => r.rows)
    const requestId = await newRequest('2026-12-10T09:00:00Z')
    await db.query(
      `INSERT INTO ws.request_services (account_id, business_id, request_id, service_id, position) VALUES ($1, $2, $3, $4, 1), ($1, $2, $3, $5, 2)`,
      [A.account, A.business, requestId, A.service, extra.id],
    )
    const confirmed = await confirmRequest(ctxA, bizA, { requestId })
    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok || !confirmed.data.appointmentId) return
    const linked = await row<{ n: number; group_id: string; first_end: Date; second_start: Date; final_end: Date }>(
      `SELECT count(*)::int AS n, (array_agg(group_id))[1]::text AS group_id,
        min(starts_at) FILTER (WHERE service_id = $2) AS first_start,
        max(ends_at) FILTER (WHERE service_id = $2) AS first_end,
        min(starts_at) FILTER (WHERE service_id = $3) AS second_start,
        max(ends_at) AS final_end
       FROM ws.appointments WHERE account_id = $1 AND request_id = $4`,
      [A.account, A.service, extra.id, requestId],
    )
    expect(linked.n).toBe(2)
    expect(linked.first_end.toISOString()).toBe('2026-12-10T10:00:00.000Z')
    expect(linked.second_start.toISOString()).toBe('2026-12-10T10:00:00.000Z')
    expect(linked.final_end.toISOString()).toBe('2026-12-10T10:30:00.000Z')

    const moved = await moveAppointment(ctxA, bizA, { appointmentId: confirmed.data.appointmentId, start: at('2026-12-11T09:00:00Z') })
    expect(moved.ok).toBe(true)
    const times = await db.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at FROM ws.appointments WHERE account_id = $1 AND request_id = $2 ORDER BY starts_at`,
      [A.account, requestId],
    )
    expect(times.rows[0].starts_at.toISOString()).toBe('2026-12-11T09:00:00.000Z')
    expect(times.rows[1].starts_at.toISOString()).toBe('2026-12-11T10:00:00.000Z')
    expect((await cancelAppointment(ctxA, bizA, confirmed.data.appointmentId)).ok).toBe(true)
    expect(await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.appointments WHERE request_id = $1 AND status = 'cancelled'`, [requestId])).toMatchObject({ n: 2 })
    expect((await restoreAppointment(ctxA, bizA, confirmed.data.appointmentId)).ok).toBe(true)
  })
})

describe('kolize termínů', () => {
  it('druhá poptávka na obsazený čas vrátí kolizi a zůstane nová', async () => {
    const first = await newRequest('2026-11-05T09:00:00Z')
    const second = await newRequest('2026-11-05T09:30:00Z')
    expect((await confirmRequest(ctxA, bizA, { requestId: first })).ok).toBe(true)
    expect(await confirmRequest(ctxA, bizA, { requestId: second })).toEqual({ ok: false, reason: 'overlap' })
    expect((await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [second])).status).toBe('new')
    const n = await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.appointments WHERE request_id = $1`, [second])
    expect(n.n).toBe(0)
  })

  it('souběžné potvrzení dvou poptávek na stejný čas pustí jen jednu', async () => {
    const x = await newRequest('2026-11-06T09:00:00Z')
    const y = await newRequest('2026-11-06T09:00:00Z')
    const results = await Promise.all([
      confirmRequest(ctxA, bizA, { requestId: x }),
      confirmRequest(ctxA, bizA, { requestId: y }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'overlap' }])
    const n = await row<{ n: number }>(
      `SELECT count(*)::int AS n FROM ws.appointments WHERE account_id = $1 AND starts_at = '2026-11-06T09:00:00Z' AND status <> 'cancelled'`,
      [A.account],
    )
    expect(n.n).toBe(1)
  })

  it('souběžné potvrzení téže poptávky vytvoří jen jeden termín', async () => {
    const id = await newRequest('2026-11-07T09:00:00Z')
    const results = await Promise.all([1, 2, 3].map(() => confirmRequest(ctxA, bizA, { requestId: id })))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const n = await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.appointments WHERE request_id = $1`, [id])
    expect(n.n).toBe(1)
  })

  it('souběžné ruční rezervace na stejný čas: jedna projde, druhá je kolize', async () => {
    const book = () =>
      createBooking(ctxA, bizA, {
        customerId: A.customer,
        serviceId: A.service,
        staffId: null,
        start: at('2026-11-09T08:00:00Z'),
        note: null,
      })
    const results = await Promise.all([book(), book()])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'overlap' }])
  })

  it('tip v detailu: volno a kolize', async () => {
    const free = await checkSlot(ctxA, bizA, { start: at('2026-11-20T09:00:00Z'), end: at('2026-11-20T10:00:00Z'), serviceId: A.service })
    expect(free).toEqual({ free: true, staffName: null })
    const busy = await checkSlot(ctxA, bizA, { start: at('2026-11-05T09:15:00Z'), end: at('2026-11-05T09:45:00Z'), serviceId: A.service })
    expect(busy.free).toBe(false)
    if (!busy.free) expect(busy.conflict.title).toBe('Zákazník')
  })
})

describe('odmítnutí, zrušení, přesun — a „Zpět“', () => {
  it('odmítnutá poptávka se vrátí mezi nové', async () => {
    const id = await newRequest('2026-11-10T09:00:00Z')
    expect((await declineRequest(ctxA, bizA, id)).ok).toBe(true)
    expect((await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [id])).status).toBe('declined')
    expect((await reopenRequest(ctxA, bizA, id)).ok).toBe(true)
    const r = await row<{ status: string; handled_at: Date | null }>(`SELECT status, handled_at FROM ws.requests WHERE id = $1`, [id])
    expect(r).toEqual({ status: 'new', handled_at: null })
  })

  it('zrušený termín se vrátí; když čas mezitím někdo obsadil, vrátí kolizi', async () => {
    const booked = await createBooking(ctxA, bizA, {
      customerId: A.customer, serviceId: A.service, staffId: A.staff, start: at('2026-11-11T09:00:00Z'), note: null,
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return
    const id = booked.data.appointmentId
    expect((await cancelAppointment(ctxA, bizA, id)).ok).toBe(true)
    expect((await restoreAppointment(ctxA, bizA, id)).ok).toBe(true)

    expect((await cancelAppointment(ctxA, bizA, id)).ok).toBe(true)
    const other = await createBooking(ctxA, bizA, {
      customerId: A.customer, serviceId: A.service, staffId: A.staff, start: at('2026-11-11T09:00:00Z'), note: null,
    })
    expect(other.ok).toBe(true)
    expect(await restoreAppointment(ctxA, bizA, id)).toEqual({ ok: false, reason: 'overlap' })
  })

  it('přesun zachová délku a vrátí předchozí místo pro „Zpět“; na obsazené místo nepustí', async () => {
    const booked = await createBooking(ctxA, bizA, {
      customerId: A.customer, serviceId: null, staffId: A.staff, start: at('2026-11-12T09:00:00Z'), durationMin: 90, note: null,
    })
    if (!booked.ok) throw new Error('rezervace selhala')
    const id = booked.data.appointmentId
    const moved = await moveAppointment(ctxA, bizA, { appointmentId: id, start: at('2026-11-12T12:00:00Z') })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.data.prevStart.toISOString()).toBe('2026-11-12T09:00:00.000Z')
    expect(moved.data.end.toISOString()).toBe('2026-11-12T13:30:00.000Z')
    const back = await moveAppointment(ctxA, bizA, { appointmentId: id, start: moved.data.prevStart, staffId: moved.data.prevStaffId })
    expect(back.ok && back.data.start.toISOString()).toBe('2026-11-12T09:00:00.000Z')

    await createBooking(ctxA, bizA, {
      customerId: A.customer, serviceId: A.service, staffId: A.staff, start: at('2026-11-12T15:00:00Z'), note: null,
    })
    expect(await moveAppointment(ctxA, bizA, { appointmentId: id, start: at('2026-11-12T14:30:00Z') })).toEqual({ ok: false, reason: 'overlap' })
  })

  it('blokace pracovníka přes jeho termín neprojde, blokace celého byznysu ano', async () => {
    const overlap = await createBlock(ctxA, bizA, {
      staffId: A.staff, start: at('2026-11-12T08:00:00Z'), end: at('2026-11-12T18:00:00Z'), title: 'Školení',
    })
    expect(overlap).toEqual({ ok: false, reason: 'overlap' })
    const whole = await createBlock(ctxA, bizA, {
      staffId: null, start: at('2026-11-12T08:00:00Z'), end: at('2026-11-12T18:00:00Z'), title: 'Zavřeno',
    })
    expect(whole.ok).toBe(true)
    const slot = await checkSlot(ctxA, bizA, { start: at('2026-11-12T16:00:00Z'), end: at('2026-11-12T17:00:00Z'), serviceId: null })
    expect(slot.free).toBe(false)
  })
})

describe('cizí účet nic nezmění', () => {
  it('účet B nepotvrdí, neodmítne, nezruší ani nepřesune nic z účtu A', async () => {
    const id = await newRequest('2026-11-16T09:00:00Z')
    // B zná UUID poptávky A a pošle ho s vlastním byznysem i s byznysem A
    expect(await confirmRequest(ctxB, bizB, { requestId: id })).toEqual({ ok: false, reason: 'not_found' })
    expect(await confirmRequest(ctxB, { id: A.business, name: 'x' }, { requestId: id })).toEqual({ ok: false, reason: 'not_found' })
    expect(await declineRequest(ctxB, bizB, id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await cancelAppointment(ctxB, bizB, A.appointment)).toEqual({ ok: false, reason: 'not_found' })
    expect(await moveAppointment(ctxB, bizB, { appointmentId: A.appointment, start: at('2026-12-01T09:00:00Z') })).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await setJobStage(ctxB, bizB, { jobId: A.job, stageId: B.stage })).toEqual({ ok: false, reason: 'not_found' })

    const req = await row<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [id])
    expect(req.status).toBe('new')
    const appt = await row<{ status: string; starts_at: Date }>(`SELECT status, starts_at FROM ws.appointments WHERE id = $1`, [A.appointment])
    expect(appt.status).toBe('confirmed')
    expect(appt.starts_at.toISOString()).toBe('2026-10-01T07:00:00.000Z')
  })

  it('pracovník ani zákazník z cizího účtu se do termínu nedostane', async () => {
    const withForeignStaff = await createBooking(ctxB, bizB, {
      customerId: null, customer: null, serviceId: null, staffId: A.staff, start: at('2026-11-17T09:00:00Z'), note: null,
    })
    expect(withForeignStaff).toEqual({ ok: false, reason: 'invalid_staff' })
    const withForeignCustomer = await createBooking(ctxB, bizB, {
      customerId: A.customer, serviceId: null, staffId: null, start: at('2026-11-17T09:00:00Z'), note: null,
    })
    expect(withForeignCustomer).toEqual({ ok: false, reason: 'invalid_customer' })
  })
})

describe('zákazník a pracovník pro ruční rezervaci', () => {
  it('telefon se normalizuje, zákazník se najde podle telefonu i e-mailu', async () => {
    expect(normalizePhone('600 000 001')).toBe('+420600000001')
    expect(normalizePhone('00420 600 000 001')).toBe('+420600000001')
    expect(normalizePhone('abc')).toBeNull()
    expect(await findOrCreateCustomer(ctxA, { name: 'Jiné jméno', phone: '+420600000001', email: null })).toBe(A.customer)
    expect(await findOrCreateCustomer(ctxA, { name: 'Jiné jméno', phone: null, email: 'zakaznik@example.cz' })).toBe(A.customer)
    const fresh = await findOrCreateCustomer(ctxA, { name: 'Nová Zákaznice', phone: '+420600000777', email: null })
    expect(fresh).not.toBe(A.customer)
    expect(await findOrCreateCustomer(ctxA, { name: 'Nová Zákaznice', phone: '+420600000777', email: null })).toBe(fresh)
    // telefon účtu A v účtu B je jiný člověk
    const inB = await findOrCreateCustomer(ctxB, { name: 'Někdo', phone: '+420600000777', email: null })
    expect(inB).not.toBe(fresh)
  })

  it('byznys bez pracovníka dostane jednoho (jen jednou), první rezervace pak projde', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO ws.businesses (account_id, name, slug) VALUES ($1, 'Druhý', 'druhy-a') RETURNING id`,
      [A.account],
    )
    const second = { id: rows[0].id, name: 'Druhý' }
    await Promise.all([ensureStaff(ctxA, second), ensureStaff(ctxA, second)])
    await ensureStaff(ctxA, second)
    const staff = await row<{ n: number; name: string }>(
      `SELECT count(*)::int AS n, min(name) AS name FROM ws.staff WHERE business_id = $1`,
      [second.id],
    )
    expect(staff).toEqual({ n: 1, name: 'Druhý' })
    const booked = await createBooking(ctxA, second, {
      customer: { name: 'Pan Nový', phone: null, email: null }, serviceId: null, staffId: null, start: at('2026-11-18T09:00:00Z'), note: null,
    })
    expect(booked.ok).toBe(true)
  })
})

describe('zakázky a seznam poptávek', () => {
  it('přesun zakázky do uzavřeného stavu nastaví uzavření a vrátí předchozí stav', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES ($1, $2, 'Hotovo', 'done', 9) RETURNING id`,
      [A.account, A.business],
    )
    const res = await setJobStage(ctxA, bizA, { jobId: A.job, stageId: rows[0].id })
    expect(res).toEqual({ ok: true, data: { prevStageId: A.stage } })
    expect((await row<{ closed_at: Date | null }>(`SELECT closed_at FROM ws.jobs WHERE id = $1`, [A.job])).closed_at).not.toBeNull()
    await setJobStage(ctxA, bizA, { jobId: A.job, stageId: A.stage })
    expect((await row<{ closed_at: Date | null }>(`SELECT closed_at FROM ws.jobs WHERE id = $1`, [A.job])).closed_at).toBeNull()
    // stav z cizího účtu nejde
    expect(await setJobStage(ctxA, bizA, { jobId: A.job, stageId: B.stage })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('Nové / Potvrzené / Vyřízené podle stavu a termínu', async () => {
    const now = at('2026-11-01T00:00:00Z')
    const nove = await getRequestsList(ctxA, bizA, 'nove', now)
    expect(nove.items.every((r) => r.status === 'new')).toBe(true)
    const potvrzene = await getRequestsList(ctxA, bizA, 'potvrzene', now)
    expect(potvrzene.items.length).toBeGreaterThan(0)
    expect(potvrzene.items.every((r) => r.appointment_start !== null || r.status !== 'new')).toBe(true)
    // po všech termínech zůstanou potvrzené jen poptávky s otevřenou zakázkou
    const later = await getRequestsList(ctxA, bizA, 'potvrzene', at('2027-01-01T00:00:00Z'))
    const withOpenJob = await row<{ n: number }>(
      `SELECT count(DISTINCT j.request_id)::int AS n FROM ws.jobs j JOIN ws.requests r ON r.id = j.request_id
       WHERE j.business_id = $1 AND j.closed_at IS NULL AND r.status IN ('confirmed', 'rescheduled')`,
      [A.business],
    )
    expect(withOpenJob.n).toBe(2)
    expect(later.items).toHaveLength(withOpenJob.n)
    expect(nove.counts.nove + nove.counts.potvrzene + nove.counts.vyrizene).toBe(
      (await row<{ n: number }>(`SELECT count(*)::int AS n FROM ws.requests WHERE business_id = $1`, [A.business])).n,
    )
    // účet B vidí jen svoje
    const b = await getRequestsList(ctxB, bizB, 'nove', now)
    expect(b.counts.nove + b.counts.potvrzene + b.counts.vyrizene).toBe(1)
  })
})
