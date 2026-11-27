'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  acceptWsInvite,
  createAccountFromWsInvite,
  requestWsPasswordReset,
  sendSignInCode,
  setWsPassword,
  signInWithPassword,
  startSignup,
  verifyEmailCode,
} from '@/app/w/auth-actions'
import { WS_FORGOT_PATH, WS_HOME_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { cn } from '@/lib/ws/utils'

// Formuláře přihlášení Workspace (R-154). Odesílají server actions, prohlížeč
// na Supabase nesahá. Dva způsoby přihlášení: heslem, nebo kódem z e-mailu
// (bez hesla — nic, co by šlo zapomenout). Vzhled podle Dílků jako klientský prostor.

const FIELD =
  'min-h-11 w-full rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-[15px] text-ink transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700'
const BUTTON =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-chip bg-navy-700 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-50'
const CARD = 'rounded-box border border-navy-100 bg-surface p-6'
const LINK = 'inline-flex min-h-11 items-center text-sm font-medium text-navy-700 underline-offset-4 hover:underline'

function Chyba({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-chip bg-danger/10 px-3 py-2 text-sm text-danger">
      {text}
    </p>
  )
}

function Pole(props: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  hint?: string
  autoFocus?: boolean
  required?: boolean
  inputMode?: 'numeric' | 'email' | 'text'
  maxLength?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-ink">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.id}
        type={props.type}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required ?? true}
        autoFocus={props.autoFocus}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        className={FIELD}
      />
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-xs text-quiet">
          {props.hint}
        </p>
      )}
    </div>
  )
}

function Odeslat({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className={BUTTON}>
      {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/** Krok s opsáním kódu z e-mailu (přihlášení i registrace). */
function CodeStep({ email, onDone, onBack, resend }: { email: string; onDone: () => void; onBack: () => void; resend: () => Promise<string | null> }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    start(async () => {
      const res = await verifyEmailCode(email, code)
      if (!res.ok) setError(res.error)
      else onDone()
    })
  }

  function again() {
    setError(null)
    start(async () => {
      const failed = await resend()
      if (failed) setError(failed)
      else setInfo('Poslali jsme nový kód.')
    })
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-quiet" role="status">
        Na <strong className="font-semibold text-ink">{email}</strong> jsme poslali kód. Opište ho sem.
      </p>
      {error && <Chyba text={error} />}
      {info && (
        <p role="status" className="text-sm text-quiet">
          {info}
        </p>
      )}
      <Pole
        id="code"
        label="Kód z e-mailu"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
        value={code}
        onChange={setCode}
        autoFocus
        hint="E-mail nepřišel? Mrkněte do hromadné pošty nebo spamu."
      />
      <Odeslat pending={pending}>Pokračovat</Odeslat>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" onClick={again} disabled={pending} className={LINK}>
          Poslat kód znovu
        </button>
        <button type="button" onClick={onBack} disabled={pending} className={LINK}>
          Jiný e-mail
        </button>
      </div>
    </form>
  )
}

type Mode = 'heslo' | 'kod'

export function WsSignInForm({ next, notice = null }: { next: string; notice?: string | null }) {
  const [mode, setMode] = useState<Mode>('heslo')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const done = () => {
    router.push(next)
    router.refresh()
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await signInWithPassword(email, password)
      if (!res.ok) setError(res.error)
      else done()
    })
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await sendSignInCode(email, next)
      if (!res.ok) setError(res.error)
      else setCodeSentTo(email.trim().toLowerCase())
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">Přihlášení do ZakazIQ</h1>
      {notice && (
        <p role="status" className="mt-2 text-sm text-quiet">
          {notice}
        </p>
      )}

      {codeSentTo ? (
        <CodeStep
          email={codeSentTo}
          onDone={done}
          onBack={() => setCodeSentTo(null)}
          resend={async () => {
            const res = await sendSignInCode(codeSentTo, next)
            return res.ok ? null : res.error
          }}
        />
      ) : (
        <>
          <div role="group" aria-label="Způsob přihlášení" className="mt-5 grid grid-cols-2 gap-1 rounded-chip bg-navy-50 p-1">
            {(
              [
                ['heslo', 'Heslem'],
                ['kod', 'Kódem z e-mailu'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key)
                  setError(null)
                }}
                className={cn(
                  'min-h-11 rounded-chip text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700',
                  mode === key ? 'bg-surface text-ink ring-1 ring-navy-100' : 'text-quiet hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'heslo' ? (
            <form onSubmit={submitPassword} className="mt-5 space-y-4">
              {error && <Chyba text={error} />}
              <Pole id="email" label="E-mail" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail} autoFocus />
              <Pole id="password" label="Heslo" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
              <Odeslat pending={pending}>Přihlásit se</Odeslat>
              <Link href={WS_FORGOT_PATH} className={LINK}>
                Zapomněli jste heslo?
              </Link>
            </form>
          ) : (
            <form onSubmit={submitCode} className="mt-5 space-y-4">
              <p className="text-sm text-quiet">Pošleme vám na e-mail kód. Heslo nepotřebujete.</p>
              {error && <Chyba text={error} />}
              <Pole id="email-code" label="E-mail" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail} autoFocus />
              <Odeslat pending={pending}>Poslat kód</Odeslat>
            </form>
          )}
        </>
      )}
    </div>
  )
}

