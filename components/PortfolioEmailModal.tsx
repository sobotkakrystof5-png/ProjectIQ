'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, MessageSquareText, ArrowLeft, Send } from 'lucide-react'
import { toast } from 'sonner'
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
    'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow bg-white'

  return (
    <AnimatePresence>
      {isOpen && lead && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="brand-gradient px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MessageSquareText size={16} strokeWidth={1.5} className="text-brand-200" />
                  <span className="text-white font-semibold text-sm">
                    {step === 'edit' ? 'Napsat jinou zprávu' : 'Náhled zprávy'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-brand-200 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Zavřít"
                >
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Komu: <span className="font-medium text-foreground">{lead.email}</span>
                </p>

                {step === 'edit' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 brand-gradient',
                          'text-white text-sm font-semibold py-2.5 rounded-xl shadow-sm',
                          'hover:opacity-90 transition-opacity disabled:opacity-50'
                        )}
                      >
                        Potvrdit
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 text-sm text-muted-foreground rounded-xl border border-border hover:bg-muted transition-colors"
                      >
                        Zrušit
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border border-border rounded-xl bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        {subject}
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{body}</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSend}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl shadow-sm hover:bg-green-700 transition-colors disabled:opacity-60"
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
                        className="flex items-center gap-1.5 px-4 text-sm text-muted-foreground rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <ArrowLeft size={14} strokeWidth={1.5} />
                        Zpět upravit
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
