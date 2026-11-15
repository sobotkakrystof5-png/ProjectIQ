'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { clientIp, recordAttempt } from '@/lib/auth'
import { isAdminEmail, supabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Přihlášení do admin konzole přes Supabase Auth (R-105). Dva kroky:
 * heslo, a má-li účet zapsanou ověřovací aplikaci, ještě kód z ní.
 *
 * Záměrně se tu nerozlišuje, co bylo špatně (neznámý e-mail × heslo × cizí
 * účet) — jedna hláška pro všechno. Zámek na IP aplikace nemá (zrušen
 * 2026-11-15 na přání Kryštofa, DECISIONS #030): zkoušet jde dokola, pokusy
 * se jen zapisují do `login_attempts` a hádání hesla brzdí limit Supabase.
 */

export type SignInOutcome =
  | { ok: true; needsCode: boolean }
  | { ok: false; error: string }

const CREDENTIALS = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
})

const CODE = z.string().trim().regex(/^\d{6}$/)

const WRONG = 'Nesprávný e-mail nebo heslo'
const SLOW_DOWN = 'Moc pokusů za sebou. Počkejte minutu a zkuste to znovu.'
const BROKEN = 'Přihlášení teď nefunguje. Zkuste to prosím za chvíli.'

export async function signInAdmin(email: string, password: string): Promise<SignInOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }

  const parsed = CREDENTIALS.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: WRONG }

  const ip = await clientIp()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error || !data.user) {
    await recordAttempt(ip, false)
    if (error?.status === 429) return { ok: false, error: SLOW_DOWN }
    return { ok: false, error: WRONG }
  }

  // Cizí účet (třeba klient) nesmí v adminu nechat session ani na chvíli.
  if (!isAdminEmail(data.user.email)) {
    await supabase.auth.signOut({ scope: 'local' })
    await recordAttempt(ip, false)
    return { ok: false, error: WRONG }
  }

  await recordAttempt(ip, true)

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const needsCode = aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'
  return { ok: true, needsCode }
}

export async function verifyAdminCode(code: string): Promise<SignInOutcome> {
  const parsed = CODE.safeParse(code)
  if (!parsed.success) return { ok: false, error: 'Kód má šest číslic.' }

  const ip = await clientIp()
  const supabase = await createSupabaseServerClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp?.[0]
  if (!factor) return { ok: false, error: BROKEN }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data })
  if (error) {
    await recordAttempt(ip, false)
    if (error.status === 429) return { ok: false, error: SLOW_DOWN }
    return { ok: false, error: 'Kód nesouhlasí. Zkuste ten aktuální z aplikace.' }
  }

  await recordAttempt(ip, true)
  return { ok: true, needsCode: false }
}

export async function signOutAdmin(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect('/login')
}
