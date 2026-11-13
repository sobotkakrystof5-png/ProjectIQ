'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import {
  FileText, Plus, Trash2, Pencil, ExternalLink, AlertTriangle, Clock, Loader2, UploadCloud,
} from 'lucide-react'
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal'
import { usePdfDrop } from '@/lib/use-pdf-drop'
import { deleteInvoice } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceArchiveData, InvoiceListItem, InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceFormState } from '@/components/InvoiceFields'
import { isInvoiceOverdue } from '@/lib/invoice-status'

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })
}

function InvoiceRow({
  invoice,
  todayIso,
  onEdit,
  onDelete,
  isPending,
}: {
  invoice: InvoiceListItem
  /** Dnešek v Praze ze serveru — prohlížeč v jiné zóně by odpočty posunul (AD13). */
  todayIso: string
  onEdit: (invoice: InvoiceListItem) => void
  onDelete: (invoice: InvoiceListItem) => void
  isPending: boolean
}) {
  const overdue = isInvoiceOverdue(invoice, todayIso)
  const client = invoice.client_name ?? invoice.project_client_name

  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 hover:bg-muted/40 rounded-chip group transition-colors">
      <FileText size={13} strokeWidth={1.5} className="text-quiet shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink">{invoice.invoice_number}</span>
          {client && <span className="text-xs text-quiet truncate">{client}</span>}
          {invoice.project_href && (
            <Link
              href={invoice.project_href}
              className="hidden sm:inline-flex items-center gap-1 text-[10px] text-quiet bg-muted px-1.5 py-0.5 rounded-full hover:text-ink transition-colors"
            >
              <ExternalLink size={9} strokeWidth={1.5} />
              Zakázka
            </Link>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
              <Clock size={9} strokeWidth={1.5} />
              Po splatnosti
            </span>
          )}
          {invoice.duplicate_risk && (
            <span
              title="Zakázka má v ledgeru i vlastní příjem (např. zálohu). Zkontroluj, že se stejné peníze nezapočítaly dvakrát."
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-signal-line bg-signal-bg px-1.5 py-0.5 text-[10px] font-medium text-signal-ink"
            >
              <AlertTriangle size={9} strokeWidth={1.5} />
              Zkontrolovat příjem
            </span>
          )}
        </div>
        <p className="text-[11px] text-quiet mt-0.5">
          Vystaveno {formatDate(invoice.issued_on)}
          {invoice.paid_on
            ? ` · Zaplaceno ${formatDate(invoice.paid_on)}`
            : ` · Splatnost ${formatDate(invoice.due_on)}`}
        </p>
      </div>

      {invoice.has_pdf ? (
        <a
          href={`/api/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-medium text-navy-900 transition-colors hover:bg-navy-200"
        >
          PDF
        </a>
      ) : (
        <span className="text-[10px] text-quiet shrink-0 hidden sm:inline">bez PDF</span>
      )}

      <span className="text-sm font-semibold text-ink shrink-0 tabular-nums">
        {formatAmount(invoice.amount, invoice.currency)}
      </span>

      <button
        onClick={() => onEdit(invoice)}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 p-1 text-quiet hover:text-ink transition-all disabled:opacity-30 shrink-0"
        title="Upravit fakturu"
      >
        <Pencil size={13} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => onDelete(invoice)}
        disabled={isPending}
        className="shrink-0 p-1 text-quiet opacity-0 transition-all hover:text-danger group-hover:opacity-100 disabled:opacity-30"
        title="Smazat fakturu"
      >
        <Trash2 size={13} strokeWidth={1.5} />
      </button>
    </div>
  )
}

/**
 * Archiv faktur. Ve Financích visí jako podsekce pod přiznanou linií,
 * na detailu zakázky jako samostatná karta (tam `projects` chybí a zakázka
 * se předvyplní přes `defaults`).
 *
 * Dělení na dvě skupiny není kosmetika: zaplacené faktury patří roku, ve
 * kterém peníze dorazily, pohledávky nepatří žádnému a do daňového základu
 * nevstupují.
 */
export function InvoiceArchive({
  data,
  todayIso,
  projects,
  defaults,
  title = 'Archiv faktur',
  description,
  paidLabel,
}: {
  data: InvoiceArchiveData
  /** Dnešek v Praze, spočítaný na serveru (AD13). */
  todayIso: string
  projects?: InvoiceProjectOption[]
  defaults?: Partial<InvoiceFormState>
  title?: string
  description?: string
  /** Nadpis skupiny zaplacených; výchozí je „Zaplacené · rok" */
  paidLabel?: string
}) {
  const router = useRouter()
  const [modal, setModal] = useState<{ invoice?: InvoiceListItem; file?: File } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(invoice: InvoiceListItem) {
    if (!confirm(`Smazat fakturu ${invoice.invoice_number}? Příjem, který sama založila, zmizí z ledgeru.`)) return
    setDeletingId(invoice.id)
    startTransition(async () => {
      await deleteInvoice(invoice.id)
      setDeletingId(null)
      router.refresh()
    })
  }

  const empty = data.paid.length === 0 && data.outstanding.length === 0

  // Fakturu jde hodit rovnou na archiv — odkudkoliv (Finder, příloha mailu).
  // Modal se otevře s PDF už přiloženým a AI ho rovnou přečte.
  const { isOver, dropProps } = usePdfDrop({
    onFile: file => setModal({ file }),
    onReject: message => toast.error(message),
  })

  return (
    <div className="relative space-y-4" {...dropProps}>
      {isOver && (
        <div className="pointer-events-none absolute -inset-3 z-20 flex flex-col items-center justify-center gap-1.5 rounded-chip border-2 border-dashed border-navy-300 bg-navy-50/95">
          <UploadCloud size={20} strokeWidth={1.5} className="text-navy-600" />
          <span className="text-sm font-medium text-navy-900">Pusť fakturu sem</span>
          <span className="text-xs text-quiet">PDF přečte AI a předvyplní pole</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileText size={14} strokeWidth={1.5} className="text-navy-500" />
            {title}
          </h3>
          {description && <p className="text-xs text-quiet mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => setModal({})}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
        >
          <Plus size={14} strokeWidth={1.5} />
          Nahrát fakturu
        </button>
      </div>

      {empty ? (
        <p className="text-xs text-quiet py-3">
          Zatím žádné faktury. Přetáhni sem PDF odkudkoliv — přečte ho AI — nebo fakturu zadej ručně.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Zaplacené — tyhle peníze jsou v daňovém základu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-quiet uppercase tracking-wide">
                {paidLabel ?? `Zaplacené · ${data.year}`}
              </span>
              <span className="font-num text-xs font-semibold tabular-nums text-ink">
                {formatAmount(data.paidTotal, 'CZK')}
              </span>
            </div>
            {data.paid.length === 0 ? (
              <p className="text-xs text-quiet py-1.5">
                {paidLabel ? 'Žádná zaplacená faktura' : `Žádná zaplacená faktura v ${data.year}`}
              </p>
            ) : (
              <div className="space-y-0.5">
                {data.paid.map(invoice => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    todayIso={todayIso}
                    onEdit={inv => setModal({ invoice: inv })}
                    onDelete={handleDelete}
                    isPending={isPending && deletingId === invoice.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pohledávky — mimo daňový základ, napříč roky */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-quiet uppercase tracking-wide">
                Pohledávky · mimo daňový základ
                {data.overdueCount > 0 && (
                  <span className="normal-case text-danger"> · {data.overdueCount} po splatnosti</span>
                )}
              </span>
              <span className="font-num text-xs font-semibold tabular-nums text-signal-ink">
                {formatAmount(data.outstandingTotal, 'CZK')}
              </span>
            </div>
            {data.outstanding.length === 0 ? (
              <p className="text-xs text-quiet py-1.5">Žádná nezaplacená faktura</p>
            ) : (
              <div className="space-y-0.5">
                {data.outstanding.map(invoice => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    todayIso={todayIso}
                    onEdit={inv => setModal({ invoice: inv })}
                    onDelete={handleDelete}
                    isPending={isPending && deletingId === invoice.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isPending && (
        <p className="flex items-center gap-1.5 text-xs text-quiet">
          <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
          Ukládám…
        </p>
      )}

      {modal && (
        <InvoiceUploadModal
          onClose={() => setModal(null)}
          invoice={modal.invoice}
          projects={projects}
          defaults={defaults}
          initialFile={modal.file}
        />
      )}
    </div>
  )
}
