import 'server-only'
import Stripe from 'stripe'

// Klient Stripe pro Workspace (S08, AGENTS.md B5). Jen server — tajný klíč
// nikdy nesmí do prohlížeče (B13). Verze API je ta, se kterou vyšlo SDK
// (2026-08-26.dahlia); mění se jen vědomě spolu s upgradem balíčku `stripe`.
//
// Doporučený je omezený klíč (rk_…) s právy jen na to, co Workspace dělá:
// Checkout Sessions, Customers, Subscriptions, Invoices (čtení), Customer Portal
// (docs/workspace/SETUP.md → Stripe).

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Chybí STRIPE_SECRET_KEY (docs/workspace/SETUP.md → Stripe).')
  client = new Stripe(key, { appInfo: { name: 'ZakazIQ Workspace' }, maxNetworkRetries: 2 })
  return client
}

/** Jen pro testy: podstrčí klienta. `null` vrátí skutečný. */
export function setStripeForTests(next: Stripe | null): void {
  client = next
}

/** ID ceny tarifu 249 Kč měsíčně. */
export function monthlyPriceId(): string {
  const price = process.env.STRIPE_PRICE_MONTHLY
  if (!price?.startsWith('price_')) throw new Error('Chybí STRIPE_PRICE_MONTHLY (docs/workspace/SETUP.md → Stripe).')
  return price
}

/** Veřejná adresa aplikace pro návrat ze Stripe (R-017: landing i aplikace na jedné doméně). */
export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('Chybí NEXT_PUBLIC_APP_URL.')
  return url.replace(/\/+$/, '')
}
