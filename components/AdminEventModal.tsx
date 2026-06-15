'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, CalendarPlus, Lock } from 'lucide-react'
import { createCalendarEvent } from '@/app/calendar-actions'
import { cn } from '@/lib/utils'
import type { CalendarEventType } from '@/lib/types'

interface AdminEventModalProps {
  isOpen: boolean
  onClose: () => void
  defaultDate?: string   // 'YYYY-MM-DD' pre-fill the date field
  defaultHour?: number   // pre-fill the start hour
}

function toLocalDatetimeValue(date: string, hour: number): string {
  const h = String(hour).padStart(2, '0')
  return `${date}T${h}:00`
}

function localDatetimeToISO(localDt: string): string {
  // The datetime-local input gives us local time — we treat it as Prague time.
  // For simplicity, we parse it as a local timestamp and send it as-is;
  // the DB stores it as timestamptz (UTC). The server will receive the ISO string.
  // Since Next.js server actions run on the server (UTC), we must send Prague local ISO.
  // We approximate: assume the browser is in CET/CEST (Prague). For a single-admin
  // app this is acceptable; for global use, pragueSlotToISO would be used instead.
  return new Date(localDt).toISOString()
}

const EVENT_TYPES: { id: CalendarEventType; label: string; description: string; icon: typeof Lock }[] = [
  {
    id: 'manual',
    label: 'Událost / schůzka',
    description: 'Vlastní schůzka, úkol nebo připomínka',
    icon: CalendarPlus,
  },
  {
    id: 'block',
    label: 'Blokování času',
    description: 'Blokuj termín — klienti neuvidí volný slot',
    icon: Lock,
  },
]

export function AdminEventModal({ isOpen, onClose, defaultDate, defaultHour }: AdminEventModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const initDate = defaultDate ?? today
  const initHour = defaultHour ?? 10

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<CalendarEventType>('manual')
  const [startsAt, setStartsAt] = useState(toLocalDatetimeValue(initDate, initHour))
  const [endsAt, setEndsAt] = useState(toLocalDatetimeValue(initDate, initHour + 1))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function resetAndClose() {
    setTitle('')
    setDescription('')
    setEventType('manual')
    setError(null)
    const d = new Date().toISOString().split('T')[0]
    setStartsAt(toLocalDatetimeValue(d, 10))
    setEndsAt(toLocalDatetimeValue(d, 11))
    onClose()
  }

  function handleStartsAtChange(val: string) {
    setStartsAt(val)
    // Auto-advance ends_at by 1 hour if it's now before starts_at
    const start = new Date(val)
    const end = new Date(endsAt)
    if (!isNaN(start.getTime()) && end <= start) {
      const newEnd = new Date(start.getTime() + 60 * 60 * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      setEndsAt(
        `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`
      )
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Název je povinný.'); return }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('Čas konce musí být po čase začátku.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await createCalendarEvent({
          title: title.trim(),
          description: description.trim() || null,
          starts_at: localDatetimeToISO(startsAt),
          ends_at: localDatetimeToISO(endsAt),
          event_type: eventType,
        })
        resetAndClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chyba serveru.')
      }
    })
  }

  const inputCls =
    'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow bg-white'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
            onClick={resetAndClose}
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
              className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="brand-gradient px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CalendarPlus size={16} strokeWidth={1.5} className="text-brand-200" />
                  <span className="text-white font-semibold text-sm">Přidat do kalendáře</span>
                </div>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="p-1.5 rounded-lg text-brand-200 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Zavřít"
                >
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {/* Event type selector */}
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_TYPES.map(({ id, label, description: desc, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEventType(id)}
                      className={cn(
                        'flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all duration-150',
                        eventType === id
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-border bg-white hover:border-brand-200 hover:bg-brand-50/50',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon
                          size={13}
                          strokeWidth={1.5}
                          className={eventType === id ? 'text-brand-700' : 'text-muted-foreground'}
                        />
                        <span className={cn(
                          'text-xs font-semibold',
                          eventType === id ? 'text-brand-800' : 'text-foreground',
                        )}>
                          {label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
                    </button>
                  ))}
                </div>

                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Název *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={eventType === 'block' ? 'Např. Nedostupný' : 'Např. Schůzka s partnerem'}
                    maxLength={120}
                    className={inputCls}
                    autoFocus
                  />
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Začátek *
                    </label>
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={e => handleStartsAtChange(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Konec *
                    </label>
                    <input
                      type="datetime-local"
                      value={endsAt}
                      min={startsAt}
                      onChange={e => setEndsAt(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Description (only for manual events) */}
                {eventType === 'manual' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Poznámka (nepovinné)
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Detail nebo připomínka…"
                      className={cn(inputCls, 'resize-none')}
                    />
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isPending}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 brand-gradient',
                      'text-white text-sm font-semibold py-2.5 rounded-xl shadow-sm',
                      'hover:opacity-90 transition-opacity disabled:opacity-60',
                    )}
                  >
                    {isPending
                      ? <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Ukládám…</>
                      : 'Uložit událost'
                    }
                  </button>
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="px-4 text-sm text-muted-foreground rounded-xl border border-border hover:bg-muted transition-colors"
                  >
                    Zrušit
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
