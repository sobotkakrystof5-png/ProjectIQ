import type Stripe from 'stripe'
import type { WsContext } from './context'
import { wsDb } from './db'
import { fail } from './result'
import { appUrl, getStripe, monthlyPriceId } from './stripe'

// Předplatné Workspace (S08, AGENTS.md B5, R-038).
//
// 14 dní zdarma s kartou: zkušební doba běží ve Stripe (trial v Checkoutu),
// ne v ws.accounts.trial_ends_at. Účet, který Checkoutem nikdy neprošel, má
// přístup „none“ a průvodce /w/novy ho pošle do kroku 2.
//
// Zdroj pravdy je Stripe. ws.subscriptions je jeho kopie, kterou drží webhook
// (lib/ws/stripe-webhook.ts) a návrat z Checkoutu (/w/predplatne). Synchronizace
// si předplatné vždy znovu načte ze Stripe, takže nezáleží na pořadí událostí.

export const TRIAL_DAYS = 14
/** Lhůta po neúspěšné platbě, než se účet přepne jen na čtení. */
export const GRACE_DAYS = 7

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'

/**
 * Co účet smí:
 * - `none` — předplatné nikdy nezaložil (nebo Checkout nedokončil) → průvodce krok 2
 * - `trialing`, `active` — všechno
 * - `grace` — platba se nepovedla, do GRACE_DAYS všechno + pruh s výzvou
 * - `read_only` — zrušeno, nezaplaceno nebo po lhůtě: čtení ano, změny ne.
 *   Poptávky z webu se ukládají dál, data se nemažou (B5).
 */
export type BillingAccess = 'none' | 'trialing' | 'active' | 'grace' | 'read_only'

export type SubscriptionRow = {
  status: SubscriptionStatus
  current_period_end: Date | null
  cancel_at_period_end: boolean
  past_due_since: Date | null
  created_at: Date
}

export type BillingState = {
  access: BillingAccess
  status: SubscriptionStatus | null
  /** Konec zkušební doby / období = datum další platby, nebo konec předplatného při zrušení. */
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Do kdy platí lhůta po neúspěšné platbě (jen `grace` a `read_only` z `past_due`). */
  graceEndsAt: Date | null
  /** Měl účet někdy skutečné předplatné? Zkušební doba se dává jen jednou. */
  hadSubscription: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const NOT_STARTED: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>(['incomplete', 'incomplete_expired'])

const rank = (s: SubscriptionStatus): number =>
  s === 'active' || s === 'trialing' ? 3 : s === 'past_due' ? 2 : NOT_STARTED.has(s) ? 0 : 1

/** Stav přístupu z řádků ws.subscriptions účtu. Čistá funkce kvůli testům. */
export function billingStateFrom(rows: SubscriptionRow[], now: Date = new Date()): BillingState {
  const started = rows.filter((r) => !NOT_STARTED.has(r.status))
  const hadSubscription = started.length > 0
  const [sub] = [...rows].sort(
    (a, b) => rank(b.status) - rank(a.status) || b.created_at.getTime() - a.created_at.getTime(),
  )

  const base = {
    status: sub?.status ?? null,
    periodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    graceEndsAt: null,
    hadSubscription,
  }

  if (!sub || NOT_STARTED.has(sub.status)) return { ...base, access: 'none' }
  if (sub.status === 'trialing' || sub.status === 'active') return { ...base, access: sub.status }
  if (sub.status === 'past_due') {
    const since = sub.past_due_since ?? now
    const graceEndsAt = new Date(since.getTime() + GRACE_DAYS * DAY_MS)
    return { ...base, graceEndsAt, access: now < graceEndsAt ? 'grace' : 'read_only' }
  }
  return { ...base, access: 'read_only' }
}

export const canWrite = (state: BillingState): boolean =>
  state.access === 'trialing' || state.access === 'active' || state.access === 'grace'

export async function getBillingState(accountId: string, now: Date = new Date()): Promise<BillingState> {
  const rows = await wsDb({ accountId })<SubscriptionRow>`
    SELECT status, current_period_end, cancel_at_period_end, past_due_since, created_at
    FROM ws.subscriptions
    WHERE account_id = ${accountId}
  `
  return billingStateFrom(rows, now)
}

/** Smí účet měnit data? Zkušební doba, zaplaceno, nebo lhůta po neúspěšné platbě. */
export async function hasActiveSubscription(accountId: string): Promise<boolean> {
  return canWrite(await getBillingState(accountId))
}

export const READ_ONLY_MESSAGE =
  'Předplatné neběží, takže teď jde jen prohlížet. Obnovit ho můžete v Účtu.'

/**
 * Pojistka v každé mutační server action Workspace:
 *   const blocked = await assertWritable(ctx); if (blocked) return blocked
 * Neplatí pro příjem poptávek z webu — ty se ukládají vždy (B5).
 */
export async function assertWritable(ctx: WsContext): Promise<{ ok: false; error: string } | null> {
  return (await hasActiveSubscription(ctx.accountId)) ? null : fail(READ_ONLY_MESSAGE)
}

// --- Synchronizace ze Stripe -------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
])

