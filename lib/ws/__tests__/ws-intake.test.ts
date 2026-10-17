import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { fieldValuesSchema, type FieldDefinition } from '../fields'
import {
  ensureIntegration,
  generateSecretKey,
  hashSecret,
  KeyConfigError,
  maskSecret,
  resolvePublicKey,
  resolveSecretKey,
  rotatePublicKey,
  rotateSecretKey,
  secretMatches,
  secretPrefixOf,
  setAllowedOrigins,
} from '../keys'
import { ingestRequest, loadIntakeConfig, loadSlots, type IntakeSource } from '../intake/intake'
import { businessBySlug } from '../intake/http'
import { computeSlots, isSlotFree } from '../intake/slots'
import { pragueToUtc } from '../time'
import { POST as requestsPost, OPTIONS as requestsOptions } from '@/app/api/public/v1/requests/route'
import { GET as schemaGet } from '@/app/api/public/v1/schema/route'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// Příjem poptávek z webů (S11): klíče, cizí doména, rate limit, kolonky,
// idempotence, neaktivní předplatné, oddělení účtů.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }
const bizA = { id: A.business }
const bizB = { id: B.business }
const ORIGIN_A = 'https://a.example.cz'

// Pátek 9. 10. 2026 v poledne; seed má otevřeno jen v pondělí 9–17.
const NOW = new Date('2026-10-09T10:00:00Z')
const MONDAY_9 = pragueToUtc('2026-10-12', 9 * 60)
const MONDAY_10 = pragueToUtc('2026-10-12', 10 * 60)

const srcA = (channel: IntakeSource['channel'] = 'secret'): IntakeSource => ({
  accountId: A.account,
  businessId: A.business,
  integrationId: A.integration,
  channel,
  origin: null,
})

let ipCounter = 0
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`

function post(body: unknown, headers: Record<string, string> = {}, query = ''): Request {
  return new Request(`https://zakaziq.cz/api/public/v1/requests${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: number }>(sql, params)
  return Number(rows[0]?.n ?? 0)
}

beforeAll(async () => {
  process.env.WS_KEY_PEPPER = 'p'.repeat(40)
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  // Povinná volba v kolonkách byznysu A
  await db.query(
    `INSERT INTO ws.field_definitions (account_id, business_id, key, label, type, required, options, position)
     VALUES ($1, $2, 'delka', 'Délka vlasů', 'choice', true, '["Krátké","Dlouhé"]', 1)`,
    [A.account, A.business],
  )
}, 30_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db.close()
})

const valid = (extra: Record<string, unknown> = {}) => ({
  name: 'Tereza Testová',
  phone: '777 123 456',
  fields: { delka: 'Dlouhé', poznamka: 'Bez spěchu' },
  ...extra,
})

