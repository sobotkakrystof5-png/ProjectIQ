'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { isAdminEmail, supabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  PERMIT_METADATA_KEYS,
  WS_INVITE_METADATA_KEY,
  WS_SIGNUP_METADATA_KEY,
  wsInviteEmailByHash,
} from '@/lib/supabase/signup-hook'
import { getWsIdentity } from '@/lib/ws/context'
import { isUniqueViolation, wsSystem } from '@/lib/ws/db'
import { clientIp, hitLimit } from '@/lib/ws/intake/rate-limit'
import {
  generateSignupPermit,
  hashWsInviteCode,
  isWsInviteCodeShape,
  signupAddressDigest,
  signupPermitExpiry,
  WsInviteConfigError,
} from '@/lib/ws/invite'
import {
  safeWsNext,
  WS_AUTH_CALLBACK_PATH,
  WS_INVITE_PATH,
  WS_NEW_PASSWORD_PATH,
  WS_ONBOARDING_PATH,
  WS_SIGN_IN_PATH,
  WS_SIGNUP_OPEN,
} from '@/lib/ws/paths'

// Přihlášení do Workspace přes Supabase Auth (R-154, dřív Clerk). Stejně jako
// klientský prostor (R-107) běží všechno na serveru — prohlížeč na Supabase
// nesahá, CSP se nemění. Je to tentýž účet jako v klientském prostoru: kdo má
// přístup tam, přihlásí se stejným e-mailem i sem.
//
// Hlášky schválně neříkají, co přesně bylo špatně (neznámý e-mail × heslo ×
// prošlá pozvánka), aby nešlo zkoušet, co existuje. Admin se tudy nepřihlašuje
// kódem ani si neobnovuje heslo — jeho vstup je /login s druhým faktorem.

export type AuthOutcome = { ok: true } | { ok: false; error: string }

const WRONG = 'Nesprávný e-mail nebo heslo.'
const WRONG_CODE = 'Kód nesedí nebo už vypršel. Zkontrolujte ho, případně si pošlete nový.'
const BROKEN = 'Přihlášení teď nefunguje. Zkuste to prosím za chvíli.'
const SLOW_DOWN = 'Moc pokusů za sebou. Počkejte minutu a zkuste to znovu.'
const INVALID_INVITE = 'Pozvánka už neplatí. Napište nám a pošleme novou.'
const WEAK = 'Heslo je moc snadné. Zkuste delší nebo méně obvyklé.'
const CLOSED = 'Registrace zatím není otevřená. Napište nám a přístup vám rádi připravíme.'

// Supabase volá náš server, takže jeho vlastní limity vidí jen IP Vercelu. Proto
// i tady: na IP člověka (proti zahlcení) a na e-mail (proti zkoušení hesla nebo
// kódu jednoho účtu z mnoha adres). Klíče jsou HMAC, čitelně se nic neukládá.
const LIMIT_CODE_PER_IP = { name: 'ws-auth-code-ip', max: 10, windowSec: 600 }
const LIMIT_PASSWORD_PER_IP = { name: 'ws-auth-pass-ip', max: 20, windowSec: 600 }
const LIMIT_PER_EMAIL = { name: 'ws-auth-email', max: 10, windowSec: 600 }
const LIMIT_SIGNUP_PER_IP = { name: 'ws-signup-ip', max: 5, windowSec: 3600 }

const emailSchema = z.string().trim().toLowerCase().email().max(320)
const passwordSchema = z
  .string()
  .min(10, 'Heslo musí mít aspoň 10 znaků.')
  .max(200, 'Heslo může mít nejvýše 200 znaků.')
const nameSchema = z.string().trim().max(200, 'Jméno může mít nejvýše 200 znaků.')
const codeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^[0-9]{6,10}$/))

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
}

const callbackUrl = (next: string): string => `${appUrl()}${WS_AUTH_CALLBACK_PATH}?next=${encodeURIComponent(safeWsNext(next))}`

