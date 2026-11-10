'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { authErrorMessage, passwordProblem, PASSWORD_HINT, MAX_PASSWORD_LENGTH } from '@/lib/auth/messages'
import { signOutEverywhere, type SignOutTarget } from '@/lib/auth/actions'
import { listTotpFactors, TotpEnroll, type TotpFactor } from './mfa'

// Přihlášení a zabezpečení účtu (R-081) — stejné pro Workspace, klientský
// prostor i admin: dvoufázové ověření, změna hesla s ověřením kódem z e-mailu,
// změna e-mailu s potvrzením na obou adresách a odhlášení ze všech zařízení.

type Props = {
  /** Kam po „Odhlásit všude“ (lib/auth/actions.ts). */
  signOutTarget: SignOutTarget
  email: string | null
  /** Admin: 2FA je povinné, poslední zařízení nejde odebrat. */
  requireFactor?: boolean
  /** Admin e-mail mění jen ADMIN_EMAIL v prostředí, ne formulář. */
  allowEmailChange?: boolean
  /** Kam se vrátit po potvrzení nového e-mailu. */
  returnPath: string
}

const card = 'flex flex-col gap-4 rounded-panel border border-navy-100 bg-surface p-6'
const heading = 'text-lg font-semibold tracking-[-0.01em] text-ink'

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>
  if (ok) return <p role="status" className="text-sm text-ink">{ok}</p>
  return null
}

const formatAdded = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })

