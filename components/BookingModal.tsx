'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Phone, Monitor, Video,
  MessageSquare, Loader2, CheckCircle2, CalendarDays, HelpCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { submitConsultation } from '@/app/portal-actions'
import { SlotPicker } from '@/components/consultations/slot-picker'
import type { FreeSlot } from '@/lib/consultations/rules'
import { cn } from '@/lib/utils'

// ─── Types & constants ────────────────────────────────────────────────────────

const CHANNELS = [
  { id: 'whatsapp' as const, label: 'WhatsApp',        icon: MessageSquare },
  { id: 'teams'    as const, label: 'Microsoft Teams', icon: Monitor },
  { id: 'meet'     as const, label: 'Google Meet',     icon: Video },
  { id: 'phone'    as const, label: 'Klasický hovor',  icon: Phone },
  { id: 'other'    as const, label: 'Jiné',            icon: HelpCircle },
]

const formSchema = z.object({
  clientWish: z.string().min(1, 'Popis je povinný').max(1000, 'Maximálně 1000 znaků'),
  clientEmail: z.string().email('Neplatný e-mail'),
  channel: z.enum(['whatsapp', 'teams', 'meet', 'phone', 'other']),
  channelOtherText: z.string().max(200).optional(),
}).refine(d => d.channel !== 'other' || (d.channelOtherText ?? '').trim().length > 0, {
  message: 'Upřesněte prosím preferovaný kanál',
  path: ['channelOtherText'],
})
type FormValues = z.infer<typeof formSchema>

