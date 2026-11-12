'use client'

import { useOptimistic, useTransition } from 'react'
import { Check, Loader2, Undo2 } from 'lucide-react'
import { setInvoicePaid } from '@/app/dashboard/finance/invoice-actions'
import { toast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { invoiceTone, toneVariant } from '@/lib/admin-status'

/**
 * „Zaplaceno" jedním kliknutím (AD08). Dřív se stav faktury dal změnit jen
 * otevřením formuláře — u dokladu, který se jen odškrtává, to byly čtyři
 * kroky místo jednoho.
 *
 * `useOptimistic`: odznak se přepne hned a při chybě se sám vrátí, protože
 * React optimistickou hodnotu po skončení transition zahodí. Peněžní stranu
 * řeší `syncInvoiceTransaction` na serveru, tady se nic nepočítá.
 */
export function PaidCell({
  invoiceId,
  paidOn,
  overdue,
  todayIso,
}: {
  invoiceId: string
  paidOn: string | null
  overdue: boolean
  /** Dnešek v Praze — spočítaný na serveru, ať nezáleží na zóně prohlížeče. */
  todayIso: string
}) {
  const [optimisticPaidOn, setOptimisticPaidOn] = useOptimistic<string | null, string | null>(
    paidOn,
    (_, next) => next,
  )
  const [isPending, startTransition] = useTransition()
  const isPaid = optimisticPaidOn !== null

  function toggle() {
    startTransition(async () => {
      const next = isPaid ? null : todayIso
      setOptimisticPaidOn(next)
      const result = await setInvoicePaid(invoiceId, next)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(next ? 'Označeno jako zaplacené' : 'Vráceno mezi pohledávky')
    })
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={toneVariant(invoiceTone(isPaid, overdue))}>
        {isPaid ? 'Zaplaceno' : overdue ? 'Po splatnosti' : 'Pohledávka'}
      </Badge>
      <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={isPaid ? 'Vrátit mezi pohledávky' : 'Označit jako zaplacené'}
      className="inline-flex items-center gap-1.5 rounded-full border border-navy-100 bg-surface px-2 py-1 text-xs font-medium text-quiet transition-colors hover:bg-accent disabled:opacity-60"
    >
      {isPending ? (
        <Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden />
      ) : isPaid ? (
        <Undo2 size={12} strokeWidth={1.5} aria-hidden />
      ) : (
        <Check size={12} strokeWidth={1.5} aria-hidden />
      )}
      {isPaid ? 'Vrátit' : 'Zaplaceno'}
      </button>
    </span>
  )
}
