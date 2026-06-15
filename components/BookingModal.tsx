'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  X, ChevronLeft, ChevronRight, Phone, Monitor, Video,
  MessageSquare, Loader2, CheckCircle2, CalendarDays, HelpCircle,
} from 'lucide-react'
import { submitConsultation } from '@/app/portal-actions'
import {
  getPragueNow, getHourSlots, pragueSlotToISO, isSlotPast, isDayPast,
  isSlotBooked, getDaysInMonth, getMonthStartOffset, toMondayFirst,
} from '@/lib/prague-time'
import { cn } from '@/lib/utils'

// ─── Types & constants ────────────────────────────────────────────────────────

const WEEKDAYS_CZ = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const MONTHS_CZ = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

interface SelectedDate { year: number; month: number; day: number }

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
  bookedSlots: string[]   // UTC ISO strings
  isOpen: boolean
  onClose: () => void
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  viewYear, viewMonth, selectedDate, bookedSlots, onSelectDate, onPrevMonth, onNextMonth,
}: {
  viewYear: number
  viewMonth: number
  selectedDate: SelectedDate | null
  bookedSlots: string[]
  onSelectDate: (d: SelectedDate) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const now = getPragueNow()
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const startOffset = getMonthStartOffset(viewYear, viewMonth)
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const canPrev =
    viewYear > now.year || (viewYear === now.year && viewMonth > now.month)

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!canPrev}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-brand-50 hover:text-brand-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Předchozí měsíc"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS_CZ[viewMonth - 1]} {viewYear}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-brand-50 hover:text-brand-800 transition-colors"
          aria-label="Následující měsíc"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_CZ.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1
          if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} />

          const dow = new Date(viewYear, viewMonth - 1, dayNum).getDay()
          const isPast = isDayPast(viewYear, viewMonth, dayNum, now)
          const isSelected =
            selectedDate?.year === viewYear &&
            selectedDate?.month === viewMonth &&
            selectedDate?.day === dayNum
          const isToday =
            now.year === viewYear && now.month === viewMonth && now.day === dayNum
          const isWeekend = dow === 0 || dow === 6

          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onSelectDate({ year: viewYear, month: viewMonth, day: dayNum })}
              className={cn(
                'aspect-square flex items-center justify-center text-sm rounded-lg transition-all duration-150 font-medium',
                isPast && 'text-gray-300 cursor-not-allowed',
                !isPast && isWeekend && !isSelected && 'text-brand-600 hover:bg-brand-50',
                !isPast && !isWeekend && !isSelected && 'text-foreground hover:bg-brand-50 hover:text-brand-800',
                isToday && !isSelected && 'ring-1 ring-brand-300',
                isSelected && 'brand-gradient text-white shadow-sm scale-110',
              )}
              aria-label={`${dayNum}. ${viewMonth}. ${viewYear}`}
            >
              {dayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Time slot picker ─────────────────────────────────────────────────────────

function TimeSlotPicker({
  date, bookedSlots, selectedHour, onSelectHour,
}: {
  date: SelectedDate
  bookedSlots: string[]
  selectedHour: number | null
  onSelectHour: (h: number) => void
}) {
  const now = getPragueNow()
  const dow = new Date(date.year, date.month - 1, date.day).getDay()
  const slots = getHourSlots(dow)

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
        Dostupné časy
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map(h => {
          const past = isSlotPast(date.year, date.month, date.day, h, now)
          const booked = isSlotBooked(bookedSlots, date.year, date.month, date.day, h)
          const isSelected = selectedHour === h
          const disabled = past || booked

          return (
            <button
              key={h}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelectHour(h)}
              className={cn(
                'py-2 text-xs font-semibold rounded-lg border transition-all duration-150',
                disabled && 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through',
                !disabled && !isSelected && 'border-brand-100 bg-brand-50 text-brand-700 hover:border-brand-400 hover:bg-brand-100',
                isSelected && 'brand-gradient text-white border-transparent shadow-sm',
              )}
              title={booked ? 'Obsazeno' : past ? 'Uplynulý čas' : `${h}:00`}
            >
              {h}:00
            </button>
          )
        })}
      </div>
    </div>
  )
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
        className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-5"
      >
        <CheckCircle2 size={28} strokeWidth={1.5} className="text-emerald-600" />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-xl font-semibold text-foreground mb-2"
      >
        Konzultace rezervována
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-8"
      >
        Děkujeme za váš projevený zájem. Potvrzení obdržíte e-mailem
        a na konzultaci se důkladně připravíme.
      </motion.p>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        type="button"
        onClick={onClose}
        className="brand-gradient text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
      >
        Zavřít
      </motion.button>
    </motion.div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BookingModal({ token, bookedSlots, isOpen, onClose }: BookingModalProps) {
  const now = getPragueNow()

  const [viewYear, setViewYear] = useState(now.year)
  const [viewMonth, setViewMonth] = useState(now.month)
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { channel: 'meet' },
  })

  const selectedChannel = watch('channel')

  const resetModal = useCallback(() => {
    setSelectedDate(null)
    setSelectedHour(null)
    setSlotError(null)
    setServerError(null)
    setSuccess(false)
    reset()
    const n = getPragueNow()
    setViewYear(n.year)
    setViewMonth(n.month)
  }, [reset])

  function handleClose() {
    onClose()
    setTimeout(resetModal, 350) // after exit animation
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
    setSelectedDate(null); setSelectedHour(null)
  }

  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
    setSelectedDate(null); setSelectedHour(null)
  }

  const onSubmit = handleSubmit(async (data) => {
    if (!selectedDate || selectedHour === null) {
      setSlotError('Vyberte prosím datum a čas konzultace.')
      return
    }
    setSlotError(null)
    setServerError(null)
    const iso = pragueSlotToISO(selectedDate.year, selectedDate.month, selectedDate.day, selectedHour)
    try {
      const res = await submitConsultation(token, { ...data, scheduledAt: iso })
      if (res.success) setSuccess(true)
      else setServerError(res.error ?? 'Chyba serveru. Zkuste to prosím znovu.')
    } catch {
      setServerError('Chyba serveru. Zkuste to prosím znovu.')
    }
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 sm:inset-0 z-50 flex sm:items-center sm:justify-center p-0 sm:p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[85vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="brand-gradient px-5 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <CalendarDays size={17} strokeWidth={1.5} className="text-brand-200" />
                  <span className="text-white font-semibold text-sm">Rezervovat konzultaci</span>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-brand-200 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Zavřít"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>

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
                      {/* Calendar */}
                      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
                        <MonthCalendar
                          viewYear={viewYear}
                          viewMonth={viewMonth}
                          selectedDate={selectedDate}
                          bookedSlots={bookedSlots}
                          onSelectDate={d => { setSelectedDate(d); setSelectedHour(null); setSlotError(null) }}
                          onPrevMonth={prevMonth}
                          onNextMonth={nextMonth}
                        />
                      </div>

                      {/* Time slots */}
                      <AnimatePresence>
                        {selectedDate && (
                          <motion.div
                            key="timeslots"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <TimeSlotPicker
                              date={selectedDate}
                              bookedSlots={bookedSlots}
                              selectedHour={selectedHour}
                              onSelectHour={h => { setSelectedHour(h); setSlotError(null) }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {slotError && (
                        <p className="text-xs text-red-600 font-medium">{slotError}</p>
                      )}

                      {/* Description */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                          Co potřebujete zlepšit / jaké je vaše přání?
                        </label>
                        <textarea
                          {...register('clientWish')}
                          rows={3}
                          maxLength={1000}
                          placeholder="Popište, co konkrétně potřebujete probrat…"
                          className={cn(
                            'w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground',
                            'placeholder-muted-foreground bg-white resize-none',
                            'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow',
                            errors.clientWish && 'border-red-300 ring-1 ring-red-200',
                          )}
                        />
                        {errors.clientWish && (
                          <p className="text-xs text-red-600 mt-1">{errors.clientWish.message}</p>
                        )}
                      </div>

                      {/* Client email */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                          Váš e-mail (pro potvrzení rezervace)
                        </label>
                        <input
                          type="email"
                          {...register('clientEmail')}
                          placeholder="vas@email.cz"
                          className={cn(
                            'w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground',
                            'placeholder-muted-foreground bg-white',
                            'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow',
                            errors.clientEmail && 'border-red-300 ring-1 ring-red-200',
                          )}
                        />
                        {errors.clientEmail && (
                          <p className="text-xs text-red-600 mt-1">{errors.clientEmail.message}</p>
                        )}
                      </div>

                      {/* Channel */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                          Preferovaný komunikační kanál
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {CHANNELS.map(ch => {
                            const Icon = ch.icon
                            const isActive = selectedChannel === ch.id
                            return (
                              <label
                                key={ch.id}
                                className={cn(
                                  'flex items-center gap-3 px-3.5 py-3 rounded-xl border cursor-pointer',
                                  'transition-all duration-150 select-none',
                                  isActive
                                    ? 'border-brand-400 bg-brand-50 text-brand-800'
                                    : 'border-border bg-white text-muted-foreground hover:border-brand-200 hover:bg-brand-50',
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
                                  className={isActive ? 'text-brand-600' : 'text-muted-foreground'}
                                />
                                <span className="text-sm font-medium">{ch.label}</span>
                              </label>
                            )
                          })}
                        </div>
                        {errors.channel && (
                          <p className="text-xs text-red-600 mt-1">{errors.channel.message}</p>
                        )}
                        {selectedChannel === 'other' && (
                          <div className="mt-2">
                            <input
                              type="text"
                              placeholder="Napište, co vám vyhovuje…"
                              {...register('channelOtherText')}
                              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-white placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-300"
                            />
                            {errors.channelOtherText && (
                              <p className="text-xs text-red-600 mt-1">{errors.channelOtherText.message}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {serverError && (
                        <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                          {serverError}
                        </p>
                      )}

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 brand-gradient',
                          'text-white text-sm font-semibold py-3 rounded-xl shadow-sm',
                          'hover:opacity-90 transition-opacity disabled:opacity-60',
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
