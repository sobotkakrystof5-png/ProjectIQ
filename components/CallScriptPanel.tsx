'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, RotateCcw, Send, Check, Quote, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { buildCallScript, totalSeconds, formatClock, formatPrice, type CallStats } from '@/lib/call-script'
import { WEB_PACKAGES } from '@/lib/vizeon-pricing'
import { cn } from '@/lib/utils'
import type { ClientLead } from '@/lib/types'

interface CallScriptPanelProps {
  open: boolean
  lead: ClientLead | null
  stats: CallStats
  onClose: () => void
  onAddNote: (content: string) => void
  onSendPortfolio: () => void
  isPending: boolean
}

const MAX_REFERENCE_CHARS = 160

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

// Plovoucí panel, aby během hovoru zůstala vidět tabulka i poznámky.
// Jeden krok na obrazovce = jedna věc, kterou teď říct. Časomíra hlídá, aby pitch nepřetáhl.
export function CallScriptPanel({ open, lead, stats, onClose, onAddNote, onSendPortfolio, isPending }: CallScriptPanelProps) {
  const steps = useMemo(() => buildCallScript(stats), [stats])
  const target = totalSeconds(steps)

  const [stepIndex, setStepIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [note, setNote] = useState('')

  const restart = () => {
    setStepIndex(0)
    setStartedAt(Date.now())
    setNow(Date.now())
  }

  // Nový hovor (otevření nebo jiný kontakt) začíná od nuly.
  const leadId = lead?.id ?? null
  useEffect(() => {
    if (!open) return
    restart()
    setNote('')
  }, [open, leadId])

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight') setStepIndex(i => Math.min(i + 1, steps.length - 1))
      else if (e.key === 'ArrowLeft') setStepIndex(i => Math.max(i - 1, 0))
      else if (e.key === 'Escape') onClose()
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= steps.length) setStepIndex(Number(e.key) - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, steps.length, onClose])

  const elapsed = Math.max(0, (now - startedAt) / 1000)
  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1
  // Do konce aktuálního kroku by měl hovor stihnout tolik vteřin.
  const budgetUntilStepEnd = steps.slice(0, stepIndex + 1).reduce((sum, s) => sum + s.seconds, 0)
  const timeState = elapsed > target ? 'over' : elapsed > budgetUntilStepEnd ? 'behind' : 'ok'

  const reference = stats.reference
    ? {
        text: stats.reference.text.length > MAX_REFERENCE_CHARS
          ? `${stats.reference.text.slice(0, MAX_REFERENCE_CHARS).trimEnd()}…`
          : stats.reference.text,
        author: stats.reference.author,
      }
    : null

  const saveNote = () => {
    const content = note.trim()
    if (!content || !lead) return
    onAddNote(content)
    setNote('')
    toast.success('Zapsáno ke kontaktu')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="Opora pro hovor"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed z-40 bottom-3 left-3 right-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[400px] bg-white border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Hlavička: s kým mluvím + čas */}
          <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Opora pro hovor</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {lead ? lead.company_name : 'Nový hovor'}
                {lead?.contact_name && <span className="font-normal text-muted-foreground"> · {lead.contact_name}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  'font-mono text-sm tabular-nums px-1.5',
                  timeState === 'ok' && 'text-muted-foreground',
                  timeState === 'behind' && 'text-amber-600',
                  timeState === 'over' && 'text-red-600 font-semibold',
                )}
                title={`Cíl celého hovoru: ${formatClock(target)}`}
              >
                {formatClock(elapsed)}
                <span className="text-muted-foreground/60"> / {formatClock(target)}</span>
              </span>
              <button
                onClick={restart}
                title="Začít znovu"
                className="p-1.5 rounded-md text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <RotateCcw size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={onClose}
                title="Zavřít (Esc)"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Uplynulý čas vůči cíli */}
          <div className="h-1 bg-slate-100">
            <div
              className={cn(
                'h-full transition-[width] duration-1000 ease-linear',
                timeState === 'ok' && 'bg-brand-500',
                timeState === 'behind' && 'bg-amber-400',
                timeState === 'over' && 'bg-red-500',
              )}
              style={{ width: `${Math.min(elapsed / target, 1) * 100}%` }}
            />
          </div>

          {/* Kroky */}
          <nav className="grid grid-cols-4 gap-1 px-3 pt-3" aria-label="Kroky hovoru">
            {steps.map((s, i) => {
              const done = i < stepIndex
              const active = i === stepIndex
              return (
                <button
                  key={s.key}
                  onClick={() => setStepIndex(i)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-center transition-colors',
                    active && 'bg-brand-600 text-white shadow-sm',
                    done && 'bg-brand-50 text-brand-700 hover:bg-brand-100',
                    !active && !done && 'text-muted-foreground hover:bg-slate-50',
                  )}
                >
                  <span className="flex items-center gap-1 text-[12px] font-semibold leading-none">
                    {done ? <Check size={11} strokeWidth={2} /> : <span className="tabular-nums">{i + 1}</span>}
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className={cn('text-[10px] leading-none tabular-nums', active ? 'text-brand-100' : 'text-muted-foreground/70')}>
                    {s.seconds} s
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Co teď říct */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="px-4 pt-3 pb-2 min-h-[148px] space-y-3"
            >
              <div className="space-y-1.5">
                {step.say.map((line, i) => (
                  <p key={i} className="text-[15px] leading-snug font-medium text-foreground">{line}</p>
                ))}
              </div>

              {step.key === 'statistiky' && reference && (
                <figure className="flex gap-2 rounded-xl bg-slate-50 border border-border px-3 py-2">
                  <Quote size={14} strokeWidth={1.5} className="text-brand-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <blockquote className="text-[13px] text-foreground/80 italic leading-snug">„{reference.text}“</blockquote>
                    {reference.author && <figcaption className="text-[11px] text-muted-foreground mt-0.5">{reference.author}</figcaption>}
                  </div>
                </figure>
              )}

              {step.key === 'nabidka' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {WEB_PACKAGES.map(p => (
                    <div key={p.label} className="rounded-lg border border-border px-2 py-1.5 text-center">
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">{p.label}</p>
                      <p className="text-[13px] font-semibold text-foreground tabular-nums">{formatPrice(p.price)}</p>
                    </div>
                  ))}
                </div>
              )}

              {step.key === 'poptavka' && lead && (
                lead.email ? (
                  <button
                    onClick={onSendPortfolio}
                    disabled={isPending}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <Send size={13} strokeWidth={1.5} />
                    Poslat portfolio
                  </button>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Kontakt nemá e-mail. Zeptej se na něj, ať můžeš poslat ukázky.
                  </p>
                )
              )}

              <ul className="space-y-0.5">
                {step.tips.map((tip, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-muted-foreground leading-snug">
                    <span className="mt-[5px] w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          {/* Rychlá poznámka — co klient řekl, hned k jeho kontaktu */}
          {lead && (
            <form
              onSubmit={e => { e.preventDefault(); saveNote() }}
              className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg border border-border bg-slate-50/60 pl-2.5 pr-1 focus-within:ring-2 focus-within:ring-brand-300 focus-within:bg-white"
            >
              <StickyNote size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
                placeholder="Co potřebují…"
                className="flex-1 min-w-0 bg-transparent py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!note.trim() || isPending}
                className="text-xs font-medium px-2 py-1 rounded-md text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
              >
                Zapsat
              </button>
            </form>
          )}

          {/* Navigace */}
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <button
              onClick={() => setStepIndex(i => Math.max(i - 1, 0))}
              disabled={stepIndex === 0}
              className="flex items-center gap-1 text-sm font-medium px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
              Zpět
            </button>
            <span className="hidden sm:block text-[11px] text-muted-foreground/60">← → nebo 1–4</span>
            <button
              onClick={() => (isLast ? onClose() : setStepIndex(i => i + 1))}
              className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              {isLast ? 'Hotovo' : 'Další'}
              {isLast ? <Check size={15} strokeWidth={1.5} /> : <ChevronRight size={15} strokeWidth={1.5} />}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
