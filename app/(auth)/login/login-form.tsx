'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { signInAdmin, verifyAdminCode } from './actions'

const FIELD =
  'min-h-11 rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700'
const BUTTON =
  'mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-chip bg-navy-700 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-800 disabled:opacity-50'

export function LoginForm() {
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function done() {
    router.push('/dashboard')
    router.refresh()
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await signInAdmin(email, password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.needsCode) {
        setPassword('')
        setStep('code')
        return
      }
      done()
    })
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await verifyAdminCode(code)
      if (!res.ok) {
        setError(res.error)
        setCode('')
        return
      }
      done()
    })
  }

  return (
    <div className="bg-surface border border-navy-100 rounded-box p-8 shadow-sm">
      {step === 'password' ? (
        <>
          <h1 className="text-lg font-semibold text-ink mb-1">Přihlásit se</h1>
          <p className="text-sm text-quiet mb-6">Správa tvých zakázek</p>

          <form onSubmit={submitPassword} className="space-y-4">
            {error && <Chyba text={error} />}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="vas@email.cz"
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Heslo
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={FIELD}
              />
            </div>

            <button type="submit" disabled={isPending} className={BUTTON}>
              {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              Přihlásit se
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-ink mb-1">Kód z aplikace</h1>
          <p className="text-sm text-quiet mb-6">Otevřete ověřovací aplikaci a opište šestimístný kód.</p>

          <form onSubmit={submitCode} className="space-y-4">
            {error && <Chyba text={error} />}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm font-medium text-ink">
                Kód
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                placeholder="123456"
                className={`${FIELD} font-num tracking-[0.3em]`}
              />
            </div>

            <button type="submit" disabled={isPending || code.length !== 6} className={BUTTON}>
              {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              Pokračovat
            </button>
          </form>
        </>
      )}
    </div>
  )
}

function Chyba({ text }: { text: string }) {
  return (
    <div role="alert" className="text-sm text-danger bg-danger/5 border border-danger/30 rounded-chip px-4 py-3">
      {text}
    </div>
  )
}
