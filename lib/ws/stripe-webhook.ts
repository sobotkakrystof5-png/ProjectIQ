import type Stripe from 'stripe'
import { GRACE_DAYS, syncSubscription } from './billing'
import { finishScheduledClose } from './gdpr'
import { wsSystem } from './db'
import { notifyPaymentFailed } from './email/notify'

// Zpracování událostí ze Stripe (/api/stripe/webhook, S08). Podpis ověřuje
// route handler, sem jde jen ověřená událost.
//
// Každá událost vede na jedno: znovu načíst předplatné ze Stripe a uložit ho
// (syncSubscription). Payload se nikam neukládá a na pořadí událostí nezáleží.
//
// Idempotence: event.id v ws.stripe_events. Hotová událost (processed_at) se
// přeskočí; nedokončená (spadla uprostřed) se zpracuje znovu — zápis je upsert.

export type StripeEventResult = 'processed' | 'duplicate' | 'ignored'

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
] as const

const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === 'string' ? x : (x?.id ?? null)

export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventResult> {
  const [row] = await wsSystem<{ processed_at: Date | null }>`
    INSERT INTO ws.stripe_events (id, type) VALUES (${event.id}, ${event.type})
    ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
    RETURNING processed_at
  `
  if (row?.processed_at) return 'duplicate'

  const subscriptionId = subscriptionOf(event)
  const accountId = subscriptionId ? await syncSubscription(subscriptionId) : null
  // Účet čekající na konec zaplaceného období se zavře, když předplatné skončí (R-074).
  if (accountId) await finishScheduledClose({ accountId })

  // Neúspěšná platba: majitel dostane e-mail a upozornění (S15). Jen jednou
  // na fakturu Stripe; chyba e-mailu zpracování události nezastaví.
  if (accountId && event.type === 'invoice.payment_failed') {
    await notifyPaymentFailed({ accountId }, event.data.object.id ?? event.id, GRACE_DAYS)
  }

  await wsSystem`
    UPDATE ws.stripe_events SET processed_at = now(), account_id = ${accountId}
    WHERE id = ${event.id}
  `
  return accountId ? 'processed' : 'ignored'
}

/** Předplatné, kterého se událost týká, nebo null (události mimo předplatné Workspace). */
function subscriptionOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object
      return session.mode === 'subscription' ? idOf(session.subscription) : null
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return event.data.object.id
    case 'invoice.paid':
    case 'invoice.payment_failed':
      // API dahlia: předplatné faktury je v parent.subscription_details.
      return idOf(event.data.object.parent?.subscription_details?.subscription)
    default:
      return null
  }
}
