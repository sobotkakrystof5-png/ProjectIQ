'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { hashInviteCode, isInviteCodeShape, InviteConfigError } from '@/lib/portal/invite'
import { portalSystem } from '@/lib/portal/db'
import { getPortalIdentity } from '@/lib/portal/context'
import {
  PORTAL_AUTH_CALLBACK_PATH,
  PORTAL_HOME_PATH,
  PORTAL_INVITE_PATH,
  PORTAL_NEW_PASSWORD_PATH,
  PORTAL_SIGN_IN_PATH,
} from '@/lib/portal/paths'
import { isAdminEmail, supabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { INVITE_METADATA_KEY, inviteEmailByHash } from '@/lib/supabase/signup-hook'

// Přihlášení a pozvánky klientského prostoru (KP05, od R-107 přes Supabase Auth).
// Všechno běží na serveru — prohlížeč na Supabase nesahá, CSP se nemění.
// Chybové hlášky schválně neříkají, co přesně bylo špatně (neznámý e-mail ×
// heslo × prošlá pozvánka), aby nešlo zkoušet, co existuje.

export type AuthOutcome = { ok: true } | { ok: false; error: string }

const WRONG = 'Nesprávný e-mail nebo heslo.'
const BROKEN = 'Přihlášení teď nefunguje. Zkuste to prosím za chvíli.'
const SLOW_DOWN = 'Moc pokusů za sebou. Počkejte chvíli a zkuste to znovu.'
const INVALID_INVITE = 'Pozvánka už neplatí. Napište nám a pošleme novou.'
const WEAK = 'Heslo je moc snadné. Zkuste delší nebo méně obvyklé.'

const emailSchema = z.string().trim().toLowerCase().email().max(320)
const passwordSchema = z
  .string()
  .min(10, 'Heslo musí mít aspoň 10 znaků.')
  .max(200, 'Heslo může mít nejvýše 200 znaků.')
const nameSchema = z.string().trim().max(200, 'Jméno může mít nejvýše 200 znaků.')

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
}

export async function signInClient(email: string, password: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  if (!e.success || typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return { ok: false, error: WRONG }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email: e.data, password })
  if (error) return { ok: false, error: error.status === 429 ? SLOW_DOWN : WRONG }
  return { ok: true }
}

/**
 * Založí přístup z pozvánky: e-mail je ten, na který je pozvánka vázaná (nikdy
 * z formuláře), heslo si klient zvolí. Hook Supabase (`lib/supabase/signup-hook.ts`)
 * účet pustí jen s otiskem platné pozvánky; pak se pozvánka hned uplatní.
 */
export async function createAccountFromInvite(code: string, name: string, password: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  if (!isInviteCodeShape(code)) return { ok: false, error: INVALID_INVITE }
  const p = passwordSchema.safeParse(password)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const n = nameSchema.safeParse(name)
  if (!n.success) return { ok: false, error: n.error.issues[0].message }

  let hash: string
  let email: string | null
  try {
    hash = hashInviteCode(code)
    email = await inviteEmailByHash(hash)
  } catch (err) {
    if (!(err instanceof InviteConfigError)) {
      console.error('[klient] ověření pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
    return { ok: false, error: BROKEN }
  }
  if (!email) return { ok: false, error: INVALID_INVITE }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: p.data,
    options: { data: { name: n.data || null, [INVITE_METADATA_KEY]: hash } },
  })
  if (error) {
    if (error.code === 'user_already_exists') {
      return { ok: false, error: 'Tenhle e-mail už přístup má. Přihlaste se a pozvánku přijměte.' }
    }
    if (error.code === 'weak_password') return { ok: false, error: WEAK }
    if (error.status === 429) return { ok: false, error: SLOW_DOWN }
    console.error('[klient] založení přístupu selhalo:', error.code ?? error.name)
    return { ok: false, error: BROKEN }
  }
  if (!data.user || !data.session) {
    // Supabase čeká na potvrzení e-mailu (Confirm email zapnuté). Pozvánka zůstává
    // nevyužitá a přijme se po prvním přihlášení.
    return { ok: false, error: 'Poslali jsme vám e-mail s potvrzením. Po potvrzení se přihlaste a pozvánku přijměte.' }
  }

  const clientId = await redeem(hash, data.user.id, email, n.data || null)
  // Otisk pozvánky už k ničemu není; ať v profilu nezůstává.
  await supabase.auth.updateUser({ data: { [INVITE_METADATA_KEY]: null } }).catch(() => undefined)
  if (!clientId) return { ok: false, error: INVALID_INVITE }
  redirect(PORTAL_HOME_PATH)
}

/** Přihlášený člověk přijme pozvánku. E-mail se bere ze session, ne z formuláře. */
export async function acceptInvite(code: string): Promise<never> {
  const identity = await getPortalIdentity()
  if (!identity) redirect(`${PORTAL_SIGN_IN_PATH}?next=${encodeURIComponent(`${PORTAL_INVITE_PATH}/${code}`)}`)
  if (!isInviteCodeShape(code) || !identity.email) redirect(`${PORTAL_INVITE_PATH}/neplatna`)

  let clientId: string | null = null
  try {
    clientId = await redeem(hashInviteCode(code), identity.userId, identity.email, null)
  } catch (err) {
    if (!(err instanceof InviteConfigError)) {
      console.error('[klient] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
  }
  redirect(clientId ? PORTAL_HOME_PATH : `${PORTAL_INVITE_PATH}/neplatna`)
}

async function redeem(hash: string, userId: string, email: string, name: string | null): Promise<string | null> {
  try {
    const rows = await portalSystem<{ c: string | null }>`
      SELECT portal.redeem_invite(${hash}, ${userId}, ${email}, ${name}) AS c
    `
    return rows[0]?.c ?? null
  } catch (err) {
    console.error('[klient] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    return null
  }
}

export async function signOutClient(): Promise<never> {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect(PORTAL_SIGN_IN_PATH)
}

/**
 * Odkaz na změnu hesla. Odpověď je vždy stejná, ať e-mail existuje, nebo ne.
 * Admin si heslo tudy neobnoví — jeho účet se klientského prostoru netýká.
 * E-mail posílá Supabase, takže to funguje jen s vlastním SMTP v projektu
 * (`docs/AUTH-SUPABASE-PLAN.md` → Nastavení).
 */
export async function requestPasswordReset(email: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  if (!e.success) return { ok: false, error: 'Zadejte prosím platný e-mail.' }
  if (!isAdminEmail(e.data)) {
    const supabase = await createSupabaseServerClient()
    const redirectTo = `${appUrl()}${PORTAL_AUTH_CALLBACK_PATH}?next=${encodeURIComponent(PORTAL_NEW_PASSWORD_PATH)}`
    const { error } = await supabase.auth.resetPasswordForEmail(e.data, { redirectTo })
    if (error?.status === 429) return { ok: false, error: SLOW_DOWN }
    if (error) console.error('[klient] odkaz na nové heslo selhal:', error.code ?? error.name)
  }
  return { ok: true }
}

export async function setNewPassword(password: string): Promise<AuthOutcome> {
  const identity = await getPortalIdentity()
  if (!identity) return { ok: false, error: 'Odkaz už neplatí. Požádejte o nový.' }
  if (isAdminEmail(identity.email)) return { ok: false, error: BROKEN }
  const p = passwordSchema.safeParse(password)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: p.data })
  if (error) {
    if (error.code === 'weak_password') return { ok: false, error: WEAK }
    if (error.code === 'same_password') return { ok: false, error: 'Nové heslo musí být jiné než to staré.' }
    return { ok: false, error: BROKEN }
  }
  return { ok: true }
}
