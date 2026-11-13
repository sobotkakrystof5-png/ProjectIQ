'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { sendCustomLeadEmail } from '@/app/calls-actions'
import { buildPortfolioEmailBody, PORTFOLIO_EMAIL_SUBJECT } from '@/lib/portfolio-email'
import { getPragueTodayISO } from '@/lib/prague-time'
import { cn } from '@/lib/utils'
import type { ClientLead } from '@/lib/types'

interface PortfolioEmailModalProps {
  isOpen: boolean
  lead: ClientLead | null
  onClose: () => void
  onSent: () => void
}

/**
 * Napsat kontaktu vlastní zprávu (dva kroky: text → náhled → odeslat).
 *
 * Od AD18 je to Radix dialog: focus zůstane uvnitř, `Escape` zavírá
 * a čtečka ví, že je to modální okno. Dřív to byla ručně psaná překryvná
 * vrstva, ze které se dal tabulátorem vyjet na stránku pod ní.
 */
export function PortfolioEmailModal({ isOpen, lead, onClose, onSent }: PortfolioEmailModalProps) {
  const [step, setStep] = useState<'edit' | 'preview'>('edit')
  const [subject, setSubject] = useState(PORTFOLIO_EMAIL_SUBJECT)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isOpen && lead) {
      setSubject(PORTFOLIO_EMAIL_SUBJECT)
      setBody(
        buildPortfolioEmailBody({
          todayISO: getPragueTodayISO(),
          nextCallDateISO: lead.next_action_date,
        })
      )
      setStep('edit')
    }
  }, [isOpen, lead])

  function handleClose() {
    if (isPending) return
    onClose()
  }

  function handleSend() {
    if (!lead) return
    startTransition(async () => {
      const result = await sendCustomLeadEmail(lead.id, { subject, body })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Email odeslán')
      onSent()
      onClose()
    })
  }

  const inputCls =
    'w-full border border-navy-100 rounded-chip px-3 py-2 text-sm text-ink placeholder:text-quiet ' +
    'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface'

  if (!lead) return null

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 'edit' ? 'Napsat jinou zprávu' : 'Náhled zprávy'}</DialogTitle>
          <DialogDescription>
            Komu: <span className="font-medium text-ink">{lead.email}</span>
          </DialogDescription>
        </DialogHeader>

        {step === 'edit' ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Předmět</span>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Text zprávy</span>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={12}
                className={cn(inputCls, 'resize-none font-sans leading-relaxed')}
              />
            </label>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!subject.trim() || !body.trim()}
                onClick={() => setStep('preview')}
              >
                Potvrdit
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Zrušit
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-chip border border-navy-100 bg-navy-50/60 px-4 py-3">
              <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">{subject}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{body}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={isPending} onClick={handleSend}>
                {isPending ? (
                  <>
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Odesílám…
                  </>
                ) : (
                  <>
                    <Send size={14} strokeWidth={1.5} /> Odeslat
                  </>
                )}
              </Button>
              <Button variant="outline" disabled={isPending} onClick={() => setStep('edit')}>
                <ArrowLeft size={14} strokeWidth={1.5} />
                Zpět upravit
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
