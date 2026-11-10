import * as React from 'react'
import { notFound, redirect } from 'next/navigation'
import { wsDb, wsSystem } from './db'
import { WS_MFA_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH } from './paths'

// Kontext každé server action, route handleru a server komponenty Workspace
// (AGENTS.md B3): `const ctx = await requireWorkspace()` je první řádek.
//
// Přihlášení je za rozhraním WsAuthProvider. Výchozí je Supabase Auth (R-080):
// id uživatele z ověřeného JWT. Do kterého účtu patří a s jakou rolí, říká jen
// databáze (ws.members přes ws.membership_for_user). Testy si přes
// setWsAuthProvider podstrčí vlastní identitu a Supabase se v nich nenačte.

export type WsRole = 'owner' | 'staff'
export type WsContext = { userId: string; accountId: string; role: WsRole }

export type WsIdentity = {
  userId: string
  email: string | null
  /** Úroveň ověření relace (R-081). Chybí jen u testovacích identit. */
  aal?: 'aal1' | 'aal2'
  /** Relace v auth.sessions. Bez ní (testy) se stav přihlášení v DB neověřuje. */
  sessionId?: string | null
}
export type WsAuthProvider = () => Promise<WsIdentity | null>

const supabaseAuthProvider: WsAuthProvider = async () => {
  const { getAuthIdentity } = await import('@/lib/supabase/server')
  const identity = await getAuthIdentity()
  return identity ? { userId: identity.id, email: identity.email, aal: identity.aal, sessionId: identity.sessionId } : null
}

let authProvider: WsAuthProvider = supabaseAuthProvider

/** Jen pro testy: vlastní identita. `null` vrátí Supabase Auth. */
export function setWsAuthProvider(provider: WsAuthProvider | null): void {
  authProvider = provider ?? supabaseAuthProvider
}

export { WS_ONBOARDING_PATH, WS_SIGN_IN_PATH }

// cache(): layout i stránka téhož požadavku se ptají jen jednou. React.cache
// je jen v Reactu, který přibaluje Next (server components); mimo render
// (server action) nic neukládá a ve Vitestu (obyčejný React 18) chybí úplně —
// tam se funkce volá pokaždé.
type Cache = <F extends (...args: never[]) => unknown>(fn: F) => F
const cache: Cache = (React as unknown as { cache?: Cache }).cache ?? ((fn) => fn)

/** Zrušená relace (Odhlásit všude): /auth/odhlaseni smaže cookies a pošle na přihlášení. */
export const WS_REVOKED_PATH = '/auth/odhlaseni?kam=w'

// Platí relace ještě a má člověk zapnuté 2FA? (migrace 103, R-081). JWT se
// ověřuje jen podpisem, tohle ví jen databáze. Jednou na požadavek.
const authState = cache(async (userId: string, sessionId: string) => {
  const [row] = await wsSystem<{ session_ok: boolean; mfa_enrolled: boolean }>`
    SELECT session_ok, mfa_enrolled FROM ws.auth_state(${userId}, ${sessionId})
  `
  return row ?? { session_ok: false, mfa_enrolled: false }
})

/**
 * Přihlášený člověk; jinak přesměruje na přihlášení. Účet ještě nemusí mít.
 * Relaci zrušenou z jiného zařízení pošle na odhlášení, se zapnutým 2FA bez
 * ověřeného kódu na /w/overeni (R-081).
 */
export async function requireIdentity(): Promise<WsIdentity> {
  const identity = await authProvider()
  if (!identity) redirect(WS_SIGN_IN_PATH)
  if (identity.sessionId) {
    const state = await authState(identity.userId, identity.sessionId)
    if (!state.session_ok) redirect(WS_REVOKED_PATH)
    if (state.mfa_enrolled && identity.aal !== 'aal2') redirect(WS_MFA_PATH)
  }
  return identity
}

/** Přihlášený člověk, nebo null (bez přesměrování) — průvodce /w/novy, pozvánka. */
export async function currentIdentity(): Promise<WsIdentity | null> {
  return authProvider()
}

/** Role z ws.members. Cokoli jiného než `owner` = pracovník (méně práv). */
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

  // Účet ještě neznáme, proto SECURITY DEFINER funkce místo SELECT pod RLS.
  const [row] = await wsSystem<{ account_id: string | null; role: string | null }>`
    SELECT account_id, role FROM ws.membership_for_user(${identity.userId})
  `
  if (!row?.account_id) redirect(WS_ONBOARDING_PATH)

  return {
    userId: identity.userId,
    accountId: row.account_id,
    role: roleOf(row.role),
  }
})

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
