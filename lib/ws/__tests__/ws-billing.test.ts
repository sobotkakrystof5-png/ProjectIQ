import type { PGlite } from '@electric-sql/pglite'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { setWsDriverForTests, wsDb } from '../db'
import { createAccountWithBusiness } from '../onboarding'
import { setStripeForTests } from '../stripe'
import {
  assertWritable,
  billingStateFrom,
  createCheckoutSession,
  getBillingState,
  GRACE_DAYS,
  READ_ONLY_MESSAGE,
  syncCheckoutSession,
  type SubscriptionRow,
} from '../billing'
import { handleStripeEvent } from '../stripe-webhook'
import { POST as stripeWebhookPost } from '@/app/api/stripe/webhook/route'
import { createWsTestDb, pgliteDriver } from './helpers/ws-pglite'

// Předplatné (S08): stav přístupu, webhook Stripe proti PGlite jako ws_app
// a podpis route. Stripe API je podstrčené — testuje se naše logika, ne Stripe.

const DAY = 24 * 60 * 60 * 1000
const WEBHOOK_SECRET = 'whsec_test_zakaziq'

let db: PGlite
let A: string
let B: string

// --- Podstrčené Stripe API ----------------------------------------------------

type FakeSub = {
  id: string
  status: string
  customer: string
  metadata: Record<string, string>
  cancel_at_period_end: boolean
  cancel_at: number | null
  items: { data: { current_period_end: number; price: { id: string } }[] }
}

const subs = new Map<string, FakeSub>()
const customers = new Map<string, { id: string; metadata: Record<string, string> }>()
const sessions = new Map<string, { id: string; client_reference_id: string | null; subscription: string | null }>()
const retrieveSub = vi.fn(async (id: string) => {
  const s = subs.get(id)
  if (!s) throw new Error(`no such subscription ${id}`)
  return structuredClone(s)
})

const createCustomer = vi.fn(async (_params: Record<string, unknown>, _opts: Record<string, unknown>) => ({ id: 'cus_new_c' }))
const createSession = vi.fn(async (_params: Record<string, unknown>) => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_c' }))

const realWebhooks = new Stripe('sk_test_dummy').webhooks
const fakeStripe = {
  subscriptions: { retrieve: retrieveSub },
  customers: { retrieve: async (id: string) => customers.get(id) ?? { id, deleted: true }, create: createCustomer },
  checkout: { sessions: { retrieve: async (id: string) => sessions.get(id), create: createSession } },
  webhooks: realWebhooks,
} as unknown as Stripe

const unix = (d: Date) => Math.floor(d.getTime() / 1000)

function putSub(id: string, accountId: string | null, status: string, extra: Partial<FakeSub> = {}): FakeSub {
  const sub: FakeSub = {
    id,
    status,
    customer: `cus_${id}`,
    metadata: accountId ? { account_id: accountId } : {},
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: unix(new Date(Date.now() + 14 * DAY)), price: { id: 'price_test_249' } }] },
    ...extra,
  }
  subs.set(id, sub)
  return sub
}

let eventSeq = 0
function evt(type: string, object: Record<string, unknown>, id = `evt_test_${++eventSeq}`): Stripe.Event {
  return { id, type, object: 'event', data: { object } } as unknown as Stripe.Event
}
const subEvent = (type: string, subId: string, id?: string) => evt(type, { id: subId, object: 'subscription' }, id)

const rowsOf = (accountId: string) =>
  wsDb({ accountId })<{ stripe_subscription_id: string; status: string; past_due_since: Date | null; cancel_at_period_end: boolean }>`
    SELECT stripe_subscription_id, status, past_due_since, cancel_at_period_end
    FROM ws.subscriptions WHERE account_id = ${accountId} ORDER BY created_at
  `

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  setStripeForTests(fakeStripe)
  const owner = (userId: string) => ({ userId, name: null, email: `${userId}@example.cz` })
  ;({ accountId: A } = await createAccountWithBusiness({
    orgId: 'org_bill_a',
    name: 'Zámečnictví Novák',
    industry: 'zamecnictvi',
    owner: owner('user_bill_a'),
  }))
  ;({ accountId: B } = await createAccountWithBusiness({
    orgId: 'org_bill_b',
    name: 'Úklid Svoboda',
    industry: 'uklid',
    owner: owner('user_bill_b'),
  }))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setStripeForTests(null)
  await db?.close()
})

beforeEach(() => {
  retrieveSub.mockClear()
})

// --- Stav přístupu -------------------------------------------------------------