describe('klíče', () => {
  it('tajný klíč: tvar, prefix, hash s pepřem a porovnání', () => {
    const { key, prefix, hash } = generateSecretKey()
    expect(key).toMatch(/^sk_live_[A-Za-z0-9]{10}_[A-Za-z0-9]{32}$/)
    expect(secretPrefixOf(key)).toBe(prefix)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(key)
    expect(secretMatches(key, hash)).toBe(true)
    expect(secretMatches(`${key.slice(0, -1)}x`, hash)).toBe(false)
    expect(maskSecret(prefix)).toBe(`sk_live_${prefix.slice(0, 4)}…`)
  })

  it('bez pepře nejde klíč vytvořit ani ověřit', () => {
    const saved = process.env.WS_KEY_PEPPER
    process.env.WS_KEY_PEPPER = ''
    try {
      expect(() => generateSecretKey()).toThrow(KeyConfigError)
      expect(() => hashSecret('sk_live_x')).toThrow(KeyConfigError)
    } finally {
      process.env.WS_KEY_PEPPER = saved
    }
  })

  it('napojení se založí jednou, rotace starý klíč zneplatní', async () => {
    const first = await ensureIntegration(ctxA, bizA)
    const again = await ensureIntegration(ctxA, bizA)
    expect(again.id).toBe(first.id)

    const oldKey = await rotateSecretKey(ctxA, bizA)
    const resolved = await resolveSecretKey(oldKey)
    expect(resolved).toMatchObject({ accountId: A.account, businessId: A.business, integrationId: first.id })
    const { rows } = await db.query<{ secret_hash: string }>('SELECT secret_hash FROM ws.web_integrations WHERE id = $1', [first.id])
    expect(rows[0].secret_hash).not.toContain(oldKey)

    const newKey = await rotateSecretKey(ctxA, bizA)
    expect(await resolveSecretKey(oldKey)).toBeNull()
    expect(await resolveSecretKey(newKey)).not.toBeNull()
    expect(await resolveSecretKey('sk_live_neplatny')).toBeNull()
  })

  it('veřejný klíč najde jen svůj byznys; rotace ho vymění', async () => {
    const a = await ensureIntegration(ctxA, bizA)
    expect(await resolvePublicKey(a.public_key)).toMatchObject({ accountId: A.account, allowedOrigins: [ORIGIN_A] })
    const b = await ensureIntegration(ctxB, bizB)
    expect(await resolvePublicKey(b.public_key)).toMatchObject({ accountId: B.account })
    expect(await resolvePublicKey('pk_live_neexistujiciklic000000')).toBeNull()
  })

  it('účet B nezmění napojení účtu A (RLS + filtr)', async () => {
    const before = await ensureIntegration(ctxA, bizA)
    // Cizí byznys v kontextu B: založení napojení spadne na složeném cizím klíči.
    await expect(setAllowedOrigins(ctxB, bizA, ['https://zlodej.example'])).rejects.toThrow()
    const after = await ensureIntegration(ctxA, bizA)
    expect(after.allowed_origins).toEqual(before.allowed_origins)
  })

  it('veřejný slug vrátí byznys, klíč a domény', async () => {
    const found = await businessBySlug('byznys-a')
    expect(found).toMatchObject({ accountId: A.account, businessId: A.business, allowedOrigins: [ORIGIN_A] })
    expect(found?.publicKey).toMatch(/^pk_/)
    expect(await businessBySlug('neni-tu')).toBeNull()
    expect(await businessBySlug("x' OR 1=1 --")).toBeNull()
  })
})

describe('kolonky', () => {
  const defs: FieldDefinition[] = [
    { key: 'delka', label: 'Délka', type: 'choice', required: true, options: ['A', 'B'] },
    { key: 'km', label: 'Najeto', type: 'number', required: false, options: [] },
    { key: 'kdy', label: 'Kdy', type: 'date', required: false, options: [] },
    { key: 'fotky', label: 'Fotky', type: 'file', required: true, options: [] },
  ]

  it('povinná volba, číslo z textu, neznámé klíče pryč, soubor přes web nevyžaduje', () => {
    const r = fieldValuesSchema(defs).safeParse({ delka: 'A', km: '12 500', navic: 'x' })
    expect(r.success && r.data).toEqual({ delka: 'A', km: 12500 })
  })

  it('chybí povinná, neplatná volba a datum', () => {
    expect(fieldValuesSchema(defs).safeParse({}).success).toBe(false)
    expect(fieldValuesSchema(defs).safeParse({ delka: 'C' }).success).toBe(false)
    expect(fieldValuesSchema(defs).safeParse({ delka: 'A', kdy: '2026-13-45' }).success).toBe(false)
  })
})

describe('volné časy', () => {
  const hours = new Map([[1, [{ opens: 9 * 60, closes: 12 * 60 }]]])
  const base = { now: NOW, durationMin: 60, leadMin: 60, hours, businessBlocks: [] }

  it('obsazený čas pracovníka a blokace byznysu se vynechají', () => {
    const staff = [{ id: 's1', shifts: null, busy: [{ start: MONDAY_9, end: MONDAY_10 }] }]
    const days = computeSlots({ ...base, staff, fromDay: '2026-10-09', days: 7, stepMin: 30 })
    expect(days).toEqual([{ date: '2026-10-12', times: [10 * 60, 10 * 60 + 30, 11 * 60] }])
    const blocked = computeSlots({
      ...base,
      staff,
      businessBlocks: [{ start: pragueToUtc('2026-10-12', 10 * 60), end: pragueToUtc('2026-10-12', 12 * 60) }],
      fromDay: '2026-10-09',
      days: 7,
      stepMin: 30,
    })
    expect(blocked).toEqual([])
  })

  it('dva pracovníci: čas je volný, když má aspoň jeden', () => {
    const staff = [
      { id: 's1', shifts: null, busy: [{ start: MONDAY_9, end: MONDAY_10 }] },
      { id: 's2', shifts: null, busy: [] },
    ]
    expect(isSlotFree({ ...base, staff }, MONDAY_9)).toBe(true)
    expect(isSlotFree({ ...base, staff: [staff[0]] }, MONDAY_9)).toBe(false)
    // mimo otevírací dobu a příliš brzy
    expect(isSlotFree({ ...base, staff }, pragueToUtc('2026-10-12', 11 * 60 + 30))).toBe(false)
    expect(isSlotFree({ ...base, staff, now: new Date(MONDAY_9.getTime() - 30 * 60_000) }, MONDAY_9)).toBe(false)
  })
})

