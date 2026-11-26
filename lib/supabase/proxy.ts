import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

import { isAdminUser, supabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'
import { hardenedCookieOptions } from './cookies'
import { sessionTooOld } from './session-age'

export type AdminClaims = { email: string; userId: string; aal: string | null }

type SetCookie = { name: string; value: string; options: CookieOptions }

export type AdminSessionCheck = {
  admin: AdminClaims | null
  /** Obnovené tokeny — musí se dostat na odpověď, jinak se admin odhlásí. */
  cookiesToSet: SetCookie[]
}

/**
 * Kdo je přihlášený, a co k tomu Supabase potřebuje zapsat do cookies. Běží
 * v `proxy.ts` na každý požadavek na `/dashboard` (admin) a `/klient` (klienti, R-107).
 *
 * `getClaims()` ověří podpis JWT proti zveřejněným klíčům projektu (ES256),
 * takže je to **lokální** operace bez volání Supabase. `getSession()` by se
 * věřit nesmělo — ten obsah cookie jen přečte.
 *
 * Vrací cookies místo hotové odpovědi proto, že proxy na tutéž odpověď ještě
 * přidává CSP s nonce; dvě `NextResponse.next()` by se přebily.
 */
function sessionClient(request: NextRequest, cookiesToSet: SetCookie[]) {
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) => {
        for (const { name, value, options } of toSet) {
          // Aby `getClaims()` dál v témže průchodu viděl obnovený token.
          request.cookies.set(name, value)
          cookiesToSet.push({ name, value, options: hardenedCookieOptions(options) })
        }
      },
    },
  })
}

type SessionClient = ReturnType<typeof sessionClient>

async function readClaims(client: SessionClient) {
  const { data, error } = await client.auth.getClaims()
  return error ? null : (data?.claims ?? null)
}

export async function checkAdminSession(request: NextRequest): Promise<AdminSessionCheck> {
  if (!supabaseConfigured()) return { admin: null, cookiesToSet: [] }

  const cookiesToSet: SetCookie[] = []
  const client = sessionClient(request, cookiesToSet)
  const claims = await readClaims(client)

  const email = typeof claims?.email === 'string' ? claims.email : null
  if (!claims || !email || !isAdminUser(email, typeof claims.sub === 'string' ? claims.sub : null)) {
    return { admin: null, cookiesToSet }
  }
  if (sessionTooOld(claims)) return { admin: null, cookiesToSet }

  const aal = typeof claims.aal === 'string' ? claims.aal : null

  // Stejné pravidlo jako `loadAdminSession()` v `lib/auth.ts`: kdo má zapsaný
  // druhý faktor, s heslem samotným do adminu nesmí (audit 2026-11-24, #2).
  // Supabase se ptáme jen u session `aal1`, ta existuje jen mezi heslem
  // a kódem. Bez odpovědi nepouštět.
  if (aal !== 'aal2') {
    const { data: factors, error } = await client.auth.mfa.listFactors()
    if (error || (factors?.totp?.length ?? 0) > 0) return { admin: null, cookiesToSet }
  }

  return { admin: { email, userId: String(claims.sub ?? ''), aal }, cookiesToSet }
}

export type UserSessionCheck = {
  /** Id přihlášeného v Supabase, nebo `null`. O přístupu rozhoduje až stránka. */
  userId: string | null
  cookiesToSet: SetCookie[]
}

/**
 * Obnoví session kohokoli přihlášeného (klientský prostor, R-107). Neříká nic
 * o oprávnění: členství firmy ověřuje `requireClient()` na stránce.
 */
export async function checkUserSession(request: NextRequest): Promise<UserSessionCheck> {
  if (!supabaseConfigured()) return { userId: null, cookiesToSet: [] }
  const cookiesToSet: SetCookie[] = []
  const claims = await readClaims(sessionClient(request, cookiesToSet))
  const userId = typeof claims?.sub === 'string' && claims.sub.length > 0 ? claims.sub : null
  return { userId, cookiesToSet }
}

export function applyCookies(response: NextResponse, cookiesToSet: SetCookie[]): NextResponse {
  for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
  return response
}
