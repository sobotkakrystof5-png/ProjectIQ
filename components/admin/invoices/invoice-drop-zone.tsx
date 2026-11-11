'use client'

import { useState } from 'react'
import { Plus, UploadCloud } from 'lucide-react'
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { usePdfDrop } from '@/lib/use-pdf-drop'
import type { InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'

/**
 * Jediné klientské místo evidence faktur (AD07): přetažení PDF na obrazovku
 * a formulář nové faktury. Tabulka pod tím je serverová.
 */
export function InvoiceDropZone({
  projects,
  children,
}: {
  projects: InvoiceProjectOption[]
  children: React.ReactNode
}) {
  const [modal, setModal] = useState<{ file?: File } | null>(null)

  // Fakturu jde hodit rovnou na evidenci — formulář se otevře s PDF a AI ho přečte.
  const { isOver, dropProps } = usePdfDrop({
    onFile: (file) => setModal({ file }),
    onReject: (message) => toast.error(message),
  })

  return (
    <div className="relative" {...dropProps}>
      {isOver && (
        <div className="pointer-events-none absolute -inset-3 z-20 flex flex-col items-center justify-center gap-1.5 rounded-panel border-2 border-dashed border-navy-300 bg-navy-50/95">
          <UploadCloud size={22} strokeWidth={1.5} className="text-navy-700" />
          <span className="text-sm font-semibold text-ink">Pusťte fakturu sem</span>
          <span className="text-xs text-quiet">PDF přečte AI a předvyplní pole</span>
        </div>
      )}
      {children}
      {modal && <InvoiceUploadModal onClose={() => setModal(null)} projects={projects} initialFile={modal.file} />}
    </div>
  )
}

/** Hlavní akce obrazovky Faktury. */
export function NewInvoiceButton({ projects }: { projects: InvoiceProjectOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={1.5} />
        Nová faktura
      </Button>
      {open && <InvoiceUploadModal onClose={() => setOpen(false)} projects={projects} />}
    </>
  )
}