async function tooManyFromIp(limit: { name: string; max: number; windowSec: number }, email?: string): Promise<boolean> {
  try {
    if (await hitLimit(limit, clientIp(await headers()))) return true
    return email ? await hitLimit(LIMIT_PER_EMAIL, email) : false
  } catch (err) {
    // Výpadek počítadla nesmí zablokovat přihlášení; Supabase má vlastní limity.
    console.error('[ws/auth] počítadlo pokusů selhalo:', err instanceof Error ? err.name : 'unknown')
    return false
  }
}

/** Otisky oprávnění z metadat už k ničemu nejsou; ať v profilu nezůstávají. */
async function clearPermitMetadata(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const data = Object.fromEntries(PERMIT_METADATA_KEYS.map((k) => [k, null]))
  await supabase.auth.updateUser({ data }).catch(() => undefined)
}

// --- Přihlášení heslem --------------------------------------------------------

export async function signInWithPassword(email: string, password: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  if (!e.success || typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return { ok: false, error: WRONG }
  }
  if (await tooManyFromIp(LIMIT_PASSWORD_PER_IP, e.data)) return { ok: false, error: SLOW_DOWN }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email: e.data, password })
  if (error) return { ok: false, error: error.status === 429 ? SLOW_DOWN : WRONG }
  return { ok: true }
}

// --- Přihlášení kódem z e-mailu (bez hesla) ------------------------------------

/**
 * Pošle jednorázový kód na e-mail. Jen existujícím účtům (`shouldCreateUser: false`)
 * a odpověď je vždy stejná, ať e-mail známe, nebo ne. E-mail posílá Supabase
 * přes vlastní SMTP (Resend); šablona „Magic Link" nese kód i odkaz.
 */
export async function sendSignInCode(email: string, next: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  if (!e.success) return { ok: false, error: 'Zadejte prosím platný e-mail.' }
  if (await tooManyFromIp(LIMIT_CODE_PER_IP)) return { ok: false, error: SLOW_DOWN }
  if (isAdminEmail(e.data)) return { ok: true }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: e.data,
    options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(next) },
  })
  if (error?.status === 429) return { ok: false, error: SLOW_DOWN }
  // Neznámý e-mail Supabase odmítne — navenek stejná odpověď jako úspěch.
  if (error && error.code !== 'otp_disabled' && error.code !== 'user_not_found') {
    console.error('[ws/auth] kód se neodeslal:', error.code ?? error.name)
  }
  return { ok: true }
}

/** Ověří kód z e-mailu a přihlásí. Stejná funkce dokončí i registraci. */
export async function verifyEmailCode(email: string, code: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  const c = codeSchema.safeParse(code)
  if (!e.success || !c.success) return { ok: false, error: WRONG_CODE }
  if (await tooManyFromIp(LIMIT_CODE_PER_IP, e.data)) return { ok: false, error: SLOW_DOWN }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.verifyOtp({ email: e.data, token: c.data, type: 'email' })
  if (error || !data.session) return { ok: false, error: error?.status === 429 ? SLOW_DOWN : WRONG_CODE }

  // Registrace je dokončená — povolení už nepotřebujeme.
  try {
    await wsSystem`DELETE FROM ws.signup_permits WHERE address_digest = ${signupAddressDigest(e.data)}`
  } catch {
    // Bez pepře nebo bez tabulky nic k mazání; denní úklid vyřeší zbytek.
  }
  await clearPermitMetadata()
  return { ok: true }
}

// --- Registrace (jen když je otevřená) -----------------------------------------

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Napište prosím své jméno.').max(200),
  email: emailSchema,
  /** Past na roboty: člověk pole nevidí a nechá ho prázdné. */
  website: z.string().max(200).optional(),
})

/**
 * Začne registraci: uloží krátké povolení (hook Supabase podle něj účet pustí)
 * a pošle kód na e-mail. Účet vznikne až ověřením kódu, takže cizí adresou se
 * nikdo nezaregistruje. Existující účet dostane obyčejný přihlašovací kód.
 */
