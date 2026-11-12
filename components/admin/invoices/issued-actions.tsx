'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cancelIssuedInvoice } from '@/app/dashboard/finance/invoice-actions'

/**
 * Akce u faktury vystavené v adminu (AD12).
 *
 * Co tu schválně **není**: Upravit a Smazat. Vystavený doklad je neměnný
 * (hlídá to trigger v migraci 107) a oprava se dělá stornem a novou fakturou.
 *
 * E-mail odchází jen na kliknutí a přes vlastní route, protože se k němu
 * vyrábí PDF — Chromium patří jen tam, kde pro něj build stopuje binárku.
 */
export function IssuedInvoiceActions({
  id,
  number,
  defaultEmail,
  cancelled,
  sentAt,
}: {
  id: string
  number: string
  defaultEmail: string | null
  cancelled: boolean
  sentAt: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [composing, setComposing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [pending, start] = useTransition()

  const send = async () => {
    setSending(true)
    try {
      const response = await fetch(`/api/invoices/${id}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: email }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? 'E-mail se nepodařilo odeslat.')
        return
      }
      toast.success('Faktura odeslaná')
      setComposing(false)
      router.refresh()
    } catch {
      toast.error('E-mail se nepodařilo odeslat. Zkontrolujte připojení.')
    } finally {
      setSending(false)
    }
  }

  const cancel = () => {
    start(async () => {
      const result = await cancelIssuedInvoice(id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Faktura ${number} stornovaná`)
      setConfirming(false)
      router.refresh()
    })
  }

  if (cancelled) {
    return <span className="text-sm text-quiet">Stornováno — opravu vystavte jako novou fakturu.</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {composing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="adresa@klient.cz"
            className="w-56"
            aria-label="E-mail odběratele"
          />
          <Button type="button" onClick={() => void send()} disabled={sending || email.trim() === ''}>
            {sending ? 'Posílám…' : 'Odeslat s PDF'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setComposing(false)}>
            Zpět
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setComposing(true)}>
          <Mail size={16} strokeWidth={1.75} />
          {sentAt ? 'Poslat znovu' : 'Poslat e-mailem'}
        </Button>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">Opravdu stornovat?</span>
          <Button type="button" variant="danger" onClick={cancel} disabled={pending}>
            {pending ? 'Stornuju…' : 'Ano, stornovat'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Zpět
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
          <Ban size={16} strokeWidth={1.75} />
          Storno
        </Button>
      )}
    </div>
  )
}
