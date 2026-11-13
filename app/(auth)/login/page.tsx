'use client'

import { useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (!res?.ok) {
        setError('Nesprávný e-mail nebo heslo')
        return
      }

      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-navy-600 to-navy-800 rounded-box flex items-center justify-center shadow-md mb-4">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-xl font-semibold text-navy-800 tracking-tight">ZakazIQ</span>
        </div>

        <div className="bg-surface border border-navy-100 rounded-box p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-ink mb-1">Přihlásit se</h1>
          <p className="text-sm text-quiet mb-6">Správa tvých zakázek</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-danger bg-danger/5 border border-danger/30 rounded-chip px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-quiet uppercase tracking-wide">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="vas@email.cz"
                className="border border-navy-100 rounded-chip px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-quiet uppercase tracking-wide">
                Heslo
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="border border-navy-100 rounded-chip px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 bg-navy-700 text-white text-sm font-medium py-2.5 rounded-chip shadow-sm hover:bg-navy-800 transition-colors disabled:opacity-50 mt-2"
            >
              {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              Přihlásit se
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
