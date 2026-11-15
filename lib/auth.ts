import { cache } from 'react'
import { headers } from 'next/headers'

import { sql } from './db'
import { createSupabaseServerClient } from './supabase/server'
import { isAdminEmail, supabaseConfigured } from './supabase/config'
import { sessionTooOld } from './supabase/session-age'

/**
 * Přihlášení do admin konzole. Od 2026-11-14 ho vede **Supabase Auth**
 * (e-mail + heslo a k tomu TOTP), dřív to byl NextAuth Credentials — R-105.
 * Pravidlo jednoho admina z R-001 platí dál: dovnitř se dostane jen session,
 * jejíž e-mail se rovná `ADMIN_EMAIL`. Kdo se přihlásí jiným účtem (třeba
 * klient Workspace), nemá v adminu žádná práva.
 *
 * Data zůstávají v Neonu (R-002); Supabase je jen poskytovatel identity.
 */

export type AdminSession = {
  email: string
  userId: string
  /** `aal2` = session prošla i druhým faktorem, `aal1` = jen heslo. */
  aal: string | null
}

export async function clientIp(): Promise<string> {
  const value = (await headers()).get('x-forwarded-for')
  return value ? value.split(',')[0].trim() : 'unknown'
}

/** Zápis pokusu o přihlášení (jen evidence, nic neblokuje — DECISIONS #030). */
export async function recordAttempt(ip: string, success: boolean): Promise<void> {
  await sql`INSERT INTO login_attempts (ip, success) VALUES (${ip}, ${success})`
  await sql`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`
}

/**
 * Kdo je přihlášený; bez per-request cache (tu přidává `getAdminSession`).
 * Exportovaná kvůli testům, v aplikaci se volá `getAdminSession()`.
 *
 * `null` znamená „do adminu nesmí“ — ať už proto, že
 * session není, je cizí, nebo nedokončila dvoufázové ověření.
 *
 * `getClaims()` ověří podpis JWT proti zveřejněným klíčům projektu (ES256),
 * takže běžný průchod je lokální a bez volání Supabase. Dotaz na faktory
 * (jedno volání Supabase) padne jen na session, která druhým faktorem
 * neprošla — po zapnutí TOTP tedy skoro nikdy.
 */
export async function loadAdminSession(): Promise<AdminSession | null> {
  if (!supabaseConfigured()) return null

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const claims = data.claims
  const email = typeof claims.email === 'string' ? claims.email : null
  if (!email || !isAdminEmail(email)) return null

  // Dvanáct hodin od přihlášení a dost — „Time-box user sessions" je
  // v Supabase placená funkce, tak si strop držíme sami (R-106).
  if (sessionTooOld(claims)) return null

  const aal = typeof claims.aal === 'string' ? claims.aal : null

  // Kdo má zapsaný druhý faktor, musí ho projít. Jinak by stačilo heslo
  // a dvoufázové ověření by se dalo obejít tím, že se druhý krok přeskočí.
  if (aal !== 'aal2') {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    if ((factors?.totp?.length ?? 0) > 0) return null
  }

  return { email, userId: String(claims.sub ?? ''), aal }
}

/** Per-request cache: jedna stránka adminu se ptá na session z mnoha míst. */
const cachedAdminSession = cache(loadAdminSession)

export type AdminAuthProvider = () => Promise<AdminSession | null>

let provider: AdminAuthProvider = cachedAdminSession

/** Jen pro testy. `null` vrátí skutečné přihlášení přes Supabase. */
export function setAdminSessionForTests(next: AdminAuthProvider | null): void {
  provider = next ?? cachedAdminSession
}

export async function getAdminSession(): Promise<AdminSession | null> {
  return provider()
}

/** Kdo akci provedl — do auditu a zpráv. */
export async function adminActorEmail(): Promise<string> {
  return (await getAdminSession())?.email ?? 'admin'
}

/** Pro server actions a route handlery: bez přihlášení se nepokračuje. */
export async function requireAuth(): Promise<void> {
  const session = await getAdminSession()
  if (!session) throw new Error('Neautorizovaný přístup')
}
