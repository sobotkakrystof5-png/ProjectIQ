'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  FileText, Plus, Search, ChevronRight, Clock, AlertTriangle, UploadCloud, Paperclip,
} from 'lucide-react'
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal'
import { usePdfDrop } from '@/lib/use-pdf-drop'
import { cn } from '@/lib/utils'
import type { InvoiceRegistryItem, InvoiceProjectOption } from '@/app/hub/finance/invoice-actions'

/**
 * Evidence faktur — archiv všech vystavených dokladů napříč roky.
 *
 * Proti `InvoiceArchive` ve Financích má jiný úkol: ten slouží daním
 * (dělí zaplacené od pohledávek podle roku zaplacení), tenhle slouží
 * dohledávání — vidíš každý doklad, co kdy vznikl, řazený podle data
 * vystavení, a klikem se dostaneš na jeho kompletní přepis.
 */

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
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function isOverdue(invoice: InvoiceRegistryItem) {
  return invoice.paid_on === null && invoice.due_on !== null && invoice.due_on < todayISO()
}

/**
 * Součty se sčítají po měnách. Archiv umí CZK i EUR a sečíst je do jednoho
 * čísla by byl výmysl — radši se vedle sebe zobrazí obě částky.
 */
function sumByCurrency(invoices: InvoiceRegistryItem[]): string {
  const totals = new Map<string, number>()
  for (const invoice of invoices) {
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.amount)
  }
  if (totals.size === 0) return formatAmount(0, 'CZK')
  return Array.from(totals.entries()).map(([currency, value]) => formatAmount(value, currency)).join(' · ')
}

type StatusFilter = 'all' | 'paid' | 'outstanding' | 'overdue'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Všechny' },
  { value: 'paid', label: 'Zaplacené' },
  { value: 'outstanding', label: 'Nezaplacené' },
  { value: 'overdue', label: 'Po splatnosti' },
]

