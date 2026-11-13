'use client'

import { useEffect, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { X, Loader2, MessageSquareText, ArrowLeft, Send } from 'lucide-react'
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

  return (
    <AnimatePresence>
      {isOpen && lead && (
        <>
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
            onClick={handleClose}
          />

          <m.div
            key="panel"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-lg bg-surface rounded-box shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between bg-navy-800 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <MessageSquareText size={16} strokeWidth={1.5} className="text-navy-200" />
                  <span className="text-white font-semibold text-sm">
                    {step === 'edit' ? 'Napsat jinou zprávu' : 'Náhled zprávy'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-chip text-navy-200 hover:text-white hover:bg-surface/10 transition-colors"
                  aria-label="Zavřít"
                >
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-quiet">
                  Komu: <span className="font-medium text-ink">{lead.email}</span>
                </p>

                {step === 'edit' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-quiet uppercase tracking-wide">
                        Předmět
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-quiet uppercase tracking-wide">
                        Text zprávy
                      </label>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={12}
                        className={cn(inputCls, 'resize-none font-sans leading-relaxed')}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!subject.trim() || !body.trim()}
                        onClick={() => setStep('preview')}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-navy-700 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
                      >
                        Potvrdit
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex min-h-11 items-center rounded-full border border-input px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-navy-50"
                      >
                        Zrušit
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-chip border border-navy-100 bg-navy-50/60 px-4 py-3">
                      <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">
                        {subject}
                      </p>
                      <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{body}</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSend}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-navy-700 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                      >
                        {isPending ? (
                          <>
                            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Odesílám…
                          </>
                        ) : (
                          <>
                            <Send size={14} strokeWidth={1.5} /> Odeslat
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setStep('edit')}
                        className="flex items-center gap-1.5 px-4 text-sm text-quiet rounded-chip border border-navy-100 hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <ArrowLeft size={14} strokeWidth={1.5} />
                        Zpět upravit
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
