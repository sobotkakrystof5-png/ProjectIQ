import * as React from 'react'
import { notFound, redirect } from 'next/navigation'
import { wsDb, wsSystem } from './db'
import { WS_ONBOARDING_PATH, WS_SIGN_IN_PATH } from './paths'

// Kontext každé server action, route handleru a server komponenty Workspace
// (AGENTS.md B3): `const ctx = await requireWorkspace()` je první řádek.
//
// Kdo je přihlášený, řekne podepsaný token Supabase Auth (R-154, dřív Clerk).
// Ke kterému účtu patří a s jakou rolí, řekne až tabulka ws.members — Supabase
// o účtech nic neví a session sama do Workspace nepustí (platí i pro admina,
// který je ve stejném projektu Supabase). Přihlášení je za rozhraním
// WsAuthProvider; testy si přes setWsAuthProvider podstrčí vlastní identitu.

export type WsRole = 'owner' | 'staff'
export type WsContext = { userId: string; accountId: string; role: WsRole }

export type WsIdentity = { userId: string; email: string | null; name?: string | null }
export type WsAuthProvider = () => Promise<WsIdentity | null>

const supabaseAuthProvider: WsAuthProvider = async () => {
  const { supabaseConfigured } = await import('@/lib/supabase/config')
  if (!supabaseConfigured()) return null
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  const supabase = await createSupabaseServerClient()
  // getClaims() ověří podpis tokenu (ES256) lokálně; getSession() by jen přečetl cookie.
  const { data, error } = await supabase.auth.getClaims()
  const claims = error ? null : data?.claims
  const userId = typeof claims?.sub === 'string' ? claims.sub : ''
  if (!userId) return null
  const meta = claims?.user_metadata as Record<string, unknown> | undefined
  const name = typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 200) : null
  return { userId, email: typeof claims?.email === 'string' ? claims.email : null, name }
}

let authProvider: WsAuthProvider = supabaseAuthProvider

/** Jen pro testy: vlastní identita. `null` vrátí Supabase. */
export function setWsAuthProvider(provider: WsAuthProvider | null): void {
  authProvider = provider ?? supabaseAuthProvider
}

/** Přihlášený člověk, nebo `null` (průvodce, pozvánka, přihlášení). */
export async function getWsIdentity(): Promise<WsIdentity | null> {
  return authProvider()
}

export { WS_ONBOARDING_PATH, WS_SIGN_IN_PATH }

// cache(): layout i stránka téhož požadavku se ptají jen jednou. React.cache
// je jen v Reactu, který přibaluje Next (server components); mimo render
// (server action) nic neukládá a ve Vitestu (obyčejný React 18) chybí úplně —
// tam se funkce volá pokaždé.
type Cache = <F extends (...args: never[]) => unknown>(fn: F) => F
const cache: Cache = (React as unknown as { cache?: Cache }).cache ?? ((fn) => fn)

/** Přihlášený člověk; jinak přesměruje na přihlášení. Účet řeší `requireWorkspace()`. */
export async function requireIdentity(): Promise<WsIdentity> {
  const identity = await authProvider()
  if (!identity) redirect(WS_SIGN_IN_PATH)
  return identity
}

export const roleOf = (role: unknown): WsRole => (role === 'owner' ? 'owner' : 'staff')

// Co o účtu a byznysu už víme z jednoho dotazu na začátku požadavku
// (`loadBusinessScope` v scope.ts, RD02). Stejný React.cache jako výše, takže
// platí jen pro jeden požadavek a jednoho člověka; mimo render (server action,
// route handler, Vitest) je to pokaždé prázdné a vše se čte z DB jako dřív.
type RequestScope = {
  workspace: WsContext | null
  businesses: Map<string, WsBusiness>
  modules: Map<string, ReadonlySet<string>>
}
const requestScope = cache((): RequestScope => ({ workspace: null, businesses: new Map(), modules: new Map() }))

/** Uloží výsledek `ws.business_scope()` pro zbytek požadavku. Volá jen `loadBusinessScope`. */
export function seedRequestScope(ctx: WsContext, business: WsBusiness, modules: ReadonlySet<string>): void {
  const scope = requestScope()
  scope.workspace ??= ctx
  scope.businesses.set(`${ctx.accountId}:${business.slug}`, business)
  scope.modules.set(`${ctx.accountId}:${business.id}`, modules)
}

/** Zapnuté funkce, které už tento požadavek načetl; jinak `null` a čte se z DB. */
export function seededModules(accountId: string, businessId: string): Set<string> | null {
  const modules = requestScope().modules.get(`${accountId}:${businessId}`)
  return modules ? new Set(modules) : null
}

export const requireWorkspace = cache(async function requireWorkspace(): Promise<WsContext> {
  const seeded = requestScope().workspace
  if (seeded) return seeded

  const identity = await requireIdentity()
  const membership = await accountForUser(identity.userId)
  if (!membership) redirect(WS_ONBOARDING_PATH)
  return { userId: identity.userId, accountId: membership.accountId, role: membership.role }
})

/**
 * Účet a role člověka podle ws.members (vlastněný účet má přednost). Účet ještě
 * neznáme, proto SECURITY DEFINER funkce místo SELECT pod RLS (migrace 141).
 */
export async function accountForUser(userId: string): Promise<{ accountId: string; role: WsRole } | null> {
  if (!userId) return null
  const [row] = await wsSystem<{ account_id: string; role: string }>`SELECT account_id, role FROM ws.member_account(${userId})`
  return row ? { accountId: row.account_id, role: roleOf(row.role) } : null
}

export type WsBusiness = {
  id: string
  account_id: string
  name: string
  slug: string
  industry: string
  color: string | null
  logo_url: string | null
  timezone: string
  settings: Record<string, unknown>
  archived_at: Date | null
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const isBusinessSlug = (slug: string): boolean => SLUG_RE.test(slug) && slug.length <= 60

/** Byznys z URL ověřený proti účtu. Cizí nebo neexistující slug = 404, nikdy 403. */
export const requireBusiness = cache(async function requireBusiness(ctx: WsContext, slug: string): Promise<WsBusiness> {
  if (!isBusinessSlug(slug)) notFound()
  const seeded = requestScope().businesses.get(`${ctx.accountId}:${slug}`)
  if (seeded) return seeded
  const db = wsDb(ctx)
  const [business] = await db<WsBusiness>`
    SELECT id, account_id, name, slug, industry, color, logo_url, timezone, settings, archived_at
    FROM ws.businesses
    WHERE account_id = ${ctx.accountId} AND slug = ${slug} AND archived_at IS NULL
  `
  if (!business) notFound()
  return business
})

export const hasRole = (ctx: WsContext, role: WsRole): boolean => role === 'staff' || ctx.role === 'owner'

/**
 * Stránky jen pro vlastníka (předplatné, tým). Pracovník dostane 404.
 * V server actions místo toho `if (!hasRole(ctx, 'owner')) return fail(…)`.
 */
export function requireRole(ctx: WsContext, role: WsRole): void {
  if (!hasRole(ctx, role)) notFound()
}