describe('billingStateFrom', () => {
  const now = new Date('2026-10-20T10:00:00Z')
  const row = (status: SubscriptionRow['status'], extra: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
    status,
    current_period_end: new Date('2026-11-01T00:00:00Z'),
    cancel_at_period_end: false,
    past_due_since: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    ...extra,
  })

  it('bez předplatného = none, zkušební doba se ještě nedávala', () => {
    expect(billingStateFrom([], now)).toMatchObject({ access: 'none', hadSubscription: false, status: null })
  })

  it('nedokončený Checkout je pořád none', () => {
    expect(billingStateFrom([row('incomplete')], now).access).toBe('none')
    expect(billingStateFrom([row('incomplete_expired')], now)).toMatchObject({ access: 'none', hadSubscription: false })
  })

  it('zkušební doba a aktivní předplatné smí všechno', () => {
    expect(billingStateFrom([row('trialing')], now)).toMatchObject({ access: 'trialing', hadSubscription: true })
    expect(billingStateFrom([row('active')], now).access).toBe('active')
  })

  it(`po neúspěšné platbě ${GRACE_DAYS} dní lhůta, pak jen čtení`, () => {
    const day = (n: number) => new Date(now.getTime() - n * DAY)
    const fresh = billingStateFrom([row('past_due', { past_due_since: day(2) })], now)
    expect(fresh.access).toBe('grace')
    expect(fresh.graceEndsAt).toEqual(new Date(day(2).getTime() + GRACE_DAYS * DAY))
    expect(billingStateFrom([row('past_due', { past_due_since: day(GRACE_DAYS) })], now).access).toBe('read_only')
    expect(billingStateFrom([row('past_due', { past_due_since: day(30) })], now).access).toBe('read_only')
    // Chybí-li datum (nemělo by), počítá se od teď = lhůta.
    expect(billingStateFrom([row('past_due')], now).access).toBe('grace')
  })

  it('zrušené, nezaplacené a pozastavené = jen čtení', () => {
    for (const s of ['canceled', 'unpaid', 'paused'] as const) {
      expect(billingStateFrom([row(s)], now)).toMatchObject({ access: 'read_only', hadSubscription: true })
    }
  })

  it('platné předplatné má přednost před starším zrušeným', () => {
    const old = row('canceled', { created_at: new Date('2026-01-01T00:00:00Z') })
    const renewed = row('active', { created_at: new Date('2026-02-01T00:00:00Z') })
    expect(billingStateFrom([old, renewed], now).access).toBe('active')
    expect(billingStateFrom([renewed, old], now).access).toBe('active')
  })
})

// --- Webhook --------------------------------------------------------------------

