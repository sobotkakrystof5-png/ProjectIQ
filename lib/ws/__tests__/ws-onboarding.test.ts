import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isUniqueViolation, setWsDriverForTests, wsDb, wsSystem } from '../db'
import { requireWorkspace, setWsAuthProvider } from '../context'
import { accountIdForUser, createAccountWithBusiness, slugify } from '../onboarding'
import { createWsTestDb, pgliteDriver } from './helpers/ws-pglite'

// Průvodce /w/novy (databázová část) a pozvánka vlastníka (migrace 100) proti
// PGlite jako ws_app. Účet a roli určuje ws.members (R-080, bez Clerku).

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
    expect(await accountIdForUser('user_n1')).toBe(accountId)

    const ws = wsDb({ accountId })
    const [biz] = await ws`SELECT id, slug, industry FROM ws.businesses WHERE account_id = ${accountId}`
    expect(biz).toMatchObject({ slug: 'kadernictvi-u-lenky', industry: 'kadernictvi-kosmetika' })
    const [member] = await ws`SELECT role, user_id FROM ws.members WHERE account_id = ${accountId}`
    expect(member).toEqual({ role: 'owner', user_id: 'user_n1' })
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
    const first = await accountIdForUser('user_n1')
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

  it('opakované volání pro stejného vlastníka nic nezdvojí (jeden účet na člověka)', async () => {
    const before = await accountIdForUser('user_n1')
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
    setWsAuthProvider(async () => ({ userId: 'user_n2', email: null }))
    const ctx = await requireWorkspace()
    expect(ctx).toEqual({ userId: 'user_n2', accountId: await accountIdForUser('user_n2'), role: 'owner' })
  })
})

// --- Pozvánka vlastníka (ws.redeem_account_invite, migrace 100) --------------

describe('ws.redeem_account_invite', () => {
  let accountId: string
  const hash = (n: number) => String(n).repeat(64).slice(0, 64)

  beforeAll(async () => {
    ;({ accountId } = await createAccountWithBusiness({ name: 'Zámečnictví Pozvánka', industry: 'zamecnictvi', owner: null }))
    // Pozvánky zakládá admin vlastníkem tabulek (mimo RLS, ws_app k nim nemá práva).
    await db.exec(`
      INSERT INTO ws.account_invites (account_id, email, code_hash) VALUES ('${accountId}', 'Klient@Example.cz', '${hash(1)}');
      INSERT INTO ws.account_invites (account_id, email, code_hash, expires_at) VALUES ('${accountId}', 'klient@example.cz', '${hash(2)}', now() - interval '1 day');
      INSERT INTO ws.account_invites (account_id, email, code_hash) VALUES ('${accountId}', 'klient@example.cz', '${hash(3)}');
    `)
  })

  const redeem = async (code: string, user: string, email: string) =>
    (await wsSystem<{ a: string | null }>`SELECT ws.redeem_account_invite(${code}, ${user}, ${email}, ${'Klient'}) AS a`)[0].a

  it('ws_app tabulku pozvánek vůbec nevidí', async () => {
    await expect(wsSystem`SELECT count(*) FROM ws.account_invites`).rejects.toMatchObject({ code: '42501' })
  })

  it('jiný e-mail, prošlá ani neexistující pozvánka nic nedají', async () => {
    expect(await redeem(hash(1), 'user_cizi', 'jiny@example.cz')).toBeNull()
    expect(await redeem(hash(2), 'user_klient', 'klient@example.cz')).toBeNull()
    expect(await redeem(hash(9), 'user_klient', 'klient@example.cz')).toBeNull()
    expect(await accountIdForUser('user_klient')).toBeNull()
  })

  it('platná pozvánka udělá z uživatele vlastníka, podruhé už nefunguje', async () => {
    expect(await redeem(hash(1), 'user_klient', 'klient@example.cz')).toBe(accountId)
    setWsAuthProvider(async () => ({ userId: 'user_klient', email: 'klient@example.cz' }))
    expect(await requireWorkspace()).toEqual({ userId: 'user_klient', accountId, role: 'owner' })
    expect(await redeem(hash(1), 'user_klient2', 'klient@example.cz')).toBeNull()
  })

  it('kdo už vlastní jiný účet, druhý nedostane (jeden účet na člověka)', async () => {
    const e = await redeem(hash(3), 'user_n1', 'klient@example.cz').catch((err: unknown) => err)
    expect(isUniqueViolation(e)).toBe(true)
  })
})