const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === 'string' ? x : (x?.id ?? null)

const isoFromUnix = (seconds: number | null | undefined): string | null =>
  seconds ? new Date(seconds * 1000).toISOString() : null

/** Účet z metadat předplatného, případně zákazníka (obojí nastavuje createCheckoutSession). */
async function accountIdOf(sub: Stripe.Subscription): Promise<string | null> {
  const fromSub = sub.metadata?.account_id
  if (fromSub && UUID_RE.test(fromSub)) return fromSub
  const customerId = idOf(sub.customer)
  if (!customerId) return null
  const customer = await getStripe().customers.retrieve(customerId)
  const fromCustomer = 'deleted' in customer && customer.deleted ? null : customer.metadata?.account_id
  return fromCustomer && UUID_RE.test(fromCustomer) ? fromCustomer : null
}

/**
 * Načte předplatné ze Stripe a uloží ho do ws.subscriptions. Vrací účet,
 * kterému patří, nebo null (cizí/neznámé předplatné se jen přeskočí).
 */
export async function syncSubscription(subscriptionId: string): Promise<string | null> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  const accountId = await accountIdOf(sub)
  if (!accountId) {
    console.warn('[ws/billing] předplatné bez účtu v metadatech', { subscriptionId })
    return null
  }
  if (!STATUSES.has(sub.status)) {
    console.warn('[ws/billing] neznámý stav předplatného', { accountId, status: sub.status })
    return null
  }

  const db = wsDb({ accountId })
  const [account] = await db<{ id: string }>`SELECT id FROM ws.accounts WHERE id = ${accountId}`
  if (!account) {
    console.warn('[ws/billing] předplatné k neexistujícímu účtu', { accountId, subscriptionId })
    return null
  }

  // Od API 2025-03-31 je konec období na položce předplatného, ne na předplatném.
  const item = sub.items.data[0]
  const cancelling = sub.cancel_at_period_end || sub.cancel_at !== null
  const periodEnd = isoFromUnix(sub.cancel_at ?? item?.current_period_end)
  const customerId = idOf(sub.customer)

  await db.batch([
    {
      text: `
        INSERT INTO ws.subscriptions
          (account_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end, past_due_since)
        VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3::text = 'past_due' THEN now() END)
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET
          status = EXCLUDED.status,
          price_id = EXCLUDED.price_id,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          past_due_since = CASE WHEN EXCLUDED.status = 'past_due'
            THEN COALESCE(ws.subscriptions.past_due_since, now()) END
        WHERE ws.subscriptions.account_id = EXCLUDED.account_id
      `,
      params: [accountId, sub.id, sub.status, item?.price.id ?? null, periodEnd, cancelling],
    },
    {
      text: `UPDATE ws.accounts SET stripe_customer_id = $2 WHERE id = $1 AND stripe_customer_id IS NULL`,
      params: [accountId, customerId],
    },
  ])
  return accountId
}

// --- Checkout a Customer Portal ---------------------------------------------

/** Štítek relací Checkoutu v dashboardu Stripe (API dahlia: integration_identifier). */
const INTEGRATION_ID = 'zakaziq-predplatne-wkqzmtrh'

async function ensureCustomer(ctx: WsContext): Promise<string> {
  const db = wsDb(ctx)
  const [account] = await db<{ name: string; stripe_customer_id: string | null }>`
    SELECT name, stripe_customer_id FROM ws.accounts WHERE id = ${ctx.accountId}
  `
  if (!account) throw new Error('účet nenalezen')
  if (account.stripe_customer_id) return account.stripe_customer_id

  const [owner] = await db<{ email: string | null }>`
    SELECT email FROM ws.members WHERE account_id = ${ctx.accountId} AND user_id = ${ctx.userId}
  `
  // Idempotentní klíč: dvojklik ani druhá záložka nezaloží druhého zákazníka (24 h u Stripe).
  const customer = await getStripe().customers.create(
    {
      name: account.name,
      email: owner?.email ?? undefined,
      metadata: { account_id: ctx.accountId },
      preferred_locales: ['cs'],
    },
    { idempotencyKey: `zakaziq-customer-${ctx.accountId}` },
  )
  const [saved] = await db<{ stripe_customer_id: string }>`
    UPDATE ws.accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ${customer.id})
    WHERE id = ${ctx.accountId}
    RETURNING stripe_customer_id
  `
  return saved?.stripe_customer_id ?? customer.id
}