describe('handleStripeEvent', () => {
  it('Checkout dokončen → zkušební doba jen u svého účtu, zákazník Stripe uložený', async () => {
    expect((await getBillingState(A)).access).toBe('none')
    putSub('sub_a1', A, 'trialing')
    const res = await handleStripeEvent(
      evt('checkout.session.completed', { id: 'cs_test_a1', mode: 'subscription', subscription: 'sub_a1' }),
    )
    expect(res).toBe('processed')
    expect((await getBillingState(A)).access).toBe('trialing')
    expect((await getBillingState(B)).access).toBe('none')
    const [acc] = await wsDb({ accountId: A })`SELECT stripe_customer_id FROM ws.accounts WHERE id = ${A}`
    expect(acc.stripe_customer_id).toBe('cus_sub_a1')
  })

  it('stejná událost podruhé = duplicate, Stripe se znovu nevolá', async () => {
    putSub('sub_a1', A, 'active')
    const e = subEvent('customer.subscription.updated', 'sub_a1', 'evt_test_dup')
    expect(await handleStripeEvent(e)).toBe('processed')
    expect(await handleStripeEvent(e)).toBe('duplicate')
    expect(retrieveSub).toHaveBeenCalledTimes(1)
    const [ev] = await db.query<{ account_id: string; processed_at: Date | null }>(
      `SELECT account_id, processed_at FROM ws.stripe_events WHERE id = 'evt_test_dup'`,
    )
      .then((r) => r.rows)
    expect(ev.account_id).toBe(A)
    expect(ev.processed_at).not.toBeNull()
  })

  it('platba selže → lhůta; datum selhání drží i přes další události; po lhůtě jen čtení', async () => {
    putSub('sub_a1', A, 'past_due')
    await handleStripeEvent(
      evt('invoice.payment_failed', { id: 'in_1', parent: { subscription_details: { subscription: 'sub_a1' } } }),
    )
    const [first] = await rowsOf(A)
    expect(first.status).toBe('past_due')
    expect(first.past_due_since).not.toBeNull()
    expect((await getBillingState(A)).access).toBe('grace')

    // Posuneme datum selhání do minulosti a pošleme další aktualizaci — datum se nesmí přepsat.
    await wsDb({ accountId: A })`
      UPDATE ws.subscriptions SET past_due_since = now() - interval '8 days' WHERE account_id = ${A}
    `
    await handleStripeEvent(subEvent('customer.subscription.updated', 'sub_a1'))
    expect((await getBillingState(A)).access).toBe('read_only')
    expect(await assertWritable({ userId: 'user_bill_a', accountId: A, role: 'owner' })).toEqual({
      ok: false,
      error: READ_ONLY_MESSAGE,
    })
  })

  it('zaplaceno → zase aktivní a datum selhání smazané', async () => {
    putSub('sub_a1', A, 'active')
    await handleStripeEvent(evt('invoice.paid', { id: 'in_2', parent: { subscription_details: { subscription: 'sub_a1' } } }))
    const [row] = await rowsOf(A)
    expect(row).toMatchObject({ status: 'active', past_due_since: null })
    expect(await assertWritable({ userId: 'user_bill_a', accountId: A, role: 'owner' })).toBeNull()
  })

  it('zrušení v Portalu ke konci období, pak smazání → jen čtení, data zůstanou', async () => {
    putSub('sub_a1', A, 'active', { cancel_at_period_end: true })
    await handleStripeEvent(subEvent('customer.subscription.updated', 'sub_a1'))
    expect(await getBillingState(A)).toMatchObject({ access: 'active', cancelAtPeriodEnd: true })

    putSub('sub_a1', A, 'canceled')
    await handleStripeEvent(subEvent('customer.subscription.deleted', 'sub_a1'))
    expect((await getBillingState(A)).access).toBe('read_only')
    const [biz] = await wsDb({ accountId: A })<{ n: number }>`
      SELECT count(*)::int AS n FROM ws.businesses WHERE account_id = ${A}
    `
    expect(biz.n).toBe(1)
  })

  it('obnovené předplatné po zrušení = nový řádek, platí to nové', async () => {
    putSub('sub_a2', A, 'active')
    await handleStripeEvent(subEvent('customer.subscription.created', 'sub_a2'))
    expect((await rowsOf(A)).map((r) => r.status)).toEqual(['canceled', 'active'])
    expect(await getBillingState(A)).toMatchObject({ access: 'active', hadSubscription: true })
  })

  it('účet bez metadat předplatného se dohledá přes zákazníka', async () => {
    customers.set('cus_sub_b1', { id: 'cus_sub_b1', metadata: { account_id: B } })
    putSub('sub_b1', null, 'trialing')
    expect(await handleStripeEvent(subEvent('customer.subscription.created', 'sub_b1'))).toBe('processed')
    expect((await getBillingState(B)).access).toBe('trialing')
  })

  it('neznámý účet nebo událost mimo předplatné se přeskočí', async () => {
    putSub('sub_x', '00000000-0000-4000-8000-000000000000', 'active')
    expect(await handleStripeEvent(subEvent('customer.subscription.created', 'sub_x'))).toBe('ignored')
    putSub('sub_y', null, 'active')
    expect(await handleStripeEvent(subEvent('customer.subscription.created', 'sub_y'))).toBe('ignored')
    expect(await handleStripeEvent(evt('checkout.session.completed', { id: 'cs_pay', mode: 'payment' }))).toBe('ignored')
    expect(await handleStripeEvent(evt('charge.succeeded', { id: 'ch_1' }))).toBe('ignored')
  })

  it('předplatné účtu A nejde metadaty převést na účet B', async () => {
    putSub('sub_a2', B, 'trialing')
    await handleStripeEvent(subEvent('customer.subscription.updated', 'sub_a2')).catch(() => 'rls')
    expect((await rowsOf(A)).find((r) => r.stripe_subscription_id === 'sub_a2')?.status).toBe('active')
    expect((await rowsOf(B)).some((r) => r.stripe_subscription_id === 'sub_a2')).toBe(false)
  })
})

describe('syncCheckoutSession (návrat z Checkoutu)', () => {
  it('relace cizího účtu ani nesmyslné ID nic neudělají', async () => {
    sessions.set('cs_test_bbbbbbbbbbbb', { id: 'cs_test_bbbbbbbbbbbb', client_reference_id: B, subscription: 'sub_b1' })
    const ctxA = { userId: 'user_bill_a', accountId: A, role: 'owner' as const }
    expect(await syncCheckoutSession(ctxA, 'cs_test_bbbbbbbbbbbb')).toBe(false)
    expect(await syncCheckoutSession(ctxA, 'nesmysl')).toBe(false)
    const ctxB = { userId: 'user_bill_b', accountId: B, role: 'owner' as const }
    expect(await syncCheckoutSession(ctxB, 'cs_test_bbbbbbbbbbbb')).toBe(true)
  })
})

