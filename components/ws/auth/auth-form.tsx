'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { authErrorMessage, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordProblem } from '@/lib/auth/messages'
import { CAPTCHA_PENDING, Turnstile, turnstileSiteKey } from '@/components/auth/turnstile'

// Přihlášení, registrace a obnova hesla přes Supabase Auth (R-080) pro Workspace
// i klientský prostor. Formulář volá Supabase přímo z prohlížeče (rate limit
// Supabase tak platí pro IP člověka, ne serveru); session uloží do cookies a
// pak se celá stránka načte znovu, aby ji viděl server. R-081: Turnstile proti
// botům (token ověří Supabase), přísnější heslo, po přihlášení případně kód
// z aplikace (2FA) — ten si vyžádá server (requireIdentity / requireClient).

export type AuthPaths = {
  signIn: string
  signUp: string
  reset: string
  newPassword: string
}

export type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'new-password'

type Props = {
  mode: AuthMode
  paths: AuthPaths
  /** Kam po přihlášení / potvrzení e-mailu (už ověřené přes safeNextPath). */
  next: string
  /** Přihlášení přes Google (v Supabase musí být zapnutý poskytovatel). */
  google?: boolean
  /** Hláška z adresy, např. prošlý odkaz z e-mailu. */
  notice?: string | null
}

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(next)}`

const TITLES: Record<AuthMode, { title: string; lead: string }> = {
  'sign-in': { title: 'Přihlásit se', lead: 'Vítejte zpátky.' },
  'sign-up': { title: 'Vytvořit účet', lead: 'Stačí e-mail a heslo. Účet potvrdíte odkazem v e-mailu.' },
  reset: { title: 'Nové heslo', lead: 'Pošleme vám odkaz, přes který si nastavíte nové heslo.' },
  'new-password': { title: 'Nastavit heslo', lead: `Zvolte nové heslo: ${PASSWORD_HINT.toLowerCase()}` },
}

export function AuthForm({ mode, paths, next, google = false, notice = null }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(notice)
  /** E-mail odeslán (registrace, obnova hesla) — místo formuláře potvrzení. */
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  // Turnstile: token na jedno použití, po každém odeslání nový (resetKey).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const needsCaptcha = mode !== 'new-password' && Boolean(turnstileSiteKey())
  const captcha = () => (captchaToken ? { captchaToken } : {})

  const supabase = () => createSupabaseBrowserClient()

  async function run(task: () => Promise<{ error: { code?: string; status?: number } | null } | void>, usesCaptcha = false) {
    if (usesCaptcha && needsCaptcha && !captchaToken) {
      setError(CAPTCHA_PENDING)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await task()
      if (result && result.error) setError(authErrorMessage(result.error))
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
      if (usesCaptcha && needsCaptcha) {
        setCaptchaToken(null)
        setCaptchaReset((n) => n + 1)
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'sign-up' || mode === 'new-password') {
      const problem = passwordProblem(password)
      if (problem) {
        setError(problem)
        return
      }
    }
    await run(async () => {
      const client = supabase()
      if (mode === 'sign-in') {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password, options: captcha() })
        if (error) return { error }
        window.location.assign(next)
        return
      }
      if (mode === 'sign-up') {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callbackUrl(next), data: name.trim() ? { full_name: name.trim().slice(0, 200) } : {}, ...captcha() },
        })
        if (error) return { error }
        // Bez povinného potvrzení e-mailu vrátí Supabase session hned.
        if (data.session) {
          window.location.assign(next)
          return
        }
        setSentTo(email.trim())
        return
      }
      if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: callbackUrl(withNext(paths.newPassword, next)),
          ...captcha(),
        })
        if (error) return { error }
        setSentTo(email.trim())
        return
      }
      const { error } = await client.auth.updateUser({ password })
      if (error) return { error }
      window.location.assign(next)
    }, mode !== 'new-password')
  }

  async function onGoogle() {
    await run(async () => {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl(next) },
      })
      // Bez chyby prohlížeč odchází na Google, nic dalšího nedělat.
      if (error) return { error }
    })
  }

  async function onResend() {
    if (!sentTo) return
    await run(async () => {
      const { error } = await supabase().auth.resend({
        type: 'signup',
        email: sentTo,
        options: { emailRedirectTo: callbackUrl(next), ...captcha() },
      })
      if (error) return { error }
      setResent(true)
    }, true)
  }

  if (sentTo) {
    return (
      <div className="rounded-panel border border-navy-100 bg-surface px-6 py-8 sm:px-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Zkontrolujte e-mail</h1>
        <p className="mt-2 text-[15px] text-quiet">
          {mode === 'reset'
            ? `Pokud u nás máte účet s adresou ${sentTo}, poslali jsme na ni odkaz na nové heslo.`
            : `Poslali jsme odkaz na ${sentTo}. Klikněte na něj a budete přihlášení.`}
        </p>
        <p className="mt-2 text-sm text-quiet">Nic nepřišlo? Podívejte se i do složky Hromadné nebo Spam.</p>
        {mode === 'sign-up' && needsCaptcha && (
          <div className="mt-4">
            <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} action="znovu-poslat" />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {mode === 'sign-up' && (
            <Button type="button" variant="outline" onClick={onResend} disabled={busy || resent}>
              {resent ? 'Posláno znovu' : 'Poslat znovu'}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => { setSentTo(null); setResent(false); setError(null) }}>
            Změnit e-mail
          </Button>
        </div>
      </div>
    )
  }

  const { title, lead } = TITLES[mode]
  const needsEmail = mode !== 'new-password'
  const needsPassword = mode !== 'reset'

  return (
    <div className="rounded-panel border border-navy-100 bg-surface px-6 py-8 sm:px-8">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="mt-1 text-[15px] text-quiet">{lead}</p>

      {google && (mode === 'sign-in' || mode === 'sign-up') && (
        <>
          <Button type="button" variant="outline" className="mt-6 w-full" onClick={onGoogle} disabled={busy}>
            <GoogleMark />
            Pokračovat přes Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-sm text-quiet" aria-hidden="true">
            <span className="h-px flex-1 bg-navy-100" />
            nebo
            <span className="h-px flex-1 bg-navy-100" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={google && (mode === 'sign-in' || mode === 'sign-up') ? 'flex flex-col gap-4' : 'mt-6 flex flex-col gap-4'} noValidate>
        {mode === 'sign-up' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-name">Jméno</Label>
            <Input id="auth-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
        )}
        {needsEmail && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email">E-mail</Label>
            <Input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={320}
            />
          </div>
        )}
        {needsPassword && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="auth-password">{mode === 'new-password' ? 'Nové heslo' : 'Heslo'}</Label>
              {mode === 'sign-in' && (
                <Link href={withNext(paths.reset, next)} className="text-sm font-semibold text-navy-500 hover:text-navy-700">
                  Zapomněli jste heslo?
                </Link>
              )}
            </div>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'sign-in' ? undefined : MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={MAX_PASSWORD_LENGTH}
              aria-describedby={mode === 'sign-in' ? undefined : 'auth-password-hint'}
            />
            {mode !== 'sign-in' && (
              <p id="auth-password-hint" className="text-sm text-quiet">
                {PASSWORD_HINT}
              </p>
            )}
          </div>
        )}

        {needsCaptcha && <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} action={mode} />}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Moment…' : SUBMIT[mode]}
        </Button>
      </form>

      <p className="mt-6 text-sm text-quiet">
        {mode === 'sign-in' && (
          <>
            Nemáte účet?{' '}
            <Link href={withNext(paths.signUp, next)} className="font-semibold text-navy-500 hover:text-navy-700">
              Zaregistrujte se
            </Link>
          </>
        )}
        {mode === 'sign-up' && (
          <>
            Už účet máte?{' '}
            <Link href={withNext(paths.signIn, next)} className="font-semibold text-navy-500 hover:text-navy-700">
              Přihlaste se
            </Link>
          </>
        )}
        {mode === 'reset' && (
          <Link href={withNext(paths.signIn, next)} className="font-semibold text-navy-500 hover:text-navy-700">
            Zpět na přihlášení
          </Link>
        )}
        {mode === 'new-password' && (
          <a href={next} className="font-semibold text-navy-500 hover:text-navy-700">
            Pokračovat bez změny hesla
          </a>
        )}
      </p>
    </div>
  )
}

const SUBMIT: Record<AuthMode, string> = {
  'sign-in': 'Přihlásit se',
  'sign-up': 'Vytvořit účet',
  reset: 'Poslat odkaz',
  'new-password': 'Uložit heslo',
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
