'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { authErrorMessage } from '@/lib/auth/messages'

// Dvoufázové ověření kódem z aplikace (TOTP, R-081) přes Supabase Auth MFA.
// Volá Supabase přímo z prohlížeče (connect-src v CSP). Po ověření kódu má
// relace úroveň aal2 — podle ní server pouští admina (povinně) a Workspace /
// klientský prostor (pokud si 2FA člověk zapnul).

export type TotpFactor = { id: string; friendly_name?: string | null; created_at: string }

const sanitizeCode = (value: string) => value.replace(/\D/g, '').slice(0, 6)
const isCode = (value: string) => /^\d{6}$/.test(value)
const go = (url: string) => window.location.assign(url)

/** Ověřené TOTP faktory přihlášeného člověka. */
export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await createSupabaseBrowserClient().auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? []).filter((f) => f.status === 'verified')
}

function CodeField({ id, value, onChange, autoFocus = false }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Kód z aplikace</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="123456"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(sanitizeCode(e.target.value))}
        className="font-mono text-lg tracking-[0.3em]"
      />
    </div>
  )
}

function ErrorText({ children }: { children: string | null }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}

/** Klíč po čtveřicích, ať se dá opsat. */
const groupSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

/**
 * Nové zařízení pro kódy: QR kód (nebo ruční klíč) a ověření prvním kódem.
 * Teprve ověřený faktor platí; nedokončené pokusy se před novým uklidí.
 */
export function TotpEnroll({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const stamp = new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'medium' })
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'ZakazIQ',
        friendlyName: `Aplikace (${stamp})`,
      })
      if (enrollError || !data) {
        setError(authErrorMessage(enrollError ?? {}))
        return
      }
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })().catch(() => setError(authErrorMessage({})))
  }, [])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!factor) return
    if (!isCode(code)) {
      setError('Opište šestimístný kód z aplikace.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: verifyError } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code })
      if (verifyError) {
        setError(authErrorMessage(verifyError))
        setCode('')
        return
      }
      onDone()
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (factor) await createSupabaseBrowserClient().auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined)
    onCancel?.()
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] text-ink">
        <li>
          V telefonu otevřete aplikaci na kódy (Google Authenticator, Microsoft Authenticator, 1Password…) a naskenujte QR kód.
        </li>
        <li>Opište šestimístný kód, který vám aplikace ukáže.</li>
      </ol>
      {factor ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL z Supabase, next/image ho nezpracuje */}
          <img src={factor.qr} alt="QR kód pro aplikaci na kódy" width={176} height={176} className="rounded-box border border-navy-100 bg-white p-2" />
          <div className="text-sm text-quiet">
            Nejde naskenovat? Zadejte do aplikace klíč:
            <code className="mt-1 block break-all rounded-chip bg-navy-50 px-2 py-1 font-mono text-[13px] text-ink">{groupSecret(factor.secret)}</code>
          </div>
        </div>
      ) : (
        !error && <p className="text-sm text-quiet">Připravujeme QR kód…</p>
      )}
      <CodeField id="mfa-enroll-code" value={code} onChange={setCode} />
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !factor}>
          {busy ? 'Moment…' : 'Ověřit a zapnout'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
            Zrušit
          </Button>
        )}
      </div>
    </form>
  )
}

/** Ověření kódem z už nastavené aplikace. Víc zařízení = výběr. */
export function TotpChallenge({ factors, onDone }: { factors: TotpFactor[]; onDone: () => void }) {
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!isCode(code)) {
      setError('Opište šestimístný kód z aplikace.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: verifyError } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code })
      if (verifyError) {
        setError(authErrorMessage(verifyError))
        setCode('')
        return
      }
      onDone()
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      {factors.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Které zařízení máte po ruce?</legend>
          {factors.map((f) => (
            <label key={f.id} className="flex min-h-[44px] items-center gap-2 text-[15px] text-ink">
              <input type="radio" name="mfa-factor" value={f.id} checked={factorId === f.id} onChange={() => setFactorId(f.id)} />
              {f.friendly_name || 'Aplikace na kódy'}
            </label>
          ))}
        </fieldset>
      )}
      <CodeField id="mfa-code" value={code} onChange={setCode} autoFocus />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Moment…' : 'Ověřit'}
      </Button>
    </form>
  )
}

/**
 * Krok po přihlášení heslem / Googlem (R-081). Už ověřená relace jde rovnou
 * na `next`. Kdo má aplikaci nastavenou, opíše kód. Kdo ne:
 * `enroll="required"` (admin) si ji musí nastavit hned, `enroll="never"`
 * (Workspace, klientský prostor — 2FA je volitelné) pokračuje dál.
 */
export function MfaGate({ next, enroll, signOut }: { next: string; enroll: 'required' | 'never'; signOut: React.ReactNode }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'challenge'; factors: TotpFactor[] } | { kind: 'enroll' } | { kind: 'error'; message: string }>({ kind: 'loading' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (level?.currentLevel === 'aal2') return go(next)
      const factors = await listTotpFactors()
      if (factors.length > 0) return setState({ kind: 'challenge', factors })
      if (enroll === 'required') return setState({ kind: 'enroll' })
      go(next)
    })().catch((e: { code?: string; status?: number }) => setState({ kind: 'error', message: authErrorMessage(e ?? {}) }))
  }, [next, enroll])

  return (
    <div className="rounded-panel border border-navy-100 bg-surface px-6 py-8 sm:px-8">
      {state.kind === 'enroll' ? (
        <>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Zapněte dvoufázové ověření</h1>
          <p className="mb-5 mt-1 text-[15px] text-quiet">
            Do administrace se přihlašujete heslem a kódem z aplikace v telefonu. Nastavíte to jednou, zabere to minutu.
          </p>
          <TotpEnroll onDone={() => go(next)} />
        </>
      ) : (
        <>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Ověření přihlášení</h1>
          <p className="mb-5 mt-1 text-[15px] text-quiet">Opište šestimístný kód z aplikace na kódy v telefonu.</p>
          {state.kind === 'challenge' && <TotpChallenge factors={state.factors} onDone={() => go(next)} />}
          {state.kind === 'loading' && <p className="text-sm text-quiet">Moment…</p>}
          {state.kind === 'error' && <ErrorText>{state.message}</ErrorText>}
        </>
      )}
      <div className="mt-6 border-t border-navy-100 pt-4 text-sm text-quiet">
        Nemáte telefon u sebe? {signOut}
      </div>
    </div>
  )
}
