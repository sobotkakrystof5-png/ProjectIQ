'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { completeVisit, stampVisit } from '@/app/w/[business]/zakaznici/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { cn } from '@/lib/ws/utils'

type Method = 'cash' | 'card' | 'transfer'

const METHODS: { key: Method; label: string }[] = [
  { key: 'cash', label: 'Hotově' },
  { key: 'card', label: 'Kartou' },
  { key: 'transfer', label: 'Převodem' },
]

/** „1 250,50“ → 1250.5; prázdné nebo nesmysl → null. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s|Kč|€/gi, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Detail termínu (S12): „Hotovo, zaplaceno“ zapíše platbu, dá razítko podle
 * pravidel věrnosti a s plnou kartou nabídne uplatnění odměny.
 */
export function VisitPayment({
  slug,
  appointmentId,
  state,
}: {
  slug: string
  appointmentId: string
  state: {
    status: string
    servicePrice: number | null
    currency: string
    paid: { amount: number; method: string | null } | null
    stamped: boolean
    program: { enabled: boolean; autoStamp: boolean; rewardText: string }
    rewardReady: boolean
  }
}) {
  const { run, pending } = useWsAction()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(state.servicePrice !== null ? String(state.servicePrice).replace('.', ',') : '')
  const [method, setMethod] = useState<Method>('cash')
  const [redeem, setRedeem] = useState(state.rewardReady)
  const currency = (state.currency === 'EUR' ? 'EUR' : 'CZK') as WsCurrency

  if (state.status === 'completed') {
    const methodLabel = METHODS.find((m) => m.key === state.paid?.method)?.label.toLowerCase()
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-chip bg-navy-50 px-3 py-2.5 dark:bg-navy-800">
        <p className="text-[15px] text-navy-900 dark:text-navy-50">
          {state.paid ? (
            <>
              Zaplaceno <span className="font-num">{formatMoney(state.paid.amount, { currency })}</span>
              {methodLabel && `, ${methodLabel}`}.
            </>
          ) : (
            'Hotovo.'
          )}
        </p>
        {state.program.enabled && !state.program.autoStamp && !state.stamped && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void run(() => stampVisit({ slug, appointmentId }), (r) => toast.success(r.message))}
          >
            Dát razítko
          </Button>
        )}
      </div>
    )
  }
  if (state.status !== 'confirmed') return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = amount.trim() === '' ? 0 : parseAmount(amount)
    if (value === null) {
      toast.error('Částka nevypadá správně. Napište ji prosím jako 650 nebo 650,50.')
      return
    }
    void run(
      () => completeVisit({ slug, appointmentId, amount: value, method, redeem: state.rewardReady ? redeem : false }),
      (r) => {
        toast.success(r.message)
        setOpen(false)
      },
    )
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {state.rewardReady && (
          <p className="text-sm font-semibold text-navy-700 dark:text-navy-200">
            Odměna připravena{state.program.rewardText ? `: ${state.program.rewardText}` : ''}.
          </p>
        )}
        <div>
          <Button onClick={() => setOpen(true)}>Hotovo, zaplaceno</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-box border bg-ground p-4 dark:bg-navy-950">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`castka-${appointmentId}`}>Zaplaceno ({currency === 'EUR' ? '€' : 'Kč'})</Label>
        <Input
          id={`castka-${appointmentId}`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          maxLength={14}
          placeholder="0"
          className="font-num sm:max-w-[200px]"
          autoFocus
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">Jak</legend>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={method === m.key}
              onClick={() => setMethod(m.key)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold transition-colors',
                method === m.key ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100 dark:bg-navy-900 dark:text-navy-100',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>
      {state.rewardReady && (
        <div className="flex items-start gap-3">
          <Checkbox id={`odmena-${appointmentId}`} checked={redeem} onCheckedChange={(v) => setRedeem(v === true)} className="mt-0.5" />
          <Label htmlFor={`odmena-${appointmentId}`} className="font-normal">
            Uplatnit odměnu{state.program.rewardText ? `: ${state.program.rewardText}` : ''}. Návštěva pak razítko nedostane, začne nová karta.
          </Label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Uložit
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Zavřít
        </Button>
      </div>
    </form>
  )
}
