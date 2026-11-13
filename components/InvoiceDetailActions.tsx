'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal'
import { deleteInvoice } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceDetail, InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'

/** Úprava a smazání faktury z jejího detailu. Formulář je tentýž jako v archivu Financí. */
export function InvoiceDetailActions({
  invoice,
  projects,
}: {
  invoice: InvoiceDetail
  projects: InvoiceProjectOption[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (
      !confirm(
        `Smazat fakturu ${invoice.invoice_number}? Příjem, který sama založila, zmizí z ledgeru.`
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Faktura smazána')
      // Detail smazané faktury už neexistuje — zpátky na evidenci.
      router.push('/dashboard/faktury')
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        disabled={isPending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-navy-50 disabled:opacity-40"
      >
        <Pencil size={14} strokeWidth={1.5} />
        Upravit
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-danger/30 bg-surface px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/5 disabled:opacity-40"
      >
        {isPending ? (
          <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <Trash2 size={14} strokeWidth={1.5} />
        )}
        Smazat
      </button>

      {editing && (
        <InvoiceUploadModal
          onClose={() => setEditing(false)}
          invoice={invoice}
          projects={projects}
        />
      )}
    </div>
  )
}
