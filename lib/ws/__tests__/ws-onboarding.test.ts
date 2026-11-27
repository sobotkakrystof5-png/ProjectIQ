import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setWsDriverForTests, wsDb } from '../db'
import { requireWorkspace, setWsAuthProvider } from '../context'
import { createAccountWithBusiness, ownedAccountId, slugify } from '../onboarding'
import { createWsTestDb, pgliteDriver } from './helpers/ws-pglite'

// Průvodce /w/novy (databázová část) proti PGlite jako ws_app (R-154: účet a
// členství jen v Neonu, bez organizace Clerku).

let db: PGlite

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setWsAuthProvider(null)
  await db?.close()
})

const owner = (userId: string) => ({ userId, name: 'Lenka Nováková', email: `${userId}@example.cz` })

describe('slugify', () => {
  it('bez diakritiky, malými písmeny, pomlčky', () => {
    expect(slugify('Kadeřnictví U Lenky')).toBe('kadernictvi-u-lenky')
    expect(slugify('  Azbest & Servis — Novák s.r.o. ')).toBe('azbest-servis-novak-s-r-o')
    expect(slugify('Žluťoučký kůň 2')).toBe('zlutoucky-kun-2')
  })

  it('prázdný nebo divný název dá použitelný slug, délka se vejde do omezení', () => {
    expect(slugify('!!!')).toBe('byznys')
    const long = slugify('a'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(55)
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe('createAccountWithBusiness', () => {
  it('rezervovaný slug (pevná cesta pod /w) dostane koncovku', async () => {
    const { accountId } = await createAccountWithBusiness({
      name: 'Nový',
      industry: 'uklid',
      owner: owner('user_rez'),
    })
    const [biz] = await wsDb({ accountId })`SELECT slug FROM ws.businesses WHERE account_id = ${accountId}`
    expect(biz.slug).toMatch(/^novy-[a-z2-9]{4}$/)
  })


  it('založí účet, vlastníka, byznys a šablonu oboru v jedné transakci', async () => {
    const { accountId, created } = await createAccountWithBusiness({
      name: 'Kadeřnictví U Lenky',
      industry: 'kadernictvi-kosmetika',
      owner: owner('user_n1'),
    })
    expect(created).toBe(true)
    expect(await ownedAccountId('user_n1')).toBe(accountId)

    const ws = wsDb({ accountId })
    const [biz] = await ws`SELECT id, slug, industry FROM ws.businesses WHERE account_id = ${accountId}`
    expect(biz).toMatchObject({ slug: 'kadernictvi-u-lenky', industry: 'kadernictvi-kosmetika' })
    const [member] = await ws`SELECT role, clerk_user_id FROM ws.members WHERE account_id = ${accountId}`
    expect(member).toEqual({ role: 'owner', clerk_user_id: 'user_n1' })
    const [counts] = await ws<{ services: number; stages: number; fields: number }>`
      SELECT
        (SELECT count(*)::int FROM ws.services WHERE account_id = ${accountId}) AS services,
        (SELECT count(*)::int FROM ws.stages WHERE account_id = ${accountId}) AS stages,
        (SELECT count(*)::int FROM ws.field_definitions WHERE account_id = ${accountId}) AS fields
    `
    expect(counts.services).toBeGreaterThan(0)
    expect(counts.stages).toBeGreaterThan(0)
    expect(counts.fields).toBeGreaterThan(0)
  })

  it('druhý uživatel se stejným názvem dostane jiný slug a nevidí nic z prvního', async () => {
    const first = await ownedAccountId('user_n1')
    const { accountId: second } = await createAccountWithBusiness({
      name: 'Kadeřnictví U Lenky',
      industry: 'zamecnictvi',
      owner: owner('user_n2'),
    })
    expect(second).not.toBe(first)

    const [biz2] = await wsDb({ accountId: second })`SELECT slug FROM ws.businesses WHERE account_id = ${second}`
    expect(biz2.slug).toMatch(/^kadernictvi-u-lenky-[a-z0-9]{4}$/)

    // I bez aplikačního filtru (jen RLS) vidí každý účet jen sebe.
    for (const [me, other] of [
      [first!, second],
      [second, first!],
    ]) {
      const ws = wsDb({ accountId: me })
      const tables = ['accounts', 'members', 'businesses', 'services', 'stages', 'field_definitions', 'segment_rules']
      for (const table of tables) {
        const rows = await ws.batch([{ text: `SELECT * FROM ws.${table}`, params: [] }])
        const col = table === 'accounts' ? 'id' : 'account_id'
        expect(rows[0].every((r) => r[col] === me), table).toBe(true)
        expect(rows[0].some((r) => r[col] === other), table).toBe(false)
      }
    }
  })

  it('opakované volání pro stejného vlastníka (dvojklik) nic nezdvojí — jeden vlastněný účet na člověka', async () => {
    const before = await ownedAccountId('user_n1')
    const again = await createAccountWithBusiness({
      name: 'Jiný název',
      industry: 'uklid',
      owner: owner('user_n1'),
    })
    expect(again).toEqual({ accountId: before, created: false })
    const rows = await wsDb({ accountId: before! })`SELECT id FROM ws.businesses WHERE account_id = ${before}`
    expect(rows).toHaveLength(1)
  })

  it('requireWorkspace pustí vlastníka do nového účtu jako owner', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_n2', email: 'user_n2@example.cz' }))
    const ctx = await requireWorkspace()
    expect(ctx).toEqual({ userId: 'user_n2', accountId: await ownedAccountId('user_n2'), role: 'owner' })
  })
})

describe('účet bez vlastníka (pozvání z adminu)', () => {
  it('vznikne bez člena a bez organizace Clerku; nikdo do něj nesmí, dokud pozvánku nepřijme', async () => {
    const { accountId } = await createAccountWithBusiness({ name: 'Studna Pozvaná', industry: 'uklid', owner: null })
    const [acc] = await db.query<{ clerk_org_id: string | null }>('SELECT clerk_org_id FROM ws.accounts WHERE id = $1', [accountId]).then((r) => r.rows)
    expect(acc.clerk_org_id).toBeNull()
    expect((await db.query('SELECT 1 FROM ws.members WHERE account_id = $1', [accountId])).rows).toHaveLength(0)
  })
})
