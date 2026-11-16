'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  createAccountFromInvite,
  requestPasswordReset,
  setNewPassword,
  signInClient,
} from '@/app/klient/actions'
import { PORTAL_FORGOT_PATH, PORTAL_HOME_PATH, PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Formuláře přihlášení klientského prostoru (R-107). Odesílají server actions,
// prohlížeč na Supabase nesahá.

const FIELD =
  'min-h-11 w-full rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm text-ink transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700'
const BUTTON =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-chip bg-navy-700 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-50'
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

export function ClientSignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await signInClient(email, password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(next)
      router.refresh()
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">Přihlášení do vašeho prostoru</h1>
      <p className="mt-2 text-sm text-quiet">Uvidíte tu stav projektu, co se udělalo a co čeká na vás.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Chyba text={error} />}
        <Pole id="email" label="E-mail" type="email" autoComplete="username" value={email} onChange={setEmail} autoFocus />
        <Pole id="password" label="Heslo" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Přihlásit se
        </button>
      </form>
      <Link href={PORTAL_FORGOT_PATH} className={`${LINK} mt-2`}>
        Zapomněli jste heslo?
      </Link>
    </div>
  )
}

/** Založení přístupu z pozvánky. E-mail je pevný — je to ten, na který pozvánka zní. */
export function InviteSignUpForm({ code, email, signInHref }: { code: string; email: string; signInHref: string }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      // Úspěch přesměruje na serveru; sem se vrací jen chyba.
      const res = await createAccountFromInvite(code, name, password)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      {error && <Chyba text={error} />}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">E-mail</span>
        <p className="min-h-11 rounded-chip border border-navy-100 bg-navy-50 px-3 py-2.5 text-sm text-ink">{email}</p>
      </div>
      <Pole id="name" label="Vaše jméno" type="text" autoComplete="name" value={name} onChange={setName} required={false} />
      <Pole
        id="new-password"
        label="Heslo"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="Aspoň 10 znaků."
      />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
        Vytvořit přístup
      </button>
      <Link href={signInHref} className={LINK}>
        Už mám přístup, přihlásit se
      </Link>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await requestPasswordReset(email)
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
            <Pole id="email" label="E-mail" type="email" autoComplete="username" value={email} onChange={setEmail} autoFocus />
            <button type="submit" disabled={pending} className={BUTTON}>
              {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
              Poslat odkaz
            </button>
          </form>
        </>
      )}
      <Link href={PORTAL_SIGN_IN_PATH} className={`${LINK} mt-2`}>
        Zpět na přihlášení
      </Link>
    </div>
  )
}

export function NewPasswordForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await setNewPassword(password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(PORTAL_HOME_PATH)
      router.refresh()
    })
  }

  return (
    <div className={CARD}>
      <h1 className="text-xl font-semibold text-ink">Nastavte si nové heslo</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Chyba text={error} />}
        <Pole
          id="new-password"
          label="Nové heslo"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint="Aspoň 10 znaků."
          autoFocus
        />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Uložit heslo
        </button>
      </form>
    </div>
  )
}
