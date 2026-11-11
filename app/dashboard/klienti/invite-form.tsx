'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { UserPlus, X } from 'lucide-react'
import { inviteClientAction } from './actions'

const INPUT = 'w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'

/**
 * Pozvat klienta (S17): Clerk organizace + účet a byznys ze šablony oboru +
 * pozvánka e-mailem. Klient po registraci rovnou zadá kartu (krok 2 průvodce).
 */
export function InviteClientForm({ industries }: { industries: { key: string; label: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    start(async () => {
      const res = await inviteClientAction({
        email: String(form.get('email') ?? ''),
        businessName: String(form.get('businessName') ?? ''),
        industry: String(form.get('industry') ?? ''),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.data.inviteSent) toast.success('Účet je založený a pozvánka odešla.')
      else toast.warning('Účet je založený, ale pozvánka neodešla. Pošli ji znovu v detailu.')
      setOpen(false)
      router.push(`/dashboard/klienti/${res.data.accountId}`)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium brand-gradient text-white rounded-lg hover:opacity-90 transition-opacity shrink-0"
      >
        <UserPlus size={15} strokeWidth={1.5} />
        Pozvat klienta
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full bg-white border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Pozvat klienta</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Zavřít" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Založí účet a byznys podle šablony oboru a pošle klientovi pozvánku z Clerku. Po registraci zadá kartu (14 dní zdarma) a může začít.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted-foreground">E-mail klienta</span>
          <input name="email" type="email" required maxLength={254} autoComplete="off" className={INPUT} />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted-foreground">Název byznysu</span>
          <input name="businessName" required minLength={2} maxLength={80} className={INPUT} />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted-foreground">Obor</span>
          <select name="industry" required defaultValue={industries[0]?.key} className={INPUT}>
            {industries.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 text-sm font-medium brand-gradient text-white rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Zakládám…' : 'Založit a pozvat'}
        </button>
      </div>
    </form>
  )
}
