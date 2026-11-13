'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  InvoiceFields, emptyInvoiceForm, validateInvoiceForm, invoiceFormToFormData,
  type InvoiceFormState,
} from '@/components/InvoiceFields'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { InvoiceAiExtract } from '@/lib/types'
import { createInvoice, updateInvoice } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceListItem, InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'

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
  initialFile,
}: {
  onClose: () => void
  /** Když je vyplněná, modal edituje místo zakládání */
  invoice?: InvoiceListItem
  /** Když chybí, výběr zakázky se nezobrazí — faktura patří k zakázce z `defaults` */
  projects?: InvoiceProjectOption[]
  defaults?: Partial<InvoiceFormState>
  /** PDF přetažené na archiv — modal se s ním otevře a rovnou ho nechá přečíst */
  initialFile?: File | null
}) {
  const router = useRouter()
  const [form, setForm] = useState<InvoiceFormState>(
    invoice ? invoiceToForm(invoice) : emptyInvoiceForm(defaults)
  )
  const [file, setFile] = useState<File | null>(initialFile ?? null)
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
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-navy-100 px-5 py-4">
            <DialogTitle className="text-base">{invoice ? 'Upravit fakturu' : 'Nová faktura'}</DialogTitle>
          </DialogHeader>

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
              autoParse={!invoice}
            />

            {error && (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-chip border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                <AlertCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="items-center border-t border-navy-100 px-5 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Zrušit
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              {invoice ? 'Uložit' : 'Přidat fakturu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
