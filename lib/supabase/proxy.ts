import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

import { isAdminEmail, supabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'
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
 * v `proxy.ts` na každý požadavek na `/dashboard`.
 *
 * `getClaims()` ověří podpis JWT proti zveřejněným klíčům projektu (ES256),
 * takže je to **lokální** operace bez volání Supabase. `getSession()` by se
 * věřit nesmělo — ten obsah cookie jen přečte.
 *
 * Vrací cookies místo hotové odpovědi proto, že proxy na tutéž odpověď ještě
 * přidává CSP s nonce; dvě `NextResponse.next()` by se přebily.
 */
export async function checkAdminSession(request: NextRequest): Promise<AdminSessionCheck> {
  if (!supabaseConfigured()) return { admin: null, cookiesToSet: [] }

  const cookiesToSet: SetCookie[] = []

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
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

  const { data, error } = await supabase.auth.getClaims()
  const claims = error ? null : data?.claims

  const email = typeof claims?.email === 'string' ? claims.email : null
  if (!claims || !email || !isAdminEmail(email)) return { admin: null, cookiesToSet }
  if (sessionTooOld(claims)) return { admin: null, cookiesToSet }

  return {
    admin: { email, userId: String(claims.sub ?? ''), aal: typeof claims.aal === 'string' ? claims.aal : null },
    cookiesToSet,
  }
}

export function applyCookies(response: NextResponse, cookiesToSet: SetCookie[]): NextResponse {
  for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
  return response
}