export async function startSignup(raw: unknown): Promise<AuthOutcome> {
  if (!WS_SIGNUP_OPEN) return { ok: false, error: CLOSED }
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím jméno a e-mail.' }
  const { name, email, website } = parsed.data
  // Robot dostane stejnou odpověď jako člověk, jen se nic neodešle.
  if (website) return { ok: true }
  if (await tooManyFromIp(LIMIT_SIGNUP_PER_IP)) return { ok: false, error: SLOW_DOWN }
  if (isAdminEmail(email)) return { ok: true }

  let permit: string
  try {
    permit = generateSignupPermit()
    await wsSystem`DELETE FROM ws.signup_permits WHERE expires_at < now() - interval '1 day'`
    await wsSystem`
      INSERT INTO ws.signup_permits (code_hash, address_digest, expires_at)
      VALUES (${permit}, ${signupAddressDigest(email)}, ${signupPermitExpiry()})
    `
  } catch (err) {
    if (!(err instanceof WsInviteConfigError)) {
      console.error('[ws/auth] povolení k registraci se neuložilo:', err instanceof Error ? err.name : 'unknown')
    }
    return { ok: false, error: BROKEN }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { name, [WS_SIGNUP_METADATA_KEY]: permit },
      emailRedirectTo: callbackUrl(WS_ONBOARDING_PATH),
    },
  })
  if (error?.status === 429) return { ok: false, error: SLOW_DOWN }
  if (error) {
    console.error('[ws/auth] registrační kód se neodeslal:', error.code ?? error.name)
    return { ok: false, error: BROKEN }
  }
  return { ok: true }
}

// --- Pozvánka vlastníka od admina (S17) ----------------------------------------

/**
 * Založí přístup z pozvánky: e-mail je ten, na který pozvánka zní (nikdy
 * z formuláře), heslo si klient zvolí. Hook pustí účet jen s otiskem platné
 * pozvánky; pak se pozvánka hned uplatní a průvodce pokračuje předplatným.
 */
export async function createAccountFromWsInvite(code: string, name: string, password: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  if (!isWsInviteCodeShape(code)) return { ok: false, error: INVALID_INVITE }
  const p = passwordSchema.safeParse(password)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const n = nameSchema.safeParse(name)
  if (!n.success) return { ok: false, error: n.error.issues[0].message }
  if (await tooManyFromIp(LIMIT_PASSWORD_PER_IP)) return { ok: false, error: SLOW_DOWN }

  let hash: string
  let email: string | null
  try {
    hash = hashWsInviteCode(code)
    email = await wsInviteEmailByHash(hash)
  } catch (err) {
    if (!(err instanceof WsInviteConfigError)) {
      console.error('[ws/auth] ověření pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
    return { ok: false, error: BROKEN }
  }
  if (!email) return { ok: false, error: INVALID_INVITE }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: p.data,
    options: { data: { name: n.data || null, [WS_INVITE_METADATA_KEY]: hash } },
  })
  if (error) {
    if (error.code === 'user_already_exists') {
      return { ok: false, error: 'Tenhle e-mail už přístup má, třeba do klientského prostoru. Přihlaste se a pozvánku přijměte.' }
    }
    if (error.code === 'weak_password') return { ok: false, error: WEAK }
    if (error.status === 429) return { ok: false, error: SLOW_DOWN }
    console.error('[ws/auth] založení přístupu selhalo:', error.code ?? error.name)
    return { ok: false, error: BROKEN }
  }
  if (!data.user || !data.session) {
    return { ok: false, error: 'Poslali jsme vám e-mail s potvrzením. Po potvrzení se přihlaste a pozvánku přijměte.' }
  }

  const result = await redeemWsInvite(hash, data.user.id, email, n.data || null)
  await clearPermitMetadata()
  if (result !== 'ok') return { ok: false, error: result === 'owns_other' ? OWNS_OTHER : INVALID_INVITE }
  redirect(WS_ONBOARDING_PATH)
}

const OWNS_OTHER = 'Tenhle e-mail už vlastní jiný účet ZakazIQ. Napište nám a domluvíme se, co s tím.'

