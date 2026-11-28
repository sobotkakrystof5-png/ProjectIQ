'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { startOfferForFirmAction } from '@/app/offer-research-actions'

/**
 * Nová nabídka pro firmu (R-160): web, IČO nebo název. ZakazIQ firmu najde
 * mezi kontakty, nebo ji založí, a spustí rozbor. Návrh nabídky se po rozboru
 * připraví sám a čeká na kartě kontaktu, kam formulář po odeslání vede.
 */

const fieldClass =
  'min-h-11 w-full rounded-chip border border-navy-200 bg-surface px-3 text-sm text-ink placeholder:text-quiet focus:border-navy-700 focus:outline-none'
const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'

type Fields = { web: string; ico: string; name: string; email: string; phone: string }
const EMPTY: Fields = { web: '', ico: '', name: '', email: '', phone: '' }

export function NewOfferForm() {
  const router = useRouter()
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }))
  const empty = fields.web.trim() === '' && fields.ico.trim() === '' && fields.name.trim() === ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (empty) {
      setError('Zadejte web, IČO nebo název firmy.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await startOfferForFirmAction(fields)
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.warning) toast.warning(res.message, { description: res.warning })
      else toast.success(res.message, { description: 'Nabídka se připraví sama, obvykle do pěti minut.' })
      setFields(EMPTY)
      router.push(`/dashboard/kontakty/${res.contactId}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Web firmy</span>
          <input
            value={fields.web}
            onChange={(e) => set({ web: e.target.value })}
            placeholder="firma.cz"
            inputMode="url"
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">IČO</span>
          <input
            value={fields.ico}
            onChange={(e) => set({ ico: e.target.value })}
            placeholder="12345678"
            inputMode="numeric"
            autoComplete="off"
            className={`${fieldClass} font-num`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Název firmy</span>
          <input
            value={fields.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Doplní se z rejstříku"
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">E-mail</span>
          <input
            value={fields.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="info@firma.cz"
            inputMode="email"
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Telefon</span>
          <input
            value={fields.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="604 123 456"
            inputMode="tel"
            autoComplete="off"
            className={`${fieldClass} font-num`}
          />
        </label>
      </div>
      <p className="text-xs text-quiet">
        Stačí web, IČO nebo název. E-mail budete potřebovat, až budete nabídku nebo ukázku posílat.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} strokeWidth={1.75} aria-hidden />}
          Připravit nabídku
        </button>
      </div>
    </form>
  )
}