describe('ingestRequest', () => {
  beforeEach(async () => {
    await db.query(`UPDATE ws.subscriptions SET status = 'trialing' WHERE account_id = $1`, [A.account])
  })

  it('platná poptávka: 202, zákazník podle telefonu, upozornění, záznam', async () => {
    const res = await ingestRequest(srcA(), valid({ email: 'Tereza@Example.cz', message: 'Ahoj' }), { now: NOW })
    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ success: true })
    const id = res.body.success ? res.body.id : ''
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT r.source, r.is_test, r.field_values, r.contact, c.phone, c.email FROM ws.requests r
       JOIN ws.customers c ON c.id = r.customer_id WHERE r.id = $1`,
      [id],
    )
    expect(rows[0]).toMatchObject({
      source: 'web',
      is_test: false,
      phone: '+420777123456',
      email: 'tereza@example.cz',
      field_values: { delka: 'Dlouhé', poznamka: 'Bez spěchu' },
    })
    expect(await count(`SELECT count(*)::int AS n FROM ws.notifications WHERE account_id = $1 AND link LIKE $2`, [A.account, `%${id}`])).toBe(1)
    expect(await count(`SELECT count(*)::int AS n FROM ws.intake_log WHERE request_id = $1 AND status = 202`, [id])).toBe(1)
  })

  it('zkušební poptávka: is_test, bez zákazníka a bez upozornění', async () => {
    const before = await count(`SELECT count(*)::int AS n FROM ws.customers WHERE account_id = $1`, [A.account])
    const res = await ingestRequest(srcA('check'), valid({ phone: '777 000 999', test: true }), { now: NOW })
    expect(res.body).toMatchObject({ success: true, test: true })
    const id = res.body.success ? res.body.id : ''
    expect(await count(`SELECT count(*)::int AS n FROM ws.requests WHERE id = $1 AND is_test AND customer_id IS NULL`, [id])).toBe(1)
    expect(await count(`SELECT count(*)::int AS n FROM ws.customers WHERE account_id = $1`, [A.account])).toBe(before)
    expect(await count(`SELECT count(*)::int AS n FROM ws.notifications WHERE link LIKE $1`, [`%${id}`])).toBe(0)
  })

  it('kolonky a kontakt: srozumitelná chyba s polem', async () => {
    const missing = await ingestRequest(srcA(), valid({ fields: {} }), { now: NOW })
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' })
    expect(!missing.body.success && missing.body.issues?.[0]).toMatchObject({ field: 'fields.delka' })

    const noContact = await ingestRequest(srcA(), { name: 'Bez kontaktu', fields: { delka: 'Krátké' } }, { now: NOW })
    expect(!noContact.body.success && noContact.body.error).toMatch(/telefon nebo e-mail/)

    const badPhone = await ingestRequest(srcA(), valid({ phone: 'abc' }), { now: NOW })
    expect(!badPhone.body.success && badPhone.body.issues?.[0].field).toBe('phone')
  })

  it('služba z cizího účtu neprojde', async () => {
    const res = await ingestRequest(srcA(), valid({ serviceId: B.service }), { now: NOW })
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' })
  })

  it('obsazený čas = SLOT_TAKEN, volný projde', async () => {
    await db.query(
      `INSERT INTO ws.appointments (account_id, business_id, staff_id, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5)`,
      [A.account, A.business, A.staff, MONDAY_9, MONDAY_10],
    )
    const taken = await ingestRequest(srcA(), valid({ serviceId: A.service, start: MONDAY_9.toISOString() }), { now: NOW })
    expect(taken.status).toBe(409)
    expect(taken.body).toMatchObject({ code: 'SLOT_TAKEN' })
    const free = await ingestRequest(srcA(), valid({ serviceId: A.service, start: MONDAY_10.toISOString() }), { now: NOW })
    expect(free.status).toBe(202)
    const past = await ingestRequest(srcA(), valid({ start: '2026-10-01T09:00:00+02:00' }), { now: NOW })
    expect(past.body).toMatchObject({ code: 'VALIDATION_ERROR' })

    const config = await loadIntakeConfig(A.account, A.business)
    expect(config?.booking).toBe('slots')
    const slots = await loadSlots(A.account, config!, A.service, NOW)
    expect(slots[0]).toMatchObject({ date: '2026-10-12' })
    expect(slots[0].times).not.toContain(9 * 60)
  })

  it('bez otevírací doby si zákazník čas navrhne sám', async () => {
    const config = await loadIntakeConfig(B.account, B.business)
    expect(config?.booking).toBe('slots')
    await db.query(`DELETE FROM ws.opening_hours WHERE account_id = $1`, [B.account])
    expect((await loadIntakeConfig(B.account, B.business))?.booking).toBe('free')
  })

  it('idempotence: stejný klíč = stejná poptávka, jiné tělo = chyba', async () => {
    const body = valid({ phone: '777 555 111' })
    const first = await ingestRequest(srcA(), body, { now: NOW, idempotencyKey: 'obj-1' })
    const second = await ingestRequest(srcA(), body, { now: NOW, idempotencyKey: 'obj-1' })
    expect(second.replayed).toBe(true)
    expect(second.body).toEqual(first.body)
    const other = await ingestRequest(srcA(), valid({ phone: '777 555 222' }), { now: NOW, idempotencyKey: 'obj-1' })
    expect(other.status).toBe(422)
    expect(await count(`SELECT count(*)::int AS n FROM ws.customers WHERE phone = '+420777555111'`)).toBe(1)
  })

  it('externalId: e-shop pošle objednávku dvakrát = jedna poptávka', async () => {
    const first = await ingestRequest(srcA(), valid({ externalId: 'eshop-42', source: 'eshop' }), { now: NOW })
    const again = await ingestRequest(srcA(), valid({ externalId: 'eshop-42', source: 'eshop' }), { now: NOW })
    expect(first.status).toBe(202)
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ success: true, duplicate: true, id: first.body.success ? first.body.id : 'x' })
  })

  it('neaktivní předplatné: uloží se, vrátí upozornění', async () => {
    await db.query(`UPDATE ws.subscriptions SET status = 'canceled' WHERE account_id = $1`, [A.account])
    const res = await ingestRequest(srcA(), valid({ phone: '777 999 000' }), { now: NOW })
    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ success: true, notice: { code: 'SUBSCRIPTION_INACTIVE' } })
    const id = res.body.success ? res.body.id : ''
    expect(await count(`SELECT count(*)::int AS n FROM ws.requests WHERE id = $1`, [id])).toBe(1)
  })

  it('robot vyplnil skryté pole: tváří se jako úspěch, nic se neuloží', async () => {
    const before = await count(`SELECT count(*)::int AS n FROM ws.requests WHERE account_id = $1`, [A.account])
    const res = await ingestRequest(srcA('page'), valid({ website: 'http://spam' }), { now: NOW })
    expect(res.body).toMatchObject({ success: true })
    expect(await count(`SELECT count(*)::int AS n FROM ws.requests WHERE account_id = $1`, [A.account])).toBe(before)
  })
})

describe('POST /api/public/v1/requests', () => {
  let secret = ''
  let publicKey = ''

  beforeAll(async () => {
    secret = await rotateSecretKey(ctxA, bizA)
    publicKey = (await ensureIntegration(ctxA, bizA)).public_key
  })

  it('tajný klíč ze serveru: 202, bez CORS', async () => {
    const res = await requestsPost(post(valid({ phone: '777 100 200' }), { authorization: `Bearer ${secret}` }))
    expect(res.status).toBe(202)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(await res.json()).toMatchObject({ success: true })
  })

  it('neplatný klíč, chybějící klíč a tajný klíč z prohlížeče = 401', async () => {
    const bad = await requestsPost(post(valid(), { authorization: `Bearer ${['sk', 'live', 'A'.repeat(10), 'B'.repeat(32)].join('_')}` }))
    expect(bad.status).toBe(401)
    expect(await bad.json()).toMatchObject({ success: false, code: 'UNAUTHORIZED' })
    expect((await requestsPost(post(valid()))).status).toBe(401)
    const browser = await requestsPost(post(valid(), { authorization: `Bearer ${secret}`, origin: ORIGIN_A }))
    expect(browser.status).toBe(401)
  })

  it('veřejný klíč: povolená doména projde s CORS, cizí ne', async () => {
    const ok = await requestsPost(post(valid({ phone: '777 300 400' }), { origin: ORIGIN_A }, `?key=${publicKey}`))
    expect(ok.status).toBe(202)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN_A)
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull()
    const { rows } = await db.query<{ source: string }>(
      `SELECT source FROM ws.requests WHERE contact->>'phone' = '+420777300400'`,
    )
    expect(rows[0].source).toBe('widget')

    const foreign = await requestsPost(post(valid(), { origin: 'https://cizi.example' }, `?key=${publicKey}`))
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
    const noOrigin = await requestsPost(post(valid(), {}, `?key=${publicKey}`))
    expect(noOrigin.status).toBe(403)

    const pre = await requestsOptions(
      new Request(`https://zakaziq.cz/api/public/v1/requests?key=${publicKey}`, { method: 'OPTIONS', headers: { origin: ORIGIN_A } }),
    )
    expect(pre.status).toBe(204)
    const preForeign = await requestsOptions(
      new Request(`https://zakaziq.cz/api/public/v1/requests?key=${publicKey}`, { method: 'OPTIONS', headers: { origin: 'https://cizi.example' } }),
    )
    expect(preForeign.status).toBe(403)
  })

  it('rate limit z jedné IP = 429', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.9' }
    let last = 0
    for (let i = 0; i < 21; i++) last = (await requestsPost(post({}, { ...ip, authorization: `Bearer ${secret}` }))).status
    expect(last).toBe(429)
    const { rows } = await db.query<{ key: string }>(`SELECT key FROM ws.rate_limits WHERE key LIKE 'req-ip:%' LIMIT 50`)
    expect(rows.every((r) => !r.key.includes('203.0.113.9'))).toBe(true)
  })

  it('velké tělo a neplatný JSON', async () => {
    const big = await requestsPost(post({ name: 'x'.repeat(70_000) }, { authorization: `Bearer ${secret}` }))
    expect(big.status).toBe(413)
    const broken = await requestsPost(post('{nejde', { authorization: `Bearer ${secret}` }))
    expect(broken.status).toBe(400)
    expect(await broken.json()).toMatchObject({ code: 'INVALID_BODY' })
  })

  it('tajný klíč se neukládá ani do záznamu, ani do poptávky', async () => {
    const { rows } = await db.query<{ t: string }>(
      `SELECT (SELECT string_agg(row_to_json(l)::text, '') FROM ws.intake_log l) ||
              (SELECT string_agg(row_to_json(r)::text, '') FROM ws.requests r) AS t`,
    )
    expect(rows[0].t).not.toContain(secret)
  })

  it('GET schema: služby, kolonky a volné časy; cizí doména ne', async () => {
    const res = await schemaGet(
      new Request(`https://zakaziq.cz/api/public/v1/schema?key=${publicKey}`, {
        headers: { origin: ORIGIN_A, 'x-forwarded-for': nextIp() },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, version: 1, business: { slug: 'byznys-a' }, booking: { mode: 'slots' } })
    expect(body.fields.map((f: { key: string }) => f.key)).toEqual(['poznamka', 'delka'])
    expect(JSON.stringify(body)).not.toContain('zakaznik@example.cz')
    const foreign = await schemaGet(
      new Request(`https://zakaziq.cz/api/public/v1/schema?key=${publicKey}`, {
        headers: { origin: 'https://cizi.example', 'x-forwarded-for': nextIp() },
      }),
    )
    expect(foreign.status).toBe(403)
  })

  it('rotace veřejného klíče: starý přestane platit', async () => {
    const fresh = await rotatePublicKey(ctxA, bizA)
    const old = await requestsPost(post(valid(), { origin: ORIGIN_A }, `?key=${publicKey}`))
    expect(old.status).toBe(401)
    publicKey = fresh
  })
})

