import { createHmac, randomBytes } from 'crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { WebhookEvent } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setWsDriverForTests, wsDb } from '../db'
import { requireWorkspace, setWsAuthProvider } from '../context'
import { accountIdForOrg, createAccountWithBusiness, slugify } from '../onboarding'
import { handleClerkEvent } from '../clerk-webhook'
import { POST as clerkWebhookPost } from '@/app/api/clerk/webhook/route'
import { createWsTestDb, pgliteDriver } from './helpers/ws-pglite'

// Průvodce /w/novy (databázová část) a webhook Clerku proti PGlite jako ws_app.

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
      orgId: 'org_rezervovany',
      name: 'Nový',
      industry: 'uklid',
      owner: owner('user_rez'),
    })
    const [biz] = await wsDb({ accountId })`SELECT slug FROM ws.businesses WHERE account_id = ${accountId}`
    expect(biz.slug).toMatch(/^novy-[a-z2-9]{4}$/)
  })


  it('založí účet, vlastníka, byznys a šablonu oboru v jedné transakci', async () => {
    const { accountId, created } = await createAccountWithBusiness({
      orgId: 'org_novy_1',
      name: 'Kadeřnictví U Lenky',
      industry: 'kadernictvi-kosmetika',
      owner: owner('user_n1'),
    })
    expect(created).toBe(true)
    expect(await accountIdForOrg('org_novy_1')).toBe(accountId)

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
    const first = await accountIdForOrg('org_novy_1')
    const { accountId: second } = await createAccountWithBusiness({
      orgId: 'org_novy_2',
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

  it('opakované volání pro stejnou organizaci nic nezdvojí', async () => {
    const before = await accountIdForOrg('org_novy_1')
    const again = await createAccountWithBusiness({
      orgId: 'org_novy_1',
      name: 'Jiný název',
      industry: 'uklid',
      owner: owner('user_n1'),
    })
    expect(again).toEqual({ accountId: before, created: false })
    const rows = await wsDb({ accountId: before! })`SELECT id FROM ws.businesses WHERE account_id = ${before}`
    expect(rows).toHaveLength(1)
  })

  it('requireWorkspace pustí vlastníka do nového účtu jako owner', async () => {
    setWsAuthProvider(async () => ({ userId: 'user_n2', orgId: 'org_novy_2', orgRole: 'org:admin' }))
    const ctx = await requireWorkspace()
    expect(ctx).toEqual({ userId: 'user_n2', accountId: await accountIdForOrg('org_novy_2'), role: 'owner' })
  })
})

// --- Webhook Clerku ---------------------------------------------------------

const membership = (type: string, orgId: string, userId: string, role = 'org:member') =>
  ({
    type,
    object: 'event',
    data: {
      role,
      organization: { id: orgId, name: 'Org' },
      public_user_data: { user_id: userId, identifier: `${userId}@example.cz`, first_name: 'Petr', last_name: 'Malý' },
    },
  }) as unknown as WebhookEvent

const members = async (orgId: string) => {
  const accountId = (await accountIdForOrg(orgId))!
  return wsDb({ accountId })<{ clerk_user_id: string; role: string; name: string | null }>`
    SELECT clerk_user_id, role, name FROM ws.members WHERE account_id = ${accountId} ORDER BY clerk_user_id
  `
}

describe('handleClerkEvent', () => {
  it('nový člen organizace se zapíše, změna role se promítne, odebraný zmizí', async () => {
    expect(await handleClerkEvent(membership('organizationMembership.created', 'org_novy_1', 'user_p'), 'msg_1')).toBe(
      'processed',
    )
    expect(await members('org_novy_1')).toEqual([
      { clerk_user_id: 'user_n1', role: 'owner', name: 'Lenka Nováková' },
      { clerk_user_id: 'user_p', role: 'staff', name: 'Petr Malý' },
    ])

    await handleClerkEvent(membership('organizationMembership.updated', 'org_novy_1', 'user_p', 'org:admin'), 'msg_2')
    expect((await members('org_novy_1'))[1].role).toBe('owner')

    await handleClerkEvent(membership('organizationMembership.deleted', 'org_novy_1', 'user_p'), 'msg_3')
    expect((await members('org_novy_1')).map((m) => m.clerk_user_id)).toEqual(['user_n1'])
  })

  it('stejná událost podruhé nic neudělá', async () => {
    const evt = membership('organizationMembership.created', 'org_novy_2', 'user_q')
    expect(await handleClerkEvent(evt, 'msg_dup')).toBe('processed')
    expect(await handleClerkEvent(evt, 'msg_dup')).toBe('duplicate')
    expect((await members('org_novy_2')).filter((m) => m.clerk_user_id === 'user_q')).toHaveLength(1)
  })

  it('organizace bez účtu se přeskočí, přejmenování se propíše jen do svého účtu', async () => {
    expect(await handleClerkEvent(membership('organizationMembership.created', 'org_bez_uctu', 'user_x'), 'msg_4')).toBe(
      'ignored',
    )
    const rename = { type: 'organization.updated', data: { id: 'org_novy_2', name: 'Zámečnictví Nové jméno' } }
    expect(await handleClerkEvent(rename as unknown as WebhookEvent, 'msg_5')).toBe('processed')
    const id1 = (await accountIdForOrg('org_novy_1'))!
    const id2 = (await accountIdForOrg('org_novy_2'))!
    const [a1] = await wsDb({ accountId: id1 })`SELECT name FROM ws.accounts WHERE id = ${id1}`
    const [a2] = await wsDb({ accountId: id2 })`SELECT name FROM ws.accounts WHERE id = ${id2}`
    expect(a1.name).toBe('Kadeřnictví U Lenky')
    expect(a2.name).toBe('Zámečnictví Nové jméno')
  })

  it('smazání organizace data účtu nemaže', async () => {
    const evt = { type: 'organization.deleted', data: { id: 'org_novy_2', deleted: true } }
    expect(await handleClerkEvent(evt as unknown as WebhookEvent, 'msg_6')).toBe('ignored')
    expect(await accountIdForOrg('org_novy_2')).not.toBeNull()
  })
})

// --- Route /api/clerk/webhook (podpis Svix) ---------------------------------

const SECRET_BYTES = randomBytes(24)
const SIGNING_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`

function signedRequest(body: string, opts: { id?: string; secret?: Buffer; ageSeconds?: number } = {}): NextRequest {
  const id = opts.id ?? `msg_${randomBytes(6).toString('hex')}`
  const timestamp = String(Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0))
  const signature = createHmac('sha256', opts.secret ?? SECRET_BYTES)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')
  return new NextRequest('http://localhost/api/clerk/webhook', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  })
}

describe('POST /api/clerk/webhook', () => {
  const body = JSON.stringify({
    type: 'organizationMembership.created',
    object: 'event',
    data: {
      role: 'org:member',
      organization: { id: 'org_novy_1', name: 'Org' },
      public_user_data: { user_id: 'user_route', identifier: 'route@example.cz', first_name: null, last_name: null },
    },
  })

  it('bez nastaveného klíče odmítne všechno', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET
    expect((await clerkWebhookPost(signedRequest(body))).status).toBe(503)
  })

  it('neplatný podpis, cizí klíč nebo staré razítko → 400, nic se nezapíše', async () => {
    process.env.CLERK_WEBHOOK_SECRET = SIGNING_SECRET
    const forged = signedRequest(body)
    forged.headers.set('svix-signature', 'v1,AAAA')
    expect((await clerkWebhookPost(forged)).status).toBe(400)
    expect((await clerkWebhookPost(signedRequest(body, { secret: randomBytes(24) }))).status).toBe(400)
    expect((await clerkWebhookPost(signedRequest(body, { ageSeconds: 60 * 60 }))).status).toBe(400)
    expect((await members('org_novy_1')).some((m) => m.clerk_user_id === 'user_route')).toBe(false)
  })

  it('platný podpis → zpracováno', async () => {
    process.env.CLERK_WEBHOOK_SECRET = SIGNING_SECRET
    const res = await clerkWebhookPost(signedRequest(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, result: 'processed' })
    expect((await members('org_novy_1')).some((m) => m.clerk_user_id === 'user_route')).toBe(true)
    delete process.env.CLERK_WEBHOOK_SECRET
  })
})