function TwoFactorSection({ requireFactor }: { requireFactor: boolean }) {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setFactors(await listTotpFactors())
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }) ?? {}))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function remove(factor: TotpFactor) {
    if (!window.confirm(`Odebrat zařízení „${factor.friendly_name || 'Aplikace na kódy'}“? Kódy z něj přestanou platit.`)) return
    setBusy(factor.id)
    setError(null)
    setOk(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (removeError) {
        setError(authErrorMessage(removeError))
        return
      }
      await supabase.auth.refreshSession().catch(() => undefined)
      setOk('Zařízení jsme odebrali.')
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const count = factors?.length ?? 0
  return (
    <section aria-labelledby="sec-2fa" className={card}>
      <div>
        <h2 id="sec-2fa" className={heading}>Dvoufázové ověření</h2>
        <p className="mt-1 text-[15px] text-quiet">
          {count > 0
            ? 'Zapnuté. Při přihlášení zadáte kromě hesla i kód z aplikace v telefonu.'
            : 'Vypnuté. Se zapnutým ověřením se do účtu nikdo nedostane jen s vaším heslem.'}
        </p>
      </div>
      {factors === null && !error && <p className="text-sm text-quiet">Načítáme…</p>}
      {count > 0 && (
        <ul className="flex flex-col divide-y divide-navy-100 rounded-box border border-navy-100">
          {factors!.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-[15px] font-medium text-ink">{f.friendly_name || 'Aplikace na kódy'}</p>
                <p className="text-sm text-quiet">Přidáno {formatAdded(f.created_at)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => remove(f)}
                disabled={busy !== null || (requireFactor && count === 1)}
                title={requireFactor && count === 1 ? 'Do administrace je ověření povinné, poslední zařízení musí zůstat.' : undefined}
              >
                {busy === f.id ? 'Moment…' : 'Odebrat'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {requireFactor && count === 1 && (
        <p className="text-sm text-quiet">Přidejte si i druhé zařízení pro případ, že o telefon přijdete.</p>
      )}
      {adding ? (
        <TotpEnroll
          onDone={async () => {
            setAdding(false)
            setOk('Hotovo, ověření je zapnuté.')
            await reload()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        factors !== null && (
          <Button type="button" variant={count > 0 ? 'outline' : 'primary'} className="self-start" onClick={() => { setOk(null); setError(null); setAdding(true) }}>
            {count > 0 ? 'Přidat další zařízení' : 'Zapnout dvoufázové ověření'}
          </Button>
        )
      )}
      <Feedback error={error} ok={ok} />
    </section>
  )
}

function PasswordSection() {
  const [step, setStep] = useState<'idle' | 'code' | 'done'>('idle')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode() {
    setBusy(true)
    setError(null)
    try {
      const { error: sendError } = await createSupabaseBrowserClient().auth.reauthenticate()
      if (sendError) return setError(authErrorMessage(sendError))
      setStep('code')
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (!/^\d{6}$/.test(code.trim())) return setError('Opište šestimístný kód z e-mailu.')
    setBusy(true)
    setError(null)
    try {
      const { error: saveError } = await createSupabaseBrowserClient().auth.updateUser({ password, nonce: code.trim() })
      if (saveError) return setError(authErrorMessage(saveError))
      setStep('done')
      setPassword('')
      setCode('')
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="sec-heslo" className={card}>
      <div>
        <h2 id="sec-heslo" className={heading}>Heslo</h2>
        <p className="mt-1 text-[15px] text-quiet">Než heslo změníte, pošleme vám na e-mail kód. Tak ho nezmění nikdo, kdo má jen přístup k otevřenému počítači.</p>
      </div>
      {step === 'idle' && (
        <Button type="button" variant="outline" className="self-start" onClick={sendCode} disabled={busy}>
          {busy ? 'Moment…' : 'Změnit heslo'}
        </Button>
      )}
      {step === 'code' && (
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-code">Kód z e-mailu</Label>
            <Input id="sec-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-password">Nové heslo</Label>
            <Input id="sec-password" type="password" autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="sec-password-hint" />
            <p id="sec-password-hint" className="text-sm text-quiet">{PASSWORD_HINT}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? 'Moment…' : 'Uložit heslo'}</Button>
            <Button type="button" variant="ghost" onClick={sendCode} disabled={busy}>Poslat kód znovu</Button>
          </div>
        </form>
      )}
      <Feedback error={error} ok={step === 'done' ? 'Heslo je změněné.' : null} />
    </section>
  )
}

function EmailSection({ email, returnPath }: { email: string | null; returnPath: string }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = value.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return setError('Zkontrolujte prosím e-mail, něco v něm nesedí.')
    if (next === (email ?? '').toLowerCase()) return setError('Tohle je váš současný e-mail.')
    setBusy(true)
    setError(null)
    try {
      const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}`
      const { error: saveError } = await createSupabaseBrowserClient().auth.updateUser({ email: next }, { emailRedirectTo: redirect })
      if (saveError) return setError(authErrorMessage(saveError))
      setSent(next)
      setValue('')
    } catch {
      setError(authErrorMessage({}))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="sec-email" className={card}>
      <div>
        <h2 id="sec-email" className={heading}>E-mail</h2>
        <p className="mt-1 text-[15px] text-quiet">
          Teď: <span className="font-medium text-ink">{email ?? '—'}</span>. Změnu musíte potvrdit odkazem na původní i nové adrese.
        </p>
      </div>
      {sent ? (
        <p role="status" className="text-sm text-ink">
          Poslali jsme odkazy na {email} a {sent}. Změna platí, až kliknete na oba.
        </p>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="sec-new-email">Nový e-mail</Label>
            <Input id="sec-new-email" type="email" inputMode="email" autoComplete="email" maxLength={320} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>{busy ? 'Moment…' : 'Změnit e-mail'}</Button>
        </form>
      )}
      <Feedback error={error} ok={null} />
    </section>
  )
}

function SessionsSection({ target }: { target: SignOutTarget }) {
  return (
    <section aria-labelledby="sec-zarizeni" className={card}>
      <div>
        <h2 id="sec-zarizeni" className={heading}>Přihlášená zařízení</h2>
        <p className="mt-1 text-[15px] text-quiet">
          Odhlásí vás všude, i tady. Hodí se, když jste se přihlásili na cizím počítači nebo přišli o telefon.
        </p>
      </div>
      <form action={signOutEverywhere.bind(null, target)}>
        <Button type="submit" variant="danger">Odhlásit všechna zařízení</Button>
      </form>
    </section>
  )
}

export function SecuritySettings({ signOutTarget, email, requireFactor = false, allowEmailChange = true, returnPath }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <TwoFactorSection requireFactor={requireFactor} />
      <PasswordSection />
      {allowEmailChange && <EmailSection email={email} returnPath={returnPath} />}
      <SessionsSection target={signOutTarget} />
    </div>
  )
}
