'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, ExternalLink, CalendarDays } from 'lucide-react'
import { formatPragueDateTime, utcToPrague, toMondayFirst, getDaysInMonth, getMonthStartOffset } from '@/lib/prague-time'
import { CHANNEL_LABELS } from '@/lib/types'
import type { ConsultationSlot, ConsultationChannel } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAYS_CZ = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const MONTHS_CZ = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

interface Props {
  slots: ConsultationSlot[]
  clientName: string
}

function SlotDetailModal({ slot, clientName, onClose }: { slot: ConsultationSlot; clientName: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="brand-gradient px-5 py-4 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">Detail konzultace</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-brand-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Klient</p>
              <p className="text-sm font-medium text-foreground">{clientName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Datum a čas</p>
              <p className="text-sm text-foreground">{formatPragueDateTime(new Date(slot.scheduled_at).toISOString())}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Kanál</p>
              <p className="text-sm text-foreground">{CHANNEL_LABELS[slot.channel as ConsultationChannel] ?? slot.channel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Přání klienta</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{slot.client_wish}</p>
            </div>
            {slot.meeting_link && slot.meeting_link !== '#' && (
              <a
                href={slot.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 brand-gradient text-white text-sm font-semibold py-2.5 rounded-xl w-full hover:opacity-90 transition-opacity"
              >
                <ExternalLink size={14} strokeWidth={1.5} />
                Připojit se k hovoru
              </a>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function ConsultationCalendar({ slots, clientName }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [detailSlot, setDetailSlot] = useState<ConsultationSlot | null>(null)

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mb-3">
          <CalendarDays size={18} strokeWidth={1.5} className="text-brand-400" />
        </div>
        <p className="text-sm text-muted-foreground">Žádné rezervované konzultace.</p>
      </div>
    )
  }

  // Build a lookup: 'YYYY-M-D' → slot[]
  const slotsByDay: Record<string, ConsultationSlot[]> = {}
  for (const slot of slots) {
    const p = utcToPrague(new Date(slot.scheduled_at))
    const key = `${p.year}-${p.month}-${p.day}`
    ;(slotsByDay[key] = slotsByDay[key] ?? []).push(slot)
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const startOffset = getMonthStartOffset(viewYear, viewMonth)
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const canPrev = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth() + 1)

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canPrev}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-brand-50 hover:text-brand-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS_CZ[viewMonth - 1]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg text-muted-foreground hover:bg-brand-50 hover:text-brand-800 transition-colors">
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_CZ.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1
          if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} />

          const key = `${viewYear}-${viewMonth}-${dayNum}`
          const daySlots = slotsByDay[key] ?? []
          const isToday =
            now.getFullYear() === viewYear &&
            now.getMonth() + 1 === viewMonth &&
            now.getDate() === dayNum

          return (
            <div
              key={i}
              className={cn(
                'min-h-[52px] p-1 rounded-lg border transition-colors',
                daySlots.length > 0 ? 'border-brand-200 bg-brand-50' : 'border-transparent bg-transparent',
                isToday && 'ring-1 ring-brand-300',
              )}
            >
              <span className={cn(
                'block text-xs font-medium text-center mb-0.5',
                isToday ? 'text-brand-700' : 'text-muted-foreground',
              )}>
                {dayNum}
              </span>
              {daySlots.map(slot => {
                const p = utcToPrague(new Date(slot.scheduled_at))
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setDetailSlot(slot)}
                    className="w-full text-left text-[10px] font-semibold bg-brand-700 text-white rounded px-1 py-0.5 mb-0.5 truncate hover:bg-brand-800 transition-colors"
                    title={`${p.hour}:00 — ${CHANNEL_LABELS[slot.channel as ConsultationChannel] ?? slot.channel}`}
                  >
                    {p.hour}:00
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Upcoming list */}
      <div className="mt-5 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Nadcházející</p>
        {slots
          .filter(s => new Date(s.scheduled_at) >= new Date())
          .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
          .slice(0, 5)
          .map(slot => (
            <button
              key={slot.id}
              type="button"
              onClick={() => setDetailSlot(slot)}
              className="w-full text-left flex items-start gap-3 bg-white border border-border rounded-xl px-4 py-3 hover:border-brand-200 hover:bg-brand-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg brand-gradient flex flex-col items-center justify-center shrink-0">
                {(() => {
                  const p = utcToPrague(new Date(slot.scheduled_at))
                  return <span className="text-white text-[11px] font-bold leading-none">{p.hour}:00</span>
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{clientName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatPragueDateTime(new Date(slot.scheduled_at).toISOString())}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 self-center">
                {CHANNEL_LABELS[slot.channel as ConsultationChannel] ?? slot.channel}
              </span>
            </button>
          ))}
      </div>

      {/* Detail modal */}
      {detailSlot && (
        <SlotDetailModal
          slot={detailSlot}
          clientName={clientName}
          onClose={() => setDetailSlot(null)}
        />
      )}
    </>
  )
}
