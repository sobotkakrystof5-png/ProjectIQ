import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'

// Supabase na serveru (server komponenty, server actions, route handlery).
// Session je v cookies, které nastavuje @supabase/ssr; obnovu tokenu dělá
// proxy.ts (lib/supabase/proxy.ts), server komponenta cookies zapisovat nesmí.

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options)
        } catch {
          // Server komponenta: zápis cookies není povolený, token obnoví proxy.
        }
      },
    },
  })
}

/** Přihlášený člověk, jak ho zná zbytek aplikace. */
export type AuthUser = {
  id: string
  email: string | null
  /** E-mail ověřený odkazem (heslo) nebo poskytovatelem (Google). */
  emailConfirmed: boolean
  name: string | null
}

const metaName = (meta: Record<string, unknown> | undefined): string | null => {
  const value = meta?.full_name ?? meta?.name
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    name: metaName(user.user_metadata),
  }
}

/** Úroveň ověření relace: `aal1` = heslo / Google, `aal2` = navíc kód z aplikace (2FA). */
export type AuthLevel = 'aal1' | 'aal2'

export type AuthIdentity = {
  id: string
  email: string | null
  /** Z JWT; `aal2` jen po ověření druhým faktorem v této relaci. */
  aal: AuthLevel
  /** Id relace v auth.sessions — podle něj server pozná „Odhlásit všude“ (R-081). */
  sessionId: string | null
}

/**
 * Identita z podepsaného JWT v cookie (getClaims ověří podpis klíči projektu,
 * bez dotazu na Auth server). Pro běžné stránky Workspace a klientského prostoru;
 * platnost relace a 2FA tam navíc hlídá databáze (ws/portal.auth_state, R-081).
 * Jednou na požadavek.
 */
export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  if (!isSupabaseConfigured()) return null
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  const claims = data.claims as Record<string, unknown> & { sub: string }
  const email = typeof claims.email === 'string' && claims.email ? claims.email : null
  const sessionId = typeof claims.session_id === 'string' && claims.session_id ? claims.session_id : null
  return { id: claims.sub, email, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1', sessionId }
})

/**
 * Celý uživatel přímo z Auth serveru (aktuální e-mail a jeho ověření). Pro
 * rozhodnutí, která na tom stojí: admin, uplatnění pozvánky, profil vlastníka.
 * Jednou na požadavek.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!isSupabaseConfigured()) return null
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return toAuthUser(data.user)
})
