'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, Split } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import { adoptPayment, keepPaymentsSeparate, type PaymentCandidate } from '@/app/dashboard/finance/invoice-actions'
import { formatMoney } from '@/lib/money-currency'
import { formatDate } from '@/lib/utils'

/**
 * „Je tohle ta platba?" (AD13)
 *
 * Zakázka má v ledgeru příjem, který tahle faktura nezastupuje. Může to být
 * v pořádku (záloha a doplatek), nebo jsou to tytéž peníze dvakrát. Dřív to
 * hádal systém podle rovnosti částky a mlčky; od AD13 to rozhodne člověk.
 *
 * Převzetí nastaví příjmu přiznanou linii, takže mění daňový základ. Platba
 * z uzavřeného roku se proto potvrzuje zvlášť — tichá změna loňska je tiché
 * přepsání přiznání.
 */
export function PaymentMatch({
  invoiceId,
  candidates,
}: {
  invoiceId: string
  candidates: PaymentCandidate[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const prevzit = (candidate: PaymentCandidate) => {
    if (
      candidate.closedYear &&
      !confirm(
        `Tahle platba je z roku ${candidate.date.slice(0, 4)}, který už je uzavřený. Převzetím se změní daňový základ za ten rok. Pokračovat?`,
      )
    ) {
      return
    }
    setBusy(candidate.id)
    start(async () => {
      const result = await adoptPayment(invoiceId, candidate.id, { confirmClosedYear: candidate.closedYear })
      setBusy(null)
      if (result.needsConfirm) {
        toast.error(`Platba je z uzavřeného roku ${result.needsConfirm}. Potvrďte to prosím znovu.`)
        return
      }
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Platba přiřazená. V ledgeru je jednou.')
      router.refresh()
    })
  }

  const nechatZvlast = () => {
    setBusy('separate')
    start(async () => {
      const result = await keepPaymentsSeparate(invoiceId)
      setBusy(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Rozumím, byly to jiné peníze.')
      router.refresh()
    })
  }

  return (
    <div className="rounded-chip border border-signal-line bg-signal-bg px-4 py-3 text-sm text-signal-ink">
      <p className="flex items-start gap-2.5 font-medium">
        <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
        Zakázka má v přiznané linii ještě jiný příjem. Je to platba téhle faktury?
      </p>
      <p className="mt-1.5 pl-[25px] text-xs">
        Pokud ano, přiřaďte ji — v ledgeru pak budou tyhle peníze jednou. Pokud přišly peníze
        navíc (záloha a doplatek), nechte je oddělené.
      </p>

      <ul className="mt-3 space-y-2 pl-[25px]">
        {candidates.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-signal-line bg-surface px-3 py-2"
          >
            <span className="min-w-0 text-ink">
              <span className="font-num font-semibold">{formatMoney(candidate.amount, candidate.currency)}</span>
              <span className="text-quiet"> · {formatDate(candidate.date)}</span>
              {candidate.deposit && <span className="text-quiet"> · záloha</span>}
              {candidate.note && <span className="block truncate text-xs text-quiet">{candidate.note}</span>}
            </span>
            <button
              type="button"
              onClick={() => prevzit(candidate)}
              disabled={pending}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-navy-700 px-4 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-40"
            >
              <Check size={14} strokeWidth={1.5} aria-hidden="true" />
              {busy === candidate.id ? 'Přiřazuji…' : 'Je to tahle platba'}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={nechatZvlast}
        disabled={pending}
        className="mt-3 ml-[25px] inline-flex h-11 items-center gap-1.5 rounded-full border border-signal-line px-4 text-sm font-medium text-signal-ink transition-colors hover:bg-surface disabled:opacity-40"
      >
        <Split size={14} strokeWidth={1.5} aria-hidden="true" />
        {busy === 'separate' ? 'Ukládám…' : 'Ne, byly to jiné peníze'}
      </button>
    </div>
  )
}
