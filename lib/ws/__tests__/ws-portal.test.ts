import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import { setLinkSecretForTests } from '../email/links'
import { setEmailTransportForTests, type OutgoingEmail } from '../email/transport'
import { loadPortal, portalCancel, portalMove, portalReview, portalSlots, resolvePortal, type PortalRef } from '../portal'
import { portalRules } from '../portal-rules'
import { pragueToUtc } from '../time'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Klientský portál (S16): neplatný i cizí token = null (stránka 404 bez
// rozdílu), interní poznámky se do portálu nedostanou, přesun respektuje
// kolize a pravidla byznysu, hodnocení jen jednou a až po dokončení.

let db: PGlite
const A = ids('a')
const B = ids('b')
let sent: OutgoingEmail[] = []

// Pondělí 2. 11. 2026, 9:00 v Praze. Termíny ve středu 4. 11.
const NOW = new Date('2026-11-02T08:00:00Z')
const WED = '2026-11-04'
const at = (day: string, h: number, m = 0) => pragueToUtc(day, h * 60 + m)

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

async function visit(start: Date, opts: { customer?: string | null; note?: string } = {}): Promise<{ id: string; token: string }> {
  const [r] = await rows<{ id: string; public_token: string }>(
    `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, service_id, starts_at, ends_at, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, public_token`,
    [A.account, A.business, A.staff, opts.customer === undefined ? A.customer : opts.customer, A.service, start, new Date(start.getTime() + 3_600_000), opts.note ?? null],
  )
  return { id: r.id, token: r.public_token }
}

const ref = async (token: string): Promise<PortalRef> => {
  const r = await resolvePortal(token)
  if (!r) throw new Error('token neplatí')
  return r
}

async function setModule(module: string, enabled: boolean, business = A.business, account = A.account) {
  await db.query(
    `INSERT INTO ws.business_modules (account_id, business_id, module, enabled) VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_id, module) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [account, business, module, enabled],
  )
}

const setRules = (settings: Record<string, unknown>) =>
  db.query(`UPDATE ws.businesses SET settings = settings || $2::jsonb WHERE id = $1`, [A.business, JSON.stringify(settings)])

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  setLinkSecretForTests('test-pepper-'.repeat(4))
  setEmailTransportForTests({ send: async (m) => (sent.push(m), { ok: true, providerId: `re_${sent.length}` }) })
  await db.query(`UPDATE ws.members SET email = 'majitel@example.cz' WHERE account_id = $1`, [A.account])
  // Otevřeno po–pá 9–17 (seed má jen pondělí).
  for (const wd of [2, 3, 4, 5]) {
    await db.query(`INSERT INTO ws.opening_hours (account_id, business_id, weekday, opens, closes) VALUES ($1, $2, $3, '09:00', '17:00')`, [A.account, A.business, wd])
  }
  await setModule('portal', true)
  await setModule('portal', true, B.business, B.account)
  await db.query(`DELETE FROM ws.appointments WHERE account_id = $1`, [A.account])
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setEmailTransportForTests(undefined)
  setLinkSecretForTests(null)
  await db?.close()
})

beforeEach(async () => {
  sent = []
  await db.query(`DELETE FROM ws.appointments WHERE account_id = $1`, [A.account])
  await db.query(`DELETE FROM ws.outbound_messages`)
  await db.query(`DELETE FROM ws.notifications WHERE type LIKE 'portal_%' OR type = 'review'`)
  await setRules({ portal_change_hours: 24, address: 'Dlouhá 1, Praha' })
})

describe('token', () => {
  it('neplatný, neexistující i vypnutý odkaz vrátí null bez rozdílu', async () => {
    const v = await visit(at(WED, 10))
    expect(await resolvePortal('nesmysl')).toBeNull()
    expect(await resolvePortal("' OR 1=1 --")).toBeNull()
    expect(await resolvePortal('00000000-0000-4000-8000-000000000000')).toBeNull()
    // ID záznamu není token
    expect(await resolvePortal(v.id)).toBeNull()
    expect(await resolvePortal(v.token)).toMatchObject({ accountId: A.account, businessId: A.business, kind: 'appointment', id: v.id })

    await setModule('portal', false)
    expect(await resolvePortal(v.token)).toBeNull()
    await setModule('portal', true)
  })

  it('blokace odkaz nemá, archivovaný byznys taky ne', async () => {
    const [block] = await rows<{ public_token: string }>(
      `INSERT INTO ws.appointments (account_id, business_id, kind, starts_at, ends_at, title) VALUES ($1, $2, 'block', $3, $4, 'Dovolená') RETURNING public_token`,
      [A.account, A.business, at(WED, 8), at(WED, 9)],
    )
    expect(await resolvePortal(block.public_token)).toBeNull()

    const [job] = await rows<{ public_token: string }>(`SELECT public_token FROM ws.jobs WHERE id = $1`, [B.job])
    expect(await resolvePortal(job.public_token)).toMatchObject({ accountId: B.account, kind: 'job' })
    await db.query(`UPDATE ws.businesses SET archived_at = now() WHERE id = $1`, [B.business])
    expect(await resolvePortal(job.public_token)).toBeNull()
    await db.query(`UPDATE ws.businesses SET archived_at = NULL WHERE id = $1`, [B.business])
  })

  it('cizí záznam s vlastním účtem nejde načíst ani změnit', async () => {
    const [jobB] = await rows<{ public_token: string }>(`SELECT public_token FROM ws.jobs WHERE id = $1`, [B.job])
    const refB = await ref(jobB.public_token)
    // Podvržený odkaz: účet A, záznam B.
    const forged: PortalRef = { accountId: A.account, businessId: A.business, kind: 'job', id: B.job }
    expect(await loadPortal(forged, NOW)).toBeNull()
    expect(await portalReview(forged, 10, null, NOW)).toEqual({ ok: false, reason: 'not_found' })
    const view = await loadPortal(refB, NOW)
    expect(view?.brand.name).toBe('Byznys b')
  })
})

describe('co portál ukazuje', () => {
  it('interní poznámky, kontakty ani kolonky se do portálu nedostanou', async () => {
    await db.query(`UPDATE ws.customers SET note = 'TAJNÁ POZNÁMKA O ZÁKAZNÍKOVI' WHERE id = $1`, [A.customer])
    await db.query(`UPDATE ws.jobs SET field_values = '{"interni":"TAJNÁ KOLONKA"}' WHERE id = $1`, [A.job])
    const v = await visit(at(WED, 10), { note: 'TAJNÁ POZNÁMKA K TERMÍNU' })
    await db.query(`UPDATE ws.appointments SET job_id = $2 WHERE id = $1`, [v.id, A.job])
    const [job] = await rows<{ public_token: string }>(`SELECT public_token FROM ws.jobs WHERE id = $1`, [A.job])

    for (const token of [v.token, job.public_token]) {
      const view = await loadPortal(await ref(token), NOW)
      const json = JSON.stringify(view)
      expect(json).not.toContain('TAJNÁ')
      expect(json).not.toContain('zakaznik@example.cz')
      expect(json).not.toContain('+420600000001')
      expect(json).not.toContain(A.account)
    }
  })

  it('termín: služba, adresa, do kdy jde měnit', async () => {
    const v = await visit(at(WED, 10))
    const view = await loadPortal(await ref(v.token), NOW)
    expect(view?.brand.address).toBe('Dlouhá 1, Praha')
    expect(view?.firstName).toBe('Zákazník')
    expect(view?.visit).toMatchObject({ state: 'upcoming', service: 'Služba', canCancel: true, canMove: true, locked: null })
    expect(view?.visit?.deadline?.toISOString()).toBe(at('2026-11-03', 10).toISOString())
    expect(view?.visit?.calendarUrl).toContain('/z/kalendar/')
  })

  it('zakázka: stavy jako osa, jen viditelné zprávy a vystavené faktury', async () => {
    const [s2] = await rows<{ id: string }>(`INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES ($1, $2, 'Obhlídka', 'in_progress', 1) RETURNING id`, [A.account, A.business])
    await db.query(`INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES ($1, $2, 'Hotovo', 'done', 2), ($1, $2, 'Zrušeno', 'cancelled', 3)`, [A.account, A.business])
    await db.query(`UPDATE ws.jobs SET stage_id = $2 WHERE id = $1`, [A.job, s2.id])
    await db.query(`INSERT INTO ws.job_updates (account_id, business_id, job_id, body, deleted_at) VALUES ($1, $2, $3, 'Smazaná zpráva', now())`, [A.account, A.business, A.job])
    await db.query(`UPDATE ws.invoices SET status = 'issued' WHERE id = $1`, [A.invoice])
    await setModule('invoices', true)

    const [job] = await rows<{ public_token: string }>(`SELECT public_token FROM ws.jobs WHERE id = $1`, [A.job])
    const view = await loadPortal(await ref(job.public_token), NOW)
    expect(view?.job?.stages).toEqual([
      { name: 'Nová', state: 'done' },
      { name: 'Obhlídka', state: 'current' },
      { name: 'Hotovo', state: 'todo' },
    ])
    expect(view?.job?.updates.map((u) => u.body)).toEqual(['Materiál je objednaný.'])
    expect(view?.job?.invoices.map((i) => i.number)).toEqual(['2026001'])

    await setModule('invoices', false)
    expect((await loadPortal(await ref(job.public_token), NOW))?.job?.invoices).toEqual([])
  })
})

describe('přesun a zrušení', () => {
  it('volné časy vynechají obsazené a přesun do kolize odmítne', async () => {
    const v = await visit(at(WED, 10))
    await visit(at(WED, 12), { customer: null })
    const r = await ref(v.token)

    const slots = await portalSlots(r, NOW)
    const wed = slots?.find((d) => d.date === WED)?.times ?? []
    expect(wed).not.toContain(10 * 60) // současný čas
    expect(wed).not.toContain(12 * 60)
    expect(wed).not.toContain(11 * 60 + 30) // přesah do 12:00
    expect(wed).toContain(10 * 60 + 30) // překryv sám se sebou nevadí
    expect(wed).toContain(14 * 60)

    expect(await portalMove(r, WED, 12 * 60, NOW)).toEqual({ ok: false, reason: 'taken' })
    expect(await portalMove(r, WED, 14 * 60, NOW)).toEqual({ ok: true })
    const [a] = await rows<{ starts_at: Date; status: string }>(`SELECT starts_at, status FROM ws.appointments WHERE id = $1`, [v.id])
    expect(new Date(a.starts_at).toISOString()).toBe(at(WED, 14).toISOString())

    const notes = await rows<{ type: string; link: string }>(`SELECT type, link FROM ws.notifications WHERE type = 'portal_moved'`)
    expect(notes).toEqual([{ type: 'portal_moved', link: `/w/byznys-a/kalendar?detail=termin:${v.id}` }])
    const mails = await rows<{ type: string; to_address: string }>(`SELECT type, to_address FROM ws.outbound_messages ORDER BY type`)
    expect(mails).toEqual(
      expect.arrayContaining([
        { type: 'portal_moved', to_address: 'majitel@example.cz' },
        { type: 'booking_changed', to_address: 'zakaznik@example.cz' },
      ]),
    )
  })

  it('čas, který mezitím někdo obsadil, rozhodne DB', async () => {
    const v = await visit(at(WED, 10))
    const r = await ref(v.token)
    // Volné časy se načetly, pak někdo obsadil 15:00.
    await visit(at(WED, 15), { customer: null })
    expect(await portalMove(r, WED, 15 * 60, NOW)).toEqual({ ok: false, reason: 'taken' })
    // Mimo otevírací dobu taky ne.
    expect(await portalMove(r, WED, 20 * 60, NOW)).toEqual({ ok: false, reason: 'taken' })
  })

  it('po termínu změny nejdou, pozdě ani když je firma nedovoluje', async () => {
    const soon = await visit(at('2026-11-02', 15)) // za 6 h, pravidlo 24 h
    const late = await loadPortal(await ref(soon.token), NOW)
    expect(late?.visit).toMatchObject({ canCancel: false, canMove: false, locked: 'late' })
    expect(await portalCancel(await ref(soon.token), NOW)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await portalMove(await ref(soon.token), WED, 14 * 60, NOW)).toEqual({ ok: false, reason: 'not_allowed' })

    await setRules({ portal_change_hours: null })
    const v = await visit(at(WED, 10))
    expect((await loadPortal(await ref(v.token), NOW))?.visit).toMatchObject({ canCancel: false, locked: 'off' })
    expect(await portalCancel(await ref(v.token), NOW)).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('zrušení uvolní čas, dá vědět firmě a zákazníkovi nepošle omluvu', async () => {
    const v = await visit(at(WED, 10))
    expect(await portalCancel(await ref(v.token), NOW)).toEqual({ ok: true })
    const [a] = await rows<{ status: string }>(`SELECT status FROM ws.appointments WHERE id = $1`, [v.id])
    expect(a.status).toBe('cancelled')
    expect(await rows(`SELECT 1 FROM ws.notifications WHERE type = 'portal_cancelled'`)).toHaveLength(1)
    const mails = await rows<{ type: string }>(`SELECT type FROM ws.outbound_messages`)
    expect(mails.map((m) => m.type)).toEqual(['portal_cancelled'])
    // Podruhé už není co rušit.
    expect(await portalCancel(await ref(v.token), NOW)).toEqual({ ok: false, reason: 'not_allowed' })
    const view = await loadPortal(await ref(v.token), NOW)
    expect(view?.visit?.state).toBe('cancelled')
  })
})

describe('hodnocení', () => {
  it('jen se zapnutou funkcí, až po termínu a jen jednou', async () => {
    const v = await visit(at(WED, 10))
    const r = await ref(v.token)
    expect((await loadPortal(r, NOW))?.review).toBeNull()
    expect(await portalReview(r, 9, null, NOW)).toEqual({ ok: false, reason: 'not_allowed' })

    await setModule('reviews', true)
    expect((await loadPortal(r, NOW))?.review).toEqual({ eligible: false, done: null })
    expect(await portalReview(r, 9, null, NOW)).toEqual({ ok: false, reason: 'not_allowed' })

    const after = new Date(at(WED, 12).getTime())
    expect(await portalReview(r, 9, 'Moc děkuji', after)).toEqual({ ok: true })
    expect(await portalReview(r, 3, null, after)).toEqual({ ok: false, reason: 'duplicate' })
    const saved = await rows<{ score: number; comment: string; customer_id: string }>(`SELECT score, comment, customer_id FROM ws.reviews WHERE appointment_id = $1`, [v.id])
    expect(saved).toEqual([{ score: 9, comment: 'Moc děkuji', customer_id: A.customer }])
    expect((await loadPortal(r, after))?.review).toEqual({ eligible: false, done: { score: 9, comment: 'Moc děkuji' } })
    expect(await rows(`SELECT 1 FROM ws.notifications WHERE type = 'review'`)).toHaveLength(1)
    await setModule('reviews', false)
  })
})

describe('pravidla', () => {
  it('výchozí 24 h, neznámá hodnota = výchozí, null = zákazník nemění', () => {
    expect(portalRules({})).toEqual({ changeHours: 24, address: null })
    expect(portalRules({ portal_change_hours: 7, address: '  ' })).toEqual({ changeHours: 24, address: null })
    expect(portalRules({ portal_change_hours: null, address: 'Ulice 1' })).toEqual({ changeHours: null, address: 'Ulice 1' })
    expect(portalRules({ portal_change_hours: 0 }).changeHours).toBe(0)
  })
})

describe('zprávy k zakázce (aplikace)', () => {
  it('zprávu nejde přidat k cizí zakázce, e-mail nese odkaz do portálu', async () => {
    const { addJobUpdate, setJobUpdateDeleted } = await import('../jobs')
    const { notifyJobUpdate } = await import('../email/notify')
    const ctxA = { userId: 'user_a', accountId: A.account, role: 'owner' as const }
    expect(await addJobUpdate(ctxA, { id: A.business }, B.job, 'cizí')).toBeNull()
    expect(await rows(`SELECT 1 FROM ws.job_updates WHERE job_id = $1 AND body = 'cizí'`, [B.job])).toHaveLength(0)

    const id = await addJobUpdate(ctxA, { id: A.business }, A.job, 'Ve čtvrtek začínáme.')
    expect(id).toBeTruthy()
    expect(await notifyJobUpdate(ctxA, A.business, A.job, id!, 'Ve čtvrtek začínáme.')).toBe(true)
    const [mail] = await rows<{ type: string; payload: { html?: string } }>(`SELECT type, payload FROM ws.outbound_messages WHERE type = 'job_update'`)
    const [job] = await rows<{ public_token: string }>(`SELECT public_token FROM ws.jobs WHERE id = $1`, [A.job])
    expect(JSON.stringify(mail.payload)).toContain(`/z/${job.public_token}`)
    expect(JSON.stringify(mail.payload)).toContain('Ve čtvrtek začínáme.')

    expect(await setJobUpdateDeleted(ctxA, { id: A.business }, id!, true)).toBe(true)
    const view = await loadPortal(await ref(job.public_token), NOW)
    expect(view?.job?.updates.map((u) => u.body)).not.toContain('Ve čtvrtek začínáme.')
  })
})
