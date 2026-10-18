import * as React from 'react'
import { notFound, redirect } from 'next/navigation'
import { billingStateFrom, getBillingState, type BillingState, type SubscriptionRow } from './billing'
import {
  isBusinessSlug,
  requireBusiness,
  requireIdentity,
  requireWorkspace,
  roleOf,
  seedRequestScope,
  type WsBusiness,
  type WsContext,
} from './context'
import { pgErrorCode, wsSystem } from './db'
import { WS_ONBOARDING_PATH } from './paths'
import { getBusinesses, getEnabledModules } from './today'

// Kontext obrazovky byznysu jedním dotazem (RD02, migrace 085).
//
// Dřív šel účet (ws.account_by_clerk_org) → byznys ∥ předplatné → funkce a
// byznysy za sebou. ws.business_scope() vrátí všechno najednou pro Clerk
// organizaci z přihlášení a slug z URL; výsledek se uloží do požadavku, takže
// `requireWorkspace()`, `requireBusiness()` a `getEnabledModules()` v layoutu
// i na stránce už do DB nesahají.

export type BusinessScope = {
  ctx: WsContext
  business: WsBusiness
  billing: BillingState
  modules: ReadonlySet<string>
  /** Byznysy účtu pro přepínač. */
  businesses: { name: string; slug: string }[]
}

type Cache = <F extends (...args: never[]) => unknown>(fn: F) => F
const cache: Cache = (React as unknown as { cache?: Cache }).cache ?? ((fn) => fn)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const asDate = (v: unknown): Date | null => (typeof v === 'string' ? new Date(v) : null)

function subscriptionRows(raw: unknown): SubscriptionRow[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map((s) => ({
    status: s.status as SubscriptionRow['status'],
    current_period_end: asDate(s.current_period_end),
    cancel_at_period_end: s.cancel_at_period_end === true,
    past_due_since: asDate(s.past_due_since),
    created_at: asDate(s.created_at) ?? new Date(0),
  }))
}

/** Odpověď ws.business_scope() → typy aplikace. `null` = organizace nemá účet. */
export function parseBusinessScope(
  raw: unknown,
  orgContext: { userId: string; orgRole: string | null },
  now: Date = new Date(),
): { ctx: WsContext; business: WsBusiness | null; billing: BillingState; modules: Set<string>; businesses: BusinessScope['businesses'] } | null {
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (!isObject(value) || typeof value.account_id !== 'string') return null

  const ctx: WsContext = { userId: orgContext.userId, accountId: value.account_id, role: roleOf(orgContext.orgRole) }
  const b = isObject(value.business) ? value.business : null
  const business: WsBusiness | null = b
    ? {
        id: String(b.id),
        account_id: String(b.account_id),
        name: String(b.name),
        slug: String(b.slug),
        industry: String(b.industry),
        color: typeof b.color === 'string' ? b.color : null,
        logo_url: typeof b.logo_url === 'string' ? b.logo_url : null,
        timezone: String(b.timezone),
        settings: isObject(b.settings) ? b.settings : {},
        archived_at: asDate(b.archived_at),
      }
    : null

  const businesses = (Array.isArray(value.businesses) ? value.businesses : [])
    .filter(isObject)
    .map((x) => ({ name: String(x.name), slug: String(x.slug) }))
  const modules = new Set((Array.isArray(value.modules) ? value.modules : []).filter((m): m is string => typeof m === 'string'))
  return { ctx, business, billing: billingStateFrom(subscriptionRows(value.subscriptions), now), modules, businesses }
}

/** Postup před migrací 085: účet → byznys → předplatné, funkce a byznysy. */
async function loadBusinessScopeSeparately(slug: string): Promise<BusinessScope> {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  const [billing, modules, businesses] = await Promise.all([
    getBillingState(ctx.accountId),
    getEnabledModules(ctx, business),
    getBusinesses(ctx),
  ])
  return { ctx, business, billing, modules, businesses }
}

/**
 * Účet, byznys z URL, předplatné, zapnuté funkce a byznysy v jednom kole do DB.
 * Neznámá organizace → průvodce; cizí, archivovaný nebo neexistující slug = 404.
 *
 * Dokud na databázi neběží migrace 085 (funkce chybí, kód 42883), vrací se
 * pomalejší postup po částech — nasazení kódu před migrací tak neshodí aplikaci.
 */
export const loadBusinessScope = cache(async function loadBusinessScope(slug: string): Promise<BusinessScope> {
  if (!isBusinessSlug(slug)) notFound()
  const identity = await requireIdentity()
  let raw: unknown
  try {
    const [row] = await wsSystem<{ scope: unknown }>`SELECT ws.business_scope(${identity.orgId}, ${slug}) AS scope`
    raw = row?.scope
  } catch (e) {
    if (pgErrorCode(e) !== '42883') throw e
    console.error('ws: chybí ws.business_scope (migrace 085), načítám kontext po částech')
    return loadBusinessScopeSeparately(slug)
  }
  const parsed = parseBusinessScope(raw, identity)
  if (!parsed) redirect(WS_ONBOARDING_PATH)
  if (!parsed.business) notFound()

  seedRequestScope(parsed.ctx, parsed.business, parsed.modules)
  return { ctx: parsed.ctx, business: parsed.business, billing: parsed.billing, modules: parsed.modules, businesses: parsed.businesses }
})