function SummaryTile({ label, value, hint, tone }: {
  label: string
  value: string
  hint?: string
  tone?: 'emerald' | 'amber'
}) {
  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'text-[17px] font-semibold tabular-nums mt-0.5',
          tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function InvoiceRow({ invoice }: { invoice: InvoiceRegistryItem }) {
  const overdue = isOverdue(invoice)
  const client = invoice.client_name ?? invoice.project_client_name

  return (
    <Link
      href={`/dashboard/faktury/${invoice.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-border hover:bg-muted/40 transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
        <FileText size={15} strokeWidth={1.5} className="text-emerald-600" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{invoice.invoice_number}</span>
          {invoice.paid_on ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              Zaplaceno
            </span>
          ) : overdue ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
              <Clock size={9} strokeWidth={1.5} />
              Po splatnosti
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              Pohledávka
            </span>
          )}
          {invoice.has_pdf && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              <Paperclip size={9} strokeWidth={1.5} />
              PDF
            </span>
          )}
          {invoice.duplicate_risk && (
            <span
              title="Zakázka má v ledgeru i vlastní příjem. Zkontroluj, že se stejné peníze nezapočítaly dvakrát."
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            >
              <AlertTriangle size={9} strokeWidth={1.5} />
              Zkontrolovat příjem
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
          {formatDate(invoice.issued_on)}
          {' · '}
          {client ?? 'Bez zakázky'}
          {invoice.project_description ? ` — ${invoice.project_description}` : ''}
        </p>
      </div>

      <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
        {formatAmount(invoice.amount, invoice.currency)}
      </span>
      <ChevronRight
        size={15}
        strokeWidth={1.5}
        className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0"
      />
    </Link>
  )
}

export function InvoiceRegistry({
  invoices,
  projects,
}: {
  invoices: InvoiceRegistryItem[]
  projects: InvoiceProjectOption[]
}) {
  const [modal, setModal] = useState<{ file?: File } | null>(null)
  const [query, setQuery] = useState('')
  const [year, setYear] = useState<'all' | number>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  // Roky bere z data vystavení — evidence se prochází podle toho, kdy doklad vznikl.
  const years = useMemo(
    () => Array.from(new Set(invoices.map(i => Number(i.issued_on.slice(0, 4))))).sort((a, b) => b - a),
    [invoices]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter(invoice => {
      if (year !== 'all' && Number(invoice.issued_on.slice(0, 4)) !== year) return false

      if (status === 'paid' && invoice.paid_on === null) return false
      if (status === 'outstanding' && invoice.paid_on !== null) return false
      if (status === 'overdue' && !isOverdue(invoice)) return false

      if (!q) return true
      const haystack = [
        invoice.invoice_number,
        invoice.client_name,
        invoice.project_client_name,
        invoice.project_description,
        invoice.client_ico,
        invoice.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [invoices, query, year, status])

  const grouped = useMemo(() => {
    const map = new Map<number, InvoiceRegistryItem[]>()
    for (const invoice of filtered) {
      const y = Number(invoice.issued_on.slice(0, 4))
      const list = map.get(y)
      if (list) list.push(invoice)
      else map.set(y, [invoice])
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [filtered])

  const paid = filtered.filter(i => i.paid_on !== null)
  const outstanding = filtered.filter(i => i.paid_on === null)
  const overdueCount = outstanding.filter(isOverdue).length

  // Fakturu jde hodit rovnou na evidenci — modal se otevře s PDF přiloženým
  // a AI ho rovnou přečte.
  const { isOver, dropProps } = usePdfDrop({
    onFile: file => setModal({ file }),
    onReject: message => toast.error(message),
  })

  return (
    <div className="relative space-y-5" {...dropProps}>
      {isOver && (
        <div className="absolute -inset-3 z-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/95 pointer-events-none">
          <UploadCloud size={22} strokeWidth={1.5} className="text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">Pusť fakturu sem</span>
          <span className="text-xs text-emerald-600">PDF přečte AI a předvyplní pole</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile label="Faktur celkem" value={String(filtered.length)} hint={`z ${invoices.length} v evidenci`} />
        <SummaryTile label="Vyfakturováno" value={sumByCurrency(filtered)} />
        <SummaryTile label="Zaplaceno" value={sumByCurrency(paid)} hint={`${paid.length} faktur`} tone="emerald" />
        <SummaryTile
          label="Nezaplaceno"
          value={sumByCurrency(outstanding)}
          hint={overdueCount > 0 ? `${overdueCount} po splatnosti` : `${outstanding.length} pohledávek`}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Hledat podle čísla, klienta, zakázky, IČO…"
            className="w-full text-sm border border-border rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <select
          value={String(year)}
          onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-white shrink-0"
        >
          <option value="all">Všechny roky</option>
          {years.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shrink-0"
        >
          <Plus size={14} strokeWidth={1.5} />
          Nová faktura
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              status === value
                ? 'bg-brand-800 text-white'
                : 'bg-white border border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-border rounded-2xl">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
            <FileText size={24} strokeWidth={1.5} className="text-emerald-400" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {invoices.length === 0 ? 'Zatím žádná faktura' : 'Nic neodpovídá filtru'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {invoices.length === 0
              ? 'Přetáhni sem PDF odkudkoliv — přečte ho AI a předvyplní pole — nebo fakturu zadej ručně.'
              : 'Zkus jiný rok, stav nebo hledaný výraz.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([groupYear, items]) => (
            <div key={groupYear} className="space-y-1">
              <div className="flex items-center justify-between gap-2 px-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {groupYear} · {items.length} {items.length === 1 ? 'faktura' : items.length < 5 ? 'faktury' : 'faktur'}
                </span>
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {sumByCurrency(items)}
                </span>
              </div>
              <div className="bg-white border border-border rounded-2xl p-1.5 space-y-0.5">
                {items.map(invoice => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <InvoiceUploadModal
          onClose={() => setModal(null)}
          projects={projects}
          initialFile={modal.file}
        />
      )}
    </div>
  )
}
