'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FileText, Plus, Trash2, Pencil, ExternalLink, AlertTriangle, Clock, Loader2, UploadCloud,
} from 'lucide-react'
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal'
import { usePdfDrop } from '@/lib/use-pdf-drop'
import { deleteInvoice } from '@/app/hub/finance/invoice-actions'
import type { InvoiceArchiveData, InvoiceListItem, InvoiceProjectOption } from '@/app/hub/finance/invoice-actions'
import type { InvoiceFormState } from '@/components/InvoiceFields'

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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function InvoiceRow({
  invoice,
  onEdit,
  onDelete,
  isPending,
}: {
  invoice: InvoiceListItem
  onEdit: (invoice: InvoiceListItem) => void
  onDelete: (invoice: InvoiceListItem) => void
  isPending: boolean
}) {
  const overdue = invoice.paid_on === null && invoice.due_on !== null && invoice.due_on < todayISO()
  const client = invoice.client_name ?? invoice.project_client_name

  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 hover:bg-muted/40 rounded-lg group transition-colors">
      <FileText size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{invoice.invoice_number}</span>
          {client && <span className="text-xs text-muted-foreground truncate">{client}</span>}
          {invoice.project_href && (
            <Link
              href={invoice.project_href}
              className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full hover:text-foreground transition-colors"
            >
              <ExternalLink size={9} strokeWidth={1.5} />
              Zakázka
            </Link>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
              <Clock size={9} strokeWidth={1.5} />
              Po splatnosti
            </span>
          )}
          {invoice.duplicate_risk && (
            <span
              title="Zakázka má v ledgeru i vlastní příjem (např. zálohu). Zkontroluj, že se stejné peníze nezapočítaly dvakrát."
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            >
              <AlertTriangle size={9} strokeWidth={1.5} />
              Zkontrolovat příjem
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
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
          className="text-[10px] text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded-full hover:bg-emerald-100 transition-colors shrink-0"
        >
          PDF
        </a>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">bez PDF</span>
      )}

      <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
        {formatAmount(invoice.amount, invoice.currency)}
      </span>

      <button
        onClick={() => onEdit(invoice)}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all disabled:opacity-30 shrink-0"
        title="Upravit fakturu"
      >
        <Pencil size={13} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => onDelete(invoice)}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
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
  projects,
  defaults,
  title = 'Archiv faktur',
  description,
  paidLabel,
}: {
  data: InvoiceArchiveData
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
        <div className="absolute -inset-3 z-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/95 pointer-events-none">
          <UploadCloud size={20} strokeWidth={1.5} className="text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">Pusť fakturu sem</span>
          <span className="text-xs text-emerald-600">PDF přečte AI a předvyplní pole</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText size={14} strokeWidth={1.5} className="text-emerald-600" />
            {title}
          </h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Nahrát fakturu
        </button>
      </div>

      {empty ? (
        <p className="text-xs text-muted-foreground py-3">
          Zatím žádné faktury. Přetáhni sem PDF odkudkoliv — přečte ho AI — nebo fakturu zadej ručně.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Zaplacené — tyhle peníze jsou v daňovém základu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {paidLabel ?? `Zaplacené · ${data.year}`}
              </span>
              <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                {formatAmount(data.paidTotal, 'CZK')}
              </span>
            </div>
            {data.paid.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1.5">
                {paidLabel ? 'Žádná zaplacená faktura' : `Žádná zaplacená faktura v ${data.year}`}
              </p>
            ) : (
              <div className="space-y-0.5">
                {data.paid.map(invoice => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
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
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Pohledávky · mimo daňový základ
                {data.overdueCount > 0 && (
                  <span className="text-red-600 normal-case"> · {data.overdueCount} po splatnosti</span>
                )}
              </span>
              <span className="text-xs font-semibold text-amber-700 tabular-nums">
                {formatAmount(data.outstandingTotal, 'CZK')}
              </span>
            </div>
            {data.outstanding.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1.5">Žádná nezaplacená faktura</p>
            ) : (
              <div className="space-y-0.5">
                {data.outstanding.map(invoice => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
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
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
