'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Download, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cancelInvoiceAction } from '@/app/dashboard/faktury/actions'

/**
 * Akce vystavené faktury (AD12).
 *
 * Záměrně tu **není** „Upravit" ani „Smazat". Vystavený daňový doklad se
 * nemění a nemaže — odmítne to i databáze (migrace 107). Oprava se dělá
 * stornem a novou fakturou, aby v číselné řadě nevznikla díra.
 */
export function IssuedInvoiceActions({
  invoiceId,
  invoiceNumber,
  clientEmail,
  cancelled,
}: {
  invoiceId: string
  invoiceNumber: string
  clientEmail: string | null
  cancelled: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sending, setSending] = useState(false)

  function send() {
    if (!clientEmail) {
      toast.error('Faktura nemá e-mail odběratele.')
      return
    }
    setSending(true)
    start(async () => {
      try {
        const response = await fetch(`/api/invoices/${invoiceId}/odeslat`, { method: 'POST' })
        const data = (await response.json()) as { ok?: boolean; error?: string }
        if (!response.ok || !data.ok) {
          toast.error(data.error ?? 'E-mail se nepodařilo odeslat. Zkuste to prosím znovu.')
          return
        }
        toast.success(`Faktura odešla na ${clientEmail}.`)
        router.refresh()
      } catch {
        toast.error('E-mail se nepodařilo odeslat. Zkuste to prosím znovu.')
      } finally {
        setSending(false)
      }
    })
  }

  function cancelInvoice() {
    if (!confirm(`Stornovat fakturu ${invoiceNumber}? Doklad zůstane v evidenci, ale přestane platit.`)) return
    start(async () => {
      const result = await cancelInvoiceAction(invoiceId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Faktura je stornovaná.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noopener noreferrer">
          <Download size={15} strokeWidth={1.75} aria-hidden />
          Stáhnout PDF
        </a>
      </Button>

      {!cancelled && (
        <Button type="button" variant="outline" onClick={send} disabled={pending || !clientEmail}>
          {sending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Mail size={15} strokeWidth={1.75} aria-hidden />}
          Poslat e-mailem
        </Button>
      )}

      {!cancelled && (
        <Button type="button" variant="ghost" onClick={cancelInvoice} disabled={pending}>
          <Ban size={15} strokeWidth={1.75} aria-hidden />
          Stornovat
        </Button>
      )}
    </div>
  )
}
