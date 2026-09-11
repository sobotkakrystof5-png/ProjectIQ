'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  InvoiceFields, emptyInvoiceForm, validateInvoiceForm, invoiceFormToFormData,
  type InvoiceFormState,
} from '@/components/InvoiceFields'
import type { InvoiceAiExtract } from '@/lib/types'
import { createInvoice, updateInvoice } from '@/app/hub/finance/invoice-actions'
import type { InvoiceListItem, InvoiceProjectOption } from '@/app/hub/finance/invoice-actions'

/** Převede existující fakturu do stavu formuláře. */
function invoiceToForm(invoice: InvoiceListItem): InvoiceFormState {
  return {
    invoice_number: invoice.invoice_number,
    project_id: invoice.project_id ?? '',
    client_name: invoice.client_name ?? '',
    client_ico: invoice.client_ico ?? '',
    client_dic: invoice.client_dic ?? '',
    issued_on: invoice.issued_on,
    due_on: invoice.due_on ?? '',
    paid_on: invoice.paid_on ?? '',
    amount: String(invoice.amount),
    currency: invoice.currency,
    note: invoice.note ?? '',
  }
}

/**
 * Zadání faktury + nahrání PDF. Pole umí předvyplnit AI („Načíst z PDF"
 * v `InvoiceFields`), ale ruční cesta funguje pořád — přepis je nabídka,
 * ne podmínka uložení.
 */
export function InvoiceUploadModal({
  onClose,
  invoice,
  projects,
  defaults,
}: {
  onClose: () => void
  /** Když je vyplněná, modal edituje místo zakládání */
  invoice?: InvoiceListItem
  /** Když chybí, výběr zakázky se nezobrazí — faktura patří k zakázce z `defaults` */
  projects?: InvoiceProjectOption[]
  defaults?: Partial<InvoiceFormState>
}) {
  const router = useRouter()
  const [form, setForm] = useState<InvoiceFormState>(
    invoice ? invoiceToForm(invoice) : emptyInvoiceForm(defaults)
  )
  const [file, setFile] = useState<File | null>(null)
  const [removePdf, setRemovePdf] = useState(false)
  /** Co z PDF vyčetla AI — ukládá se k faktuře kvůli dohledatelnosti */
  const [aiExtracted, setAiExtracted] = useState<InvoiceAiExtract | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const existingPdfName = invoice && invoice.has_pdf && !removePdf ? invoice.pdf_filename : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSaving) return

    const validationError = validateInvoiceForm(form, file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsSaving(true)
    const fd = invoiceFormToFormData(form, file, removePdf, aiExtracted)
    const result = invoice ? await updateInvoice(invoice.id, fd) : await createInvoice(fd)
    setIsSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white border border-border rounded-2xl shadow-lg w-full max-w-xl my-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            {invoice ? 'Upravit fakturu' : 'Nová faktura'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-4">
          <InvoiceFields
            value={form}
            onChange={setForm}
            file={file}
            onFileChange={f => {
              setFile(f)
              if (f) setRemovePdf(false)
              // Přepis patří ke konkrétnímu souboru — po výměně PDF by
              // uložený výstup AI odkazoval na dokument, který tu už není.
              setAiExtracted(null)
            }}
            onAiExtracted={setAiExtracted}
            existingPdfName={existingPdfName}
            onRemoveExistingPdf={() => setRemovePdf(true)}
            projects={projects}
            disabled={isSaving}
          />

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
              <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isSaving && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
            {invoice ? 'Uložit' : 'Přidat fakturu'}
          </button>
        </div>
      </form>
    </div>
  )
}