interface BookingModalProps {
  token: string
  /** Volné časy z volna pro klienty (KP14, migrace 123). */
  freeSlots: FreeSlot[]
  /** Dnešní pražský den 'YYYY-MM-DD'. */
  today: string
  isOpen: boolean
  onClose: () => void
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
        className="w-16 h-16 rounded-full bg-navy-50 border border-navy-100 flex items-center justify-center mb-5"
      >
        <CheckCircle2 size={28} strokeWidth={1.5} className="text-navy-700" />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-xl font-semibold text-ink mb-2"
      >
        Konzultace rezervována
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-sm text-quiet leading-relaxed max-w-xs mb-8"
      >
        Děkujeme za váš zájem. Rezervaci máme a na konzultaci se důkladně
        připravíme. Potvrzení pošleme na e-mail, který u projektu máme.
      </motion.p>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        type="button"
        onClick={onClose}
        className="bg-navy-700 text-white text-sm font-semibold px-6 py-2.5 rounded-chip shadow-sm hover:bg-navy-800 transition-colors"
      >
        Zavřít
      </motion.button>
    </motion.div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BookingModal({ token, freeSlots, today, isOpen, onClose }: BookingModalProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { channel: 'meet' },
  })

  const selectedChannel = watch('channel')

  const resetModal = useCallback(() => {
    setSelectedDay(null)
    setSelectedStart(null)
    setSlotError(null)
    setServerError(null)
    setSuccess(false)
    reset()
  }, [reset])

  function handleClose() {
    onClose()
    setTimeout(resetModal, 350) // after exit animation
  }

  const onSubmit = handleSubmit(async (data) => {
    if (!selectedStart) {
      setSlotError('Vyberte prosím den a čas konzultace.')
      return
    }
    setSlotError(null)
    setServerError(null)
    try {
      const res = await submitConsultation(token, { ...data, scheduledAt: selectedStart })
      if (res.success) setSuccess(true)
      else setServerError(res.error ?? 'Rezervace se nepovedla. Zkuste to prosím znovu.')
    } catch {
      setServerError('Rezervace se nepovedla. Zkuste to prosím znovu.')
    }
  })

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose() }}>
      <DialogContent className="flex max-h-[92dvh] max-w-xl flex-col gap-0 p-0 sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 border-b border-navy-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <CalendarDays size={17} strokeWidth={1.5} className="text-navy-600" aria-hidden="true" />
            Rezervovat konzultaci
          </DialogTitle>
          <DialogDescription className="sr-only">Vyberte si den, čas a způsob spojení.</DialogDescription>
        </DialogHeader>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {success ? (
            <SuccessScreen key="success" onClose={handleClose} />
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={onSubmit}
              className="p-5 space-y-5"
            >
              {/* Den a čas z volna pro klienty (KP14) */}
              <div className="rounded-chip border border-navy-100 bg-navy-50 p-4">
                <SlotPicker
                  slots={freeSlots}
                  today={today}
                  day={selectedDay}
                  value={selectedStart}
                  onDayChange={(d) => { setSelectedDay(d); setSelectedStart(null); setSlotError(null) }}
                  onChange={(start) => { setSelectedStart(start); setSlotError(null) }}
                />
              </div>

              {slotError && (
                <p className="text-xs text-danger font-medium">{slotError}</p>
              )}

              {/* Description */}
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Co potřebujete zlepšit / jaké je vaše přání?
                </label>
                <textarea
                  {...register('clientWish')}
                  rows={3}
                  maxLength={1000}
                  placeholder="Popište, co konkrétně potřebujete probrat…"
                  className={cn(
                    'w-full border border-navy-100 rounded-chip px-3 py-2.5 text-sm text-ink',
                    'placeholder:text-quiet bg-surface resize-none',
                    'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow',
                    errors.clientWish && 'border-danger/30 ring-1 ring-danger/30',
                  )}
                />
                {errors.clientWish && (
                  <p className="text-xs text-danger mt-1">{errors.clientWish.message}</p>
                )}
              </div>

              {/* Client email */}
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Váš e-mail (ozveme se na něj, kdyby bylo potřeba)
                </label>
                <input
                  type="email"
                  {...register('clientEmail')}
                  placeholder="vas@email.cz"
                  className={cn(
                    'w-full border border-navy-100 rounded-chip px-3 py-2.5 text-sm text-ink',
                    'placeholder:text-quiet bg-surface',
                    'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow',
                    errors.clientEmail && 'border-danger/30 ring-1 ring-danger/30',
                  )}
                />
                {errors.clientEmail && (
                  <p className="text-xs text-danger mt-1">{errors.clientEmail.message}</p>
                )}
              </div>

              {/* Channel */}
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Preferovaný komunikační kanál
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CHANNELS.map(ch => {
                    const Icon = ch.icon
                    const isActive = selectedChannel === ch.id
                    return (
                      <label
                        key={ch.id}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-3 rounded-chip border cursor-pointer',
                          'transition-all duration-150 select-none',
                          isActive
                            ? 'border-navy-400 bg-navy-50 text-navy-800'
                            : 'border-navy-100 bg-surface text-quiet hover:border-navy-200 hover:bg-navy-50',
                        )}
                      >
                        <input
                          type="radio"
                          value={ch.id}
                          {...register('channel')}
                          className="sr-only"
                        />
                        <Icon
                          size={16}
                          strokeWidth={1.5}
                          className={isActive ? 'text-navy-600' : 'text-quiet'}
                        />
                        <span className="text-sm font-medium">{ch.label}</span>
                      </label>
                    )
                  })}
                </div>
                {errors.channel && (
                  <p className="text-xs text-danger mt-1">{errors.channel.message}</p>
                )}
                {selectedChannel === 'other' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Napište, co vám vyhovuje…"
                      {...register('channelOtherText')}
                      className="w-full px-3.5 py-2.5 text-sm rounded-chip border border-navy-100 bg-surface placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-300"
                    />
                    {errors.channelOtherText && (
                      <p className="text-xs text-danger mt-1">{errors.channelOtherText.message}</p>
                    )}
                  </div>
                )}
              </div>

              {serverError && (
                <p className="text-xs text-danger font-medium bg-danger/5 border border-danger/30 rounded-chip px-3 py-2.5">
                  {serverError}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 bg-navy-700',
                  'text-white text-sm font-semibold py-3 rounded-chip shadow-sm',
                  'hover:bg-navy-800 transition-colors disabled:opacity-60',
                )}
              >
                {isSubmitting
                  ? <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Rezervuji…</>
                  : 'Potvrdit rezervaci'
                }
              </button>
            </motion.form>
          )}
        </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