/**
 * Relace Stripe Checkout pro předplatné 249 Kč měsíčně. Kdo předplatné ještě
 * nikdy neměl, dostane 14 dní zdarma — karta se zadá hned, první platba
 * proběhne po zkušební době (R-038). Platební metody řídí dashboard Stripe
 * (karta, Apple Pay, Google Pay), proto žádné payment_method_types.
 */
export async function createCheckoutSession(
  ctx: WsContext,
  opts: { cancelPath: string },
): Promise<{ url: string } | { alreadyActive: true } | { updateCard: true }> {
  const state = await getBillingState(ctx.accountId)
  // Nezaplacené předplatné Stripe dál zkouší strhnout. Nový Checkout by založil
  // druhé předplatné a hrozila by dvojí platba — stačí vyměnit kartu v Portalu.
  if (state.status === 'past_due') return { updateCard: true }
  if (canWrite(state)) return { alreadyActive: true }

  const customer = await ensureCustomer(ctx)
  const base = appUrl()
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: ctx.accountId,
    metadata: { account_id: ctx.accountId },
    line_items: [{ price: monthlyPriceId(), quantity: 1 }],
    subscription_data: {
      metadata: { account_id: ctx.accountId },
      ...(state.hadSubscription
        ? {}
        : {
            trial_period_days: TRIAL_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
          }),
    },
    payment_method_collection: 'always',
    // Prodejcem jsme my (neplátce, bez Stripe Tax, R-018). Nové účty Stripe mají
    // Managed Payments (Stripe jako prodejce) zapnuté ve výchozím stavu.
    managed_payments: { enabled: false },
    locale: 'cs',
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    success_url: `${base}/w/predplatne?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}${opts.cancelPath}`,
    integration_identifier: INTEGRATION_ID,
  })
  if (!session.url) throw new Error('Checkout nevrátil adresu')
  return { url: session.url }
}

/** Customer Portal: karta, faktury, zrušení. Bez zákazníka ve Stripe vrací null. */
export async function createPortalSession(ctx: WsContext): Promise<string | null> {
  const [account] = await wsDb(ctx)<{ stripe_customer_id: string | null }>`
    SELECT stripe_customer_id FROM ws.accounts WHERE id = ${ctx.accountId}
  `
  if (!account?.stripe_customer_id) return null
  const session = await getStripe().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${appUrl()}/w/ucet`,
    locale: 'cs',
  })
  return session.url
}

const CHECKOUT_SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

/**
 * Návrat z Checkoutu: webhook může dorazit až po přesměrování, proto se
 * předplatné synchronizuje i tady. Relace musí patřit přihlášenému účtu.
 */
export async function syncCheckoutSession(ctx: WsContext, sessionId: string): Promise<boolean> {
  if (!CHECKOUT_SESSION_RE.test(sessionId)) return false
  const session = await getStripe().checkout.sessions.retrieve(sessionId)
  if (session.client_reference_id !== ctx.accountId) return false
  const subscriptionId = idOf(session.subscription)
  if (!subscriptionId) return false
  return (await syncSubscription(subscriptionId)) === ctx.accountId
}

export type AccountInvoice = {
  id: string
  number: string | null
  created: Date
  total: number
  currency: string
  paid: boolean
  url: string | null
  pdf: string | null
}

/** Posledních 12 dokladů od Stripe pro /w/ucet. */
export async function listInvoices(ctx: WsContext): Promise<AccountInvoice[]> {
  const [account] = await wsDb(ctx)<{ stripe_customer_id: string | null }>`
    SELECT stripe_customer_id FROM ws.accounts WHERE id = ${ctx.accountId}
  `
  if (!account?.stripe_customer_id) return []
  const { data } = await getStripe().invoices.list({ customer: account.stripe_customer_id, limit: 12 })
  return data
    .filter((i) => i.status !== 'draft' && i.status !== 'void')
    .map((i) => ({
      id: i.id ?? '',
      number: i.number,
      created: new Date(i.created * 1000),
      total: i.total,
      currency: i.currency,
      paid: i.status === 'paid',
      url: i.hosted_invoice_url ?? null,
      pdf: i.invoice_pdf ?? null,
    }))
}
