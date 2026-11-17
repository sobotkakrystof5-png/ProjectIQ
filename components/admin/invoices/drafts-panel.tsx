'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { dismissInvoiceDraft, restoreInvoiceDraft, saveDraftEmail } from '@/app/dashboard/faktury/koncepty-actions'
import { DRAFT_SOURCE_LABELS, draftGaps, gapsSentence, periodLabel } from '@/lib/admin/invoice-draft-schema'
import type { InvoiceDraft } from '@/lib/admin/invoice-drafts'

/**
 * Faktury › Ke schválení (R-117). Koncepty, které se připravily samy
 * (hotová zakázka, asistent, pravidelná faktura) nebo je někdo uložil
 * rozepsané. Jedno kliknutí „Schválit a poslat" fakturu vystaví (teprve
 * teď dostane číslo) a pošle klientovi s PDF.
 *
 * Než odejde, je deset vteřin na „Zpět" — číslo se do té doby nepřiděluje,
 * takže zrušené odeslání v řadě faktur nic nenechá.
 */

const SEND_DELAY_MS = 10_000

export function DraftsPanel({ drafts }: { drafts: InvoiceDraft[] }) {
  return (
    <Card id="ke-schvaleni">
      <CardHead
        title={drafts.length > 0 ? `Ke schválení · ${drafts.length}` : 'Ke schválení'}
        hint={
          drafts.length > 0
            ? 'Zkontrolujte a jedním kliknutím vystavte a pošlete klientovi.'
            : 'Nic nečeká. Koncept se připraví sám, když zakázku označíte jako hotovou, z pravidelné faktury nebo od asistenta.'
        }
        action={
          <Link
            href="/dashboard/faktury/pravidelne"
            className="inline-flex h-11 items-center text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
          >
            Pravidelné faktury
          </Link>
        }
      />
      {drafts.length > 0 && (
        <ul className="flex flex-col divide-y divide-navy-100">
          {drafts.map(draft => (
            <DraftRow key={draft.id} draft={draft} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function DraftRow({ draft }: { draft: InvoiceDraft }) {
  const router = useRouter()
  const [email, setEmail] = useState(draft.email)
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'sending'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Chybějící e-mail se dá dopsat rovnou tady; ostatní mezery se doplňují v úpravě.
  const gaps = draftGaps({ counterparty: draft.counterparty, email, items: draft.items })
  const editHref = `/dashboard/faktury/nova?koncept=${draft.id}`
  const who = draft.counterparty.name || 'Bez odběratele'
  const what = draft.items.find(item => item.description.trim() !== '')?.description ?? ''
  const context = draft.recurringLabel
    ? `${draft.recurringLabel}${draft.period ? ` · ${periodLabel(draft.period)}` : ''}`
    : draft.projectLabel

  const persistEmail = () => {
    if (email.trim() === draft.email) return
    start(async () => {
      const result = await saveDraftEmail(draft.id, email.trim())
      if (result.error) toast.error(result.error)
    })
  }

  const send = async () => {
    setPhase('sending')
    try {
      const response = await fetch(`/api/invoices/drafts/${draft.id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: email.trim() }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        number?: string
        invoiceHref?: string
        editHref?: string
      }
      if (!response.ok) {
        toast.error(data.error ?? 'Fakturu se nepodařilo odeslat.')
        setPhase('idle')
        if (data.invoiceHref) router.push(data.invoiceHref)
        else router.refresh()
        return
      }
      toast.success(`Faktura ${data.number ?? ''} odeslaná`.replace(/\s+/g, ' '), { description: email.trim() })
      router.refresh()
    } catch {
      toast.error('Fakturu se nepodařilo odeslat. Zkontrolujte připojení.')
      setPhase('idle')
    }
  }

  const approve = () => {
    setPhase('waiting')
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setPhase('idle')
    }
    timer.current = setTimeout(() => {
      timer.current = null
      void send()
    }, SEND_DELAY_MS)
    toast.message(`Faktura pro ${who} odejde za 10 s`, {
      description: email.trim(),
      undo: cancel,
      duration: SEND_DELAY_MS,
    })
  }

  const cancelWaiting = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPhase('idle')
  }

  const dismiss = () => {
    start(async () => {
      const result = await dismissInvoiceDraft(draft.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      router.refresh()
      toast.message('Koncept zahozený', {
        undo: () => {
          void restoreInvoiceDraft(draft.id).then(r => {
            if (r.error) toast.error(r.error)
            router.refresh()
          })
        },
      })
    })
  }

  const busy = phase !== 'idle'

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{who}</span>
          <Badge variant="neutral">{DRAFT_SOURCE_LABELS[draft.source]}</Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-quiet">
          {[what, context].filter(Boolean).join(' · ') || 'Bez položek'}
        </p>
        {gaps.length > 0 && (
          <p className="mt-1 text-sm text-ink">
            Chybí {gapsSentence(gaps)}.{' '}
            <Link href={editHref} className="font-medium text-navy-700 underline underline-offset-4">
              Doplnit
            </Link>
          </p>
        )}
      </div>

      <p className="font-num text-[17px] font-semibold tabular-nums text-ink lg:w-32 lg:text-right">
        {money(draft.total, draft.currency)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onBlur={persistEmail}
          placeholder="E-mail klienta"
          aria-label={`E-mail, kam poslat fakturu pro ${who}`}
          className="w-full sm:w-60"
          disabled={busy}
        />
        {phase === 'waiting' ? (
          <Button type="button" variant="outline" onClick={cancelWaiting}>
            Zpět, neposílat
          </Button>
        ) : (
          <Button type="button" onClick={approve} disabled={busy || pending || gaps.length > 0}>
            <Send size={16} strokeWidth={1.75} aria-hidden />
            {phase === 'sending' ? 'Posílám…' : 'Schválit a poslat'}
          </Button>
        )}
        <Link
          href={editHref}
          aria-disabled={busy}
          className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold text-ink hover:bg-accent"
        >
          Upravit
        </Link>
        <Button type="button" variant="ghost" onClick={dismiss} disabled={busy || pending}>
          Zahodit
        </Button>
      </div>
    </li>
  )
}