export function WsSignUpForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await startSignup({ name, email, website })
      if (!res.ok) setError(res.error)
      else setCodeSentTo(email.trim().toLowerCase())
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">Vyzkoušet ZakazIQ</h1>
      {codeSentTo ? (
        <CodeStep
          email={codeSentTo}
          onDone={() => {
            router.push(WS_ONBOARDING_PATH)
            router.refresh()
          }}
          onBack={() => setCodeSentTo(null)}
          resend={async () => {
            const res = await startSignup({ name, email: codeSentTo, website })
            return res.ok ? null : res.error
          }}
        />
      ) : (
        <>
          <p className="mt-2 text-sm text-quiet">Pošleme vám na e-mail kód. Tím ověříme, že adresa patří vám.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <Chyba text={error} />}
            <Pole id="name" label="Vaše jméno" type="text" autoComplete="name" value={name} onChange={setName} autoFocus />
            <Pole id="email" label="E-mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} />
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="website">Web</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <Odeslat pending={pending}>Poslat kód</Odeslat>
          </form>
          <Link href={WS_SIGN_IN_PATH} className={`${LINK} mt-2`}>
            Už účet mám, přihlásit se
          </Link>
        </>
      )}
    </div>
  )
}

/** Založení přístupu z pozvánky. E-mail je pevný — je to ten, na který pozvánka zní. */
export function WsInviteSignUpForm({ code, email, signInHref }: { code: string; email: string; signInHref: string }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      // Úspěch přesměruje na serveru; sem se vrací jen chyba.
      const res = await createAccountFromWsInvite(code, name, password)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      {error && <Chyba text={error} />}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">E-mail</span>
        <p className="min-h-11 rounded-chip border border-navy-100 bg-navy-50 px-3 py-2.5 text-[15px] text-ink">{email}</p>
      </div>
      <Pole id="name" label="Vaše jméno" type="text" autoComplete="name" value={name} onChange={setName} required={false} />
      <Pole
        id="new-password"
        label="Heslo"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="Aspoň 10 znaků. Přihlásit se půjde i kódem z e-mailu."
      />
      <Odeslat pending={pending}>Vytvořit přístup</Odeslat>
      <Link href={signInHref} className={LINK}>
        Už mám přístup, přihlásit se
      </Link>
    </form>
  )
}

export function WsAcceptInviteButton({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="mt-5 space-y-3">
      {error && <Chyba text={error} />}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptWsInvite(code)
            if (!res.ok) setError(res.error)
          })
        }
        className={BUTTON}
      >
        {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
        Přijmout pozvánku
      </button>
    </div>
  )
}

export function WsForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await requestWsPasswordReset(email)
      if (!res.ok) setError(res.error)
      else setSent(true)
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">Nové heslo</h1>
      {sent ? (
        <p className="mt-2 text-sm text-quiet" role="status">
          Jestli u nás tenhle e-mail máme, za chvíli vám na něj přijde odkaz na nové heslo.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-quiet">Pošleme vám odkaz, přes který si nastavíte nové heslo.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <Chyba text={error} />}
            <Pole id="email" label="E-mail" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail} autoFocus />
            <Odeslat pending={pending}>Poslat odkaz</Odeslat>
          </form>
        </>
      )}
      <Link href={WS_SIGN_IN_PATH} className={`${LINK} mt-2`}>
        Zpět na přihlášení
      </Link>
    </div>
  )
}

export function WsNewPasswordForm({ first = false }: { first?: boolean }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await setWsPassword(password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(WS_HOME_PATH)
      router.refresh()
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">{first ? 'Nastavte si heslo' : 'Nastavte si nové heslo'}</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Chyba text={error} />}
        <Pole
          id="new-password"
          label={first ? 'Heslo' : 'Nové heslo'}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint="Aspoň 10 znaků."
          autoFocus
        />
        <Odeslat pending={pending}>Uložit heslo</Odeslat>
      </form>
    </div>
  )
}

/** Registrace zatím zavřená (R-134): co se dá udělat místo ní. */
export function WsSignUpClosed() {
  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">ZakazIQ zatím spouštíme postupně</h1>
      <p className="mt-2 text-sm text-quiet">
        Přístup teď nastavujeme osobně, ať vám všechno hned funguje. Napište nám a připravíme vám ho.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href="/#vyzkouset" className={BUTTON}>
          Chci to vyzkoušet
        </Link>
        <Link href={WS_SIGN_IN_PATH} className={LINK}>
          Už účet mám, přihlásit se
        </Link>
      </div>
    </div>
  )
}