describe('widget /embed/[slug].js', () => {
  it('skript je platný JS, malý a data jsou escapovaná', async () => {
    const { widgetScript } = await import('../intake/widget-script')
    const { gzipSync } = await import('zlib')
    const src = widgetScript({
      apiOrigin: 'https://zakaziq.cz',
      publicKey: 'pk_live_ABCDEFGHIJKLMNOPQRSTUVWX',
      businessName: 'Salon </script><img src=x onerror=alert(1)> ',
      accent: '#23478b',
    })
    expect(() => new Function(src)).not.toThrow()
    expect(src).not.toContain('</script>')
    expect(src).not.toContain('<img')
    expect(gzipSync(src).length).toBeLessThan(15 * 1024)
    // Data z nastavení jen přes textContent, innerHTML se nepoužívá vůbec.
    expect(src).not.toMatch(/innerHTML/)
  })

  it('route: známý slug vrátí skript s veřejným klíčem, neznámý 404', async () => {
    const { GET } = await import('@/app/embed/[file]/route')
    const { public_key } = await ensureIntegration(ctxA, bizA)
    const res = await GET(new Request('https://zakaziq.cz/embed/byznys-a.js'), { params: Promise.resolve({ file: 'byznys-a.js' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    const body = await res.text()
    expect(body).toContain(public_key)
    expect(body).not.toMatch(/sk_live_/)
    const none = await GET(new Request('https://zakaziq.cz/embed/neni.js'), { params: Promise.resolve({ file: 'neni.js' }) })
    expect(none.status).toBe(404)
    const bad = await GET(new Request('https://zakaziq.cz/embed/x'), { params: Promise.resolve({ file: '../x' }) })
    expect(bad.status).toBe(404)
  })
})

describe('frame-ancestors a barva', () => {
  it('slug z cesty /r/<slug> a povolené domény z DB', async () => {
    const { embedOriginsForSlug, orderSlugFromPath } = await import('../intake/embed-origins')
    expect(orderSlugFromPath('/r/byznys-a')).toBe('byznys-a')
    expect(orderSlugFromPath('/r/byznys-a/neco')).toBe('byznys-a')
    expect(orderSlugFromPath('/r/%3Cx%3E')).toBeNull()
    expect(orderSlugFromPath('/rx/a')).toBeNull()
    expect(await embedOriginsForSlug('byznys-a')).toEqual([ORIGIN_A])
    expect(await embedOriginsForSlug('neni-tu')).toEqual([])
  })

  it('akcent jen s čitelným bílým textem', async () => {
    const { accentVars, usableAccent } = await import('../accent')
    expect(usableAccent('#23478b')).toBe('#23478b')
    expect(usableAccent('#ffd28a')).toBeNull()
    expect(usableAccent('red')).toBeNull()
    expect(accentVars('#23478b')).toMatchObject({ '--navy-700': '35 71 139' })
    expect(accentVars(null)).toBeUndefined()
  })
})

describe('prompt pro Claude Code', () => {
  it('obsahuje API, ZAKAZIQ_KEY a kolonky, nikdy klíč', async () => {
    const { buildClaudePrompt } = await import('../intake/claude-prompt')
    const { buildPublicSchema } = await import('../intake/schema')
    const config = await loadIntakeConfig(A.account, A.business)
    const prompt = buildClaudePrompt({ apiOrigin: 'https://zakaziq.cz', schema: buildPublicSchema(config!, []) })
    expect(prompt).toContain('https://zakaziq.cz/api/public/v1/requests')
    expect(prompt).toContain('ZAKAZIQ_KEY')
    expect(prompt).toContain('"delka"')
    expect(prompt).not.toMatch(/sk_live_[A-Za-z0-9]{10}_/)
    expect(prompt).not.toMatch(/pk_/)
  })
})
