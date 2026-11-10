'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Odhlášení (R-080) a odhlášení ze všech zařízení (R-081). Cíl je pevný podle
// části aplikace, nikdy z formuláře.

const AFTER_SIGN_OUT = {
  w: '/',
  klient: PORTAL_SIGN_IN_PATH,
  admin: '/login',
  'w-prihlaseni': WS_SIGN_IN_PATH,
} as const

export type SignOutTarget = keyof typeof AFTER_SIGN_OUT

/** Z formuláře (SignOutButton) — funguje i bez JavaScriptu. */
export async function signOutAction(formData: FormData): Promise<never> {
  const raw = formData.get('target')
  return signOutTo(typeof raw === 'string' ? raw : 'w')
}

/** Z klientské komponenty (položka menu). Neznámý cíl = úvodní stránka. */
export async function signOutTo(raw: string): Promise<never> {
  const target: SignOutTarget = raw in AFTER_SIGN_OUT ? (raw as SignOutTarget) : 'w'
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    // scope 'local' = jen toto zařízení; ostatní přihlášení zůstanou.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  redirect(AFTER_SIGN_OUT[target])
}

/** Kam po „Odhlásit všude“ — vždy na přihlášení té části aplikace. */
const AFTER_SIGN_OUT_EVERYWHERE: Record<SignOutTarget, string> = {
  w: WS_SIGN_IN_PATH,
  'w-prihlaseni': WS_SIGN_IN_PATH,
  klient: PORTAL_SIGN_IN_PATH,
  admin: '/login',
}

/**
 * Odhlásit všechna zařízení (R-081): Supabase zruší všechny relace účtu
 * (scope 'global'). Workspace a klientský prostor to poznají hned
 * (ws/portal.auth_state), admin přes Auth server (getUser).
 */
export async function signOutEverywhere(raw: string): Promise<never> {
  const target: SignOutTarget = raw in AFTER_SIGN_OUT ? (raw as SignOutTarget) : 'w'
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
  }
  redirect(AFTER_SIGN_OUT_EVERYWHERE[target])
}
