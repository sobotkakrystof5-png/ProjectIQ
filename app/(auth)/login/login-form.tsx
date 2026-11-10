'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { authErrorMessage } from '@/lib/auth/messages'
import { CAPTCHA_PENDING, Turnstile, turnstileSiteKey } from '@/components/auth/turnstile'
import { confirmAdminSignIn } from './actions'

// Přihlášení admina e-mailem a heslem přes Supabase Auth (R-080). Po přihlášení
// server ověří, že jde o admin účet; jiný účet rovnou odhlásí. Pak druhý krok:
// kód z aplikace na /login/overeni (R-081). Proti botům Turnstile.
export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (turnstileSiteKey() && !captchaToken) {
      setError(CAPTCHA_PENDING)
      return
    }

    startTransition(async () => {
      try {
        const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithPassword({
          email: email.trim(),
          password,
          options: captchaToken ? { captchaToken } : undefined,
        })
        setCaptchaToken(null)
        setCaptchaReset((n) => n + 1)
        if (signInError) {
          setError(signInError.code === 'invalid_credentials' ? 'Nesprávný e-mail nebo heslo' : authErrorMessage(signInError))
          return
        }
        const result = await confirmAdminSignIn()
        if (!result.ok) {
          setError(result.error)
          return
        }
        window.location.assign(`/login/overeni?next=${encodeURIComponent(next)}`)
      } catch {
        setError(authErrorMessage({}))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          E-mail
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="vas@email.cz"
          className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow bg-white"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Heslo
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow bg-white"
        />
      </div>

      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} action="admin-prihlaseni" />

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 brand-gradient text-white text-sm font-medium py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
      >
        {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
        Přihlásit se
      </button>
    </form>
  )
}