/** Přihlášený člověk přijme pozvánku. E-mail se bere ze session, ne z formuláře. */
export async function acceptWsInvite(code: string): Promise<AuthOutcome> {
  const identity = await getWsIdentity()
  if (!identity) redirect(`${WS_SIGN_IN_PATH}?next=${encodeURIComponent(`${WS_INVITE_PATH}/${code}`)}`)
  if (!isWsInviteCodeShape(code) || !identity.email) return { ok: false, error: INVALID_INVITE }

  let result: RedeemResult = 'invalid'
  try {
    result = await redeemWsInvite(hashWsInviteCode(code), identity.userId, identity.email, null)
  } catch (err) {
    if (!(err instanceof WsInviteConfigError)) {
      console.error('[ws/auth] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    }
  }
  if (result === 'owns_other') return { ok: false, error: OWNS_OTHER }
  if (result !== 'ok') return { ok: false, error: INVALID_INVITE }
  redirect(WS_ONBOARDING_PATH)
}

type RedeemResult = 'ok' | 'invalid' | 'owns_other'

async function redeemWsInvite(hash: string, userId: string, email: string, name: string | null): Promise<RedeemResult> {
  try {
    const [row] = await wsSystem<{ a: string | null }>`
      SELECT ws.redeem_account_invite(${hash}, ${userId}, ${email}, ${name}) AS a
    `
    return row?.a ? 'ok' : 'invalid'
  } catch (err) {
    if (isUniqueViolation(err)) return 'owns_other'
    console.error('[ws/auth] uplatnění pozvánky selhalo:', err instanceof Error ? err.name : 'unknown')
    return 'invalid'
  }
}

// --- Heslo a odhlášení ----------------------------------------------------------

/** Odkaz na změnu hesla. Odpověď je vždy stejná, ať e-mail existuje, nebo ne. */
export async function requestWsPasswordReset(email: string): Promise<AuthOutcome> {
  if (!supabaseConfigured()) return { ok: false, error: BROKEN }
  const e = emailSchema.safeParse(email)
  if (!e.success) return { ok: false, error: 'Zadejte prosím platný e-mail.' }
  if (await tooManyFromIp(LIMIT_CODE_PER_IP)) return { ok: false, error: SLOW_DOWN }
  if (!isAdminEmail(e.data)) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.resetPasswordForEmail(e.data, { redirectTo: callbackUrl(WS_NEW_PASSWORD_PATH) })
    if (error?.status === 429) return { ok: false, error: SLOW_DOWN }
    if (error) console.error('[ws/auth] odkaz na nové heslo selhal:', error.code ?? error.name)
  }
  return { ok: true }
}

/** Nové heslo po odkazu z e-mailu, nebo první heslo u účtu, který vznikl kódem. */
export async function setWsPassword(password: string): Promise<AuthOutcome> {
  const identity = await getWsIdentity()
  if (!identity) return { ok: false, error: 'Odkaz už neplatí. Požádejte o nový.' }
  if (isAdminEmail(identity.email)) return { ok: false, error: BROKEN }
  const p = passwordSchema.safeParse(password)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: p.data })
  if (error) {
    if (error.code === 'weak_password') return { ok: false, error: WEAK }
    if (error.code === 'same_password') return { ok: false, error: 'Nové heslo musí být jiné než to staré.' }
    if (error.code === 'reauthentication_needed') {
      return { ok: false, error: 'Kvůli bezpečnosti se prosím odhlaste, přihlaste znovu a heslo změňte hned potom.' }
    }
    return { ok: false, error: BROKEN }
  }
  return { ok: true }
}

/** Odhlášení. `everywhere` odhlásí i ostatní zařízení (ztracený telefon). */
export async function signOutWorkspace(everywhere: unknown = false): Promise<never> {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: everywhere === true ? 'global' : 'local' })
  }
  redirect(everywhere === true ? `${WS_SIGN_IN_PATH}?odhlaseno=vsude` : '/')
}