describe('createCheckoutSession', () => {
  let C: string
  const ctxC = () => ({ userId: 'user_bill_c', accountId: C, role: 'owner' as const })

  beforeAll(async () => {
    process.env.STRIPE_PRICE_MONTHLY = 'price_test_249'
    process.env.NEXT_PUBLIC_APP_URL = 'https://zakaziq.test/'
    ;({ accountId: C } = await createAccountWithBusiness({
      orgId: 'org_bill_c',
      name: 'Autoservis Dvořák',
      industry: 'autoservis',
      owner: { userId: 'user_bill_c', name: null, email: 'user_bill_c@example.cz' },
    }))
  })

  afterAll(() => {
    delete process.env.STRIPE_PRICE_MONTHLY
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('poprvé: 14 dní zdarma s kartou, zákazník s účtem v metadatech, metody řídí dashboard', async () => {
    const res = await createCheckoutSession(ctxC(), { cancelPath: '/w/novy' })
    expect(res).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_c' })

    const [customerParams, customerOpts] = createCustomer.mock.calls[0]
    expect(customerParams).toMatchObject({ email: 'user_bill_c@example.cz', metadata: { account_id: C } })
    expect(customerOpts).toEqual({ idempotencyKey: `zakaziq-customer-${C}` })

    const params = createSession.mock.calls[0][0] as unknown as Stripe.Checkout.SessionCreateParams
    expect(params).toMatchObject({
      mode: 'subscription',
      customer: 'cus_new_c',
      client_reference_id: C,
      metadata: { account_id: C },
      line_items: [{ price: 'price_test_249', quantity: 1 }],
      payment_method_collection: 'always',
      locale: 'cs',
      success_url: 'https://zakaziq.test/w/predplatne?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://zakaziq.test/w/novy',
    })
    expect(params.subscription_data).toMatchObject({ metadata: { account_id: C }, trial_period_days: 14 })
    expect(params).not.toHaveProperty('payment_method_types')
    expect(params).not.toHaveProperty('automatic_tax')

    const [acc] = await wsDb({ accountId: C })`SELECT stripe_customer_id FROM ws.accounts WHERE id = ${C}`
    expect(acc.stripe_customer_id).toBe('cus_new_c')
  })

  it('běžící předplatné = žádný druhý Checkout; nezaplacené = jen výměna karty', async () => {
    putSub('sub_c1', C, 'trialing')
    await handleStripeEvent(subEvent('customer.subscription.created', 'sub_c1'))
    expect(await createCheckoutSession(ctxC(), { cancelPath: '/w/ucet' })).toEqual({ alreadyActive: true })

    putSub('sub_c1', C, 'past_due')
    await handleStripeEvent(subEvent('customer.subscription.updated', 'sub_c1'))
    expect(await createCheckoutSession(ctxC(), { cancelPath: '/w/ucet' })).toEqual({ updateCard: true })
  })

  it('po zrušení: nový Checkout bez zkušební doby, stejný zákazník', async () => {
    putSub('sub_c1', C, 'canceled')
    await handleStripeEvent(subEvent('customer.subscription.deleted', 'sub_c1'))
    createSession.mockClear()
    createCustomer.mockClear()
    await createCheckoutSession(ctxC(), { cancelPath: '/w/ucet' })
    const params = createSession.mock.calls[0][0] as unknown as Stripe.Checkout.SessionCreateParams
    expect(params.subscription_data).not.toHaveProperty('trial_period_days')
    expect(params.customer).toBe('cus_new_c')
    expect(createCustomer).not.toHaveBeenCalled()
  })
})

// --- Route a podpis -------------------------------------------------------------

describe('POST /api/stripe/webhook', () => {
  const payload = (id: string) =>
    JSON.stringify({ id, object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_b1' } } })

  const request = (body: string, signature: string | null) =>
    new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
    })

  const sign = (body: string, secret = WEBHOOK_SECRET, timestamp?: number) =>
    realWebhooks.generateTestHeaderString({ payload: body, secret, timestamp })

  it('bez nastavení 503, bez podpisu nebo s cizím/starým podpisem 400, s platným 200', async () => {
    const body = payload('evt_route_1')
    delete process.env.STRIPE_WEBHOOK_SECRET
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    expect((await stripeWebhookPost(request(body, sign(body)))).status).toBe(503)

    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
    expect((await stripeWebhookPost(request(body, null))).status).toBe(400)
    expect((await stripeWebhookPost(request(body, sign(body, 'whsec_cizi')))).status).toBe(400)
    const old = Math.floor(Date.now() / 1000) - 60 * 60
    expect((await stripeWebhookPost(request(body, sign(body, WEBHOOK_SECRET, old)))).status).toBe(400)
    // Podepsané tělo, které někdo cestou změnil.
    expect((await stripeWebhookPost(request(payload('evt_route_x'), sign(body)))).status).toBe(400)

    const ok = await stripeWebhookPost(request(body, sign(body)))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ success: true, result: 'processed' })
    const again = await stripeWebhookPost(request(body, sign(body)))
    expect(await again.json()).toEqual({ success: true, result: 'duplicate' })

    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_SECRET_KEY
  })
})
