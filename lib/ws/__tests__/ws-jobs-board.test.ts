import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { setJobStage } from '../bookings'
import { getJobBoard } from '../calendar'
import { getJobDetail } from '../jobs'
import {
  countJobFilters,
  jobFactsFrom,
  jobFlags,
  matchesJobFilter,
  parseJobFilter,
  parseJobView,
  type JobFacts,
} from '../job-filters'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Zakázky (RD06): filtry Čeká na mě / Po termínu / Bez termínu, přepínání
// pohledu, data tabule (příští a poslední termín), přesun mezi stavy se
// „Zpět“ a historie stavů z audit_log.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business, name: 'Byznys a' }
const bizB = { id: B.business, name: 'Byznys b' }

const NOW = new Date('2026-11-01T10:00:00Z')
const at = (iso: string) => new Date(iso)

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

async function stage(name: string, type: string, position: number, owner = A) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [owner.account, owner.business, name, type, position],
  )
  return rows[0].id
}

async function job(title: string, stageId: string, owner = A): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ws.jobs (account_id, business_id, customer_id, stage_id, title) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [owner.account, owner.business, owner.customer, stageId, title],
  )
  return rows[0].id
}

async function appointment(jobId: string, start: string, end: string) {
  await db.query(
    `INSERT INTO ws.appointments (account_id, business_id, staff_id, customer_id, job_id, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [A.account, A.business, A.staff, A.customer, jobId, start, end],
  )
}

describe('filtry a pohled (čisté funkce)', () => {
  const base: JobFacts = { stageType: 'in_progress', closed: false, nextStart: null, lastEnd: null }

  it('Čeká na mě = otevřená zakázka v prvním stavu', () => {
    expect(jobFlags({ ...base, stageType: 'new' }, NOW).waiting).toBe(true)
    expect(jobFlags({ ...base, stageType: 'in_progress' }, NOW).waiting).toBe(false)
    expect(jobFlags({ ...base, stageType: 'new', closed: true }, NOW).waiting).toBe(false)
  })

  it('Po termínu = poslední termín proběhl a žádný další není', () => {
    const past = at('2026-10-30T10:00:00Z')
    const future = at('2026-11-03T10:00:00Z')
    expect(jobFlags({ ...base, lastEnd: past }, NOW).overdue).toBe(true)
    // další termín je domluvený: není po termínu
    expect(jobFlags({ ...base, lastEnd: future, nextStart: at('2026-11-03T09:00:00Z') }, NOW).overdue).toBe(false)
    // uzavřená zakázka po termínu není (hotovo, zaplaceno, zrušeno)
    for (const type of ['done', 'paid', 'cancelled']) expect(jobFlags({ ...base, stageType: type, lastEnd: past }, NOW).overdue).toBe(false)
    expect(jobFlags({ ...base, lastEnd: past, closed: true }, NOW).overdue).toBe(false)
  })

  it('Bez termínu = otevřená zakázka bez jediného termínu', () => {
    expect(jobFlags(base, NOW).noTerm).toBe(true)
    expect(jobFlags({ ...base, lastEnd: at('2026-10-30T10:00:00Z') }, NOW).noTerm).toBe(false)
    expect(jobFlags({ ...base, stageType: 'done' }, NOW).noTerm).toBe(false)
  })

  it('filtr a počty', () => {
    const jobs: JobFacts[] = [
      { stageType: 'new', closed: false, nextStart: null, lastEnd: null },
      { stageType: 'in_progress', closed: false, nextStart: null, lastEnd: at('2026-10-20T10:00:00Z') },
      { stageType: 'in_progress', closed: false, nextStart: at('2026-11-05T10:00:00Z'), lastEnd: at('2026-11-05T11:00:00Z') },
      { stageType: 'done', closed: true, nextStart: null, lastEnd: null },
    ]
    expect(countJobFilters(jobs, NOW)).toEqual({ vse: 4, ceka: 1, 'po-terminu': 1, 'bez-terminu': 1 })
    expect(jobs.filter((j) => matchesJobFilter(j, 'vse', NOW))).toHaveLength(4)
    expect(jobs.filter((j) => matchesJobFilter(j, 'po-terminu', NOW))).toEqual([jobs[1]])
    expect(jobs.filter((j) => matchesJobFilter(j, 'ceka', NOW))).toEqual([jobs[0]])
    expect(countJobFilters([], NOW)).toEqual({ vse: 0, ceka: 0, 'po-terminu': 0, 'bez-terminu': 0 })
  })

  it('adresa: neznámý filtr je Vše, bez pohledu telefon dostane seznam a počítač tabuli', () => {
    expect(parseJobFilter('po-terminu')).toBe('po-terminu')
    expect(parseJobFilter('nesmysl')).toBe('vse')
    expect(parseJobFilter(undefined)).toBe('vse')
    expect(parseJobFilter(['ceka', 'x'])).toBe('ceka')
    expect(parseJobView(undefined, true)).toBe('seznam')
    expect(parseJobView(undefined, false)).toBe('tabule')
    expect(parseJobView('tabule', true)).toBe('tabule')
    expect(parseJobView('seznam', false)).toBe('seznam')
    expect(parseJobView('x', false)).toBe('tabule')
  })

  it('zakázka bez stavu patří do prvního stavu', () => {
    const stages = [{ id: 's1', type: 'new' }, { id: 's2', type: 'done' }]
    expect(jobFactsFrom({ stage_id: null, closed_at: null, next_start: null, last_end: null }, stages).stageType).toBe('new')
    expect(jobFactsFrom({ stage_id: 's2', closed_at: NOW, next_start: null, last_end: null }, stages)).toMatchObject({ stageType: 'done', closed: true })
  })
})

describe('tabule zakázek z databáze', () => {
  it('vrací příští a poslední termín, uzavření a filtry sedí na skutečná data', async () => {
    const working = await stage('Rozpracováno', 'in_progress', 2)
    const done = await stage('Hotovo', 'done', 3)
    const noTerm = await job('Bez termínu', working)
    const overdue = await job('Po termínu', working)
    await appointment(overdue, '2026-10-20 09:00+02', '2026-10-20 10:00+02')
    const planned = await job('Domluveno', working)
    await appointment(planned, '2026-10-20 11:00+02', '2026-10-20 12:00+02')
    await appointment(planned, '2026-11-05 09:00+01', '2026-11-05 10:00+01')
    const finished = await job('Hotová', done)
    await db.query(`UPDATE ws.jobs SET closed_at = $1 WHERE id = $2`, ['2026-10-25T10:00:00Z', finished])

    const { stages, jobs } = await getJobBoard(ctxA, bizA, NOW)
    const byTitle = (t: string) => jobs.find((j) => j.title === t)!
    expect(byTitle('Bez termínu')).toMatchObject({ next_start: null, last_end: null, closed_at: null })
    expect(byTitle('Po termínu').next_start).toBeNull()
    expect(byTitle('Po termínu').last_end?.toISOString()).toBe('2026-10-20T08:00:00.000Z')
    expect(byTitle('Domluveno').next_start?.toISOString()).toBe('2026-11-05T08:00:00.000Z')
    expect(byTitle('Domluveno').last_end?.toISOString()).toBe('2026-11-05T09:00:00.000Z')
    expect(byTitle('Hotová').closed_at).not.toBeNull()

    const facts = jobs.map((j) => ({ title: j.title, f: jobFactsFrom(j, stages) }))
    const names = (filter: 'ceka' | 'po-terminu' | 'bez-terminu') => facts.filter((x) => matchesJobFilter(x.f, filter, NOW)).map((x) => x.title).sort()
    expect(names('po-terminu')).toEqual(expect.arrayContaining(['Po termínu']))
    expect(names('po-terminu')).not.toContain('Domluveno')
    expect(names('po-terminu')).not.toContain('Hotová')
    expect(names('bez-terminu')).toEqual(['Bez termínu'])
    expect(names('ceka')).toEqual(['Zakázka']) // seed: zakázka v prvním stavu s proběhlým termínem
    expect(noTerm).toBeTruthy()
  })

  it('cizí účet nevidí zakázky ani stavy', async () => {
    const b = await getJobBoard(ctxB, bizB, NOW)
    expect(b.jobs.map((j) => j.title)).toEqual(['Zakázka'])
    expect(b.stages.every((s) => s.id !== A.stage)).toBe(true)
  })
})

describe('přesun mezi stavy a historie', () => {
  it('změna stavu se zapíše, „Zpět“ přidá další záznam, stejný stav nic nezapíše', async () => {
    const working = await stage('V řešení', 'in_progress', 20)
    const id = await job('Historie', A.stage)
    const move = await setJobStage(ctxA, bizA, { jobId: id, stageId: working })
    expect(move).toEqual({ ok: true, data: { prevStageId: A.stage } })
    // stejný stav: nic se nezapíše
    expect((await setJobStage(ctxA, bizA, { jobId: id, stageId: working })).ok).toBe(true)
    const back = await setJobStage(ctxA, bizA, { jobId: id, stageId: A.stage })
    expect(back.ok).toBe(true)

    const detail = await getJobDetail(ctxA, bizA, id, NOW)
    expect(detail?.history.map((h) => [h.from, h.to])).toEqual([
      ['V řešení', 'Nová'],
      ['Nová', 'V řešení'],
    ])
    expect(detail?.stageId).toBe(A.stage)
    expect(detail?.stages.map((s) => s.name)).toContain('V řešení')
    expect(detail?.createdAt).toBeInstanceOf(Date)
    const log = await db.query<{ actor: string; entity_id: string }>(
      `SELECT actor, entity_id FROM ws.audit_log WHERE action = 'job.stage_changed' AND entity_id = $1`,
      [id],
    )
    expect(log.rows).toHaveLength(2)
    expect(log.rows.every((r) => r.actor === 'user_a')).toBe(true)
  })

  it('historie drží názvy stavů i po přejmenování', async () => {
    const tmp = await stage('Starý název', 'in_progress', 30)
    const id = await job('Přejmenování', A.stage)
    await setJobStage(ctxA, bizA, { jobId: id, stageId: tmp })
    await db.query(`UPDATE ws.stages SET name = 'Nový název' WHERE id = $1`, [tmp])
    const detail = await getJobDetail(ctxA, bizA, id, NOW)
    expect(detail?.history[0]).toMatchObject({ from: 'Nová', to: 'Starý název' })
    expect(detail?.stageName).toBe('Nový název')
  })

  it('cizí účet zakázku nepřesune, nezapíše historii a detail nevidí', async () => {
    const before = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.audit_log WHERE action = 'job.stage_changed'`)
    expect(await setJobStage(ctxB, bizB, { jobId: A.job, stageId: B.stage })).toEqual({ ok: false, reason: 'not_found' })
    expect(await setJobStage(ctxB, bizB, { jobId: A.job, stageId: A.stage })).toEqual({ ok: false, reason: 'not_found' })
    const after = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.audit_log WHERE action = 'job.stage_changed'`)
    expect(after.rows[0].n).toBe(before.rows[0].n)
    expect(await getJobDetail(ctxB, bizB, A.job, NOW)).toBeNull()
    // stav z cizího účtu zakázku nepřesune a nic nezaloguje
    expect(await setJobStage(ctxA, bizA, { jobId: A.job, stageId: B.stage })).toEqual({ ok: false, reason: 'not_found' })
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.audit_log WHERE action = 'job.stage_changed'`)).rows[0].n).toBe(before.rows[0].n)
  })
})
