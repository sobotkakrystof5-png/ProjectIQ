'use client'

import { useState, useTransition } from 'react'
import { Check, CircleCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chooseOfferVariantAction } from '@/app/nabidka/[token]/actions'
import type { ClientOffer } from '@/lib/admin/offers/proposal-model'
import type { VariantKey } from '@/lib/admin/offers/pricing'
import { cn } from '@/lib/utils'

/**
 * Tři varianty nabídky a výběr jedním kliknutím (R-155). Klient vybere
 * variantu tlačítkem „Beru tuhle variantu"; dokud na webu nezačne práce,
 * smí volbu změnit. V náhledu pro Kryštofa jsou tlačítka vypnutá.
 */

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`

const ERROR: Record<string, string> = {
  expired: 'Platnost nabídky skončila. Napište mi a ceny vám rád potvrdím znovu.',
  locked: 'Na vašem webu už pracuji, volbu proto změnit nejde. Napište mi, co potřebujete.',
  not_found: 'Nabídka se nenašla. Zkuste stránku načíst znovu.',
  limited: 'Moc pokusů za sebou. Zkuste to prosím za pár minut.',
  failed: 'Volbu se nepodařilo uložit. Zkuste to prosím znovu, nebo mi napište.',
}

export function OfferChoice({
  token,
  offer,
  preview,
}: {
  token: string | null
  offer: ClientOffer
  preview: boolean
}) {
  const [pending, start] = useTransition()
  const [management, setManagement] = useState(offer.chosen ? offer.chosen.management : true)
  const [chosen, setChosen] = useState<VariantKey | null>(offer.chosen?.variant ?? null)
  const [error, setError] = useState<string | null>(null)
  const disabled = preview || token === null || offer.expired || offer.locked

  const choose = (key: VariantKey) => {
    if (disabled || token === null) return
    setError(null)
    start(async () => {
      const res = await chooseOfferVariantAction(token, key, management)
      if (res.ok) setChosen(key)
      else setError(ERROR[res.error] ?? ERROR.failed)
    })
  }

  const chosenVariant = offer.variants.find((v) => v.key === chosen)

  return (
    <div className="flex flex-col gap-6">
      {chosenVariant && (
        <div role="status" className="flex items-start gap-3 rounded-box border border-navy-100 bg-navy-50 px-5 py-4">
          <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-navy-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">
              Děkuji, vybrali jste variantu {chosenVariant.name} za <span className="font-num">{czk(chosenVariant.price)}</span>
              {management ? ' se správou webu.' : '.'}
            </p>
            <p className="mt-1 text-sm text-quiet">Ozvu se vám do 24 hodin a domluvíme další postup.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {offer.variants.map((v) => {
          const recommended = v.key === offer.recommended
          const isChosen = v.key === chosen
          return (
            <section
              key={v.key}
              aria-label={`Varianta ${v.name}`}
              className={cn(
                'flex flex-col rounded-box border bg-surface p-5 sm:p-6',
                isChosen ? 'border-navy-700 ring-1 ring-navy-700' : recommended ? 'border-navy-300' : 'border-navy-100',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{v.name}</h3>
                {recommended && (
                  <span className="rounded-full bg-navy-700 px-3 py-1 text-xs font-semibold text-white">Doporučuji</span>
                )}
              </div>
              <p className="mt-3 font-num text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">{czk(v.price)}</p>
              <p className="mt-1.5 text-sm text-quiet">jednorázově</p>
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {v.includes.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[15px] leading-6 text-ink">
                    <Check size={17} strokeWidth={2} className="mt-[3px] shrink-0 text-navy-700" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {!offer.locked && (
                <Button
                  type="button"
                  variant={recommended || isChosen ? 'primary' : 'outline'}
                  className="mt-6 w-full"
                  disabled={disabled || pending || isChosen}
                  onClick={() => choose(v.key)}
                >
                  {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : isChosen ? <Check size={16} aria-hidden /> : null}
                  {isChosen ? 'Vybráno' : 'Beru tuhle variantu'}
                </Button>
              )}
            </section>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-chip border border-danger/30 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      <section className="rounded-box border border-navy-100 bg-surface p-5 sm:p-6" aria-label="Správa webu">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">Správa webu</h3>
          <p className="font-num text-lg font-semibold text-ink">
            {czk(offer.managementMonthly)} <span className="font-sans text-sm font-normal text-quiet">měsíčně</span>
          </p>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {offer.management.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-6 text-ink">
              <Check size={17} strokeWidth={2} className="mt-[3px] shrink-0 text-navy-700" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {!offer.locked && (
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium text-ink">
            <input
              type="checkbox"
              checked={management}
              disabled={disabled || pending}
              onChange={(e) => setManagement(e.target.checked)}
              className="h-5 w-5 rounded border-navy-300 accent-[var(--navy-700)]"
            />
            Chci i správu webu
          </label>
        )}
      </section>
    </div>
  )
}
