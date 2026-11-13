'use client'

import { useState, useTransition } from 'react'
import { Loader2, CalendarPlus, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createCalendarEvent } from '@/app/calendar-actions'
import { cn } from '@/lib/utils'
import { getPragueTodayISO, parsePragueDatetimeLocalToISO } from '@/lib/prague-time'
import type { CalendarEventType } from '@/lib/types'

interface AdminEventModalProps {
  /** `saved` říká, jestli se má kalendář přečíst znovu. */
  onClose: (saved: boolean) => void
  defaultDate?: string   // 'YYYY-MM-DD' pre-fill the date field
  defaultHour?: number   // pre-fill the start hour
}

/*
 * Modal se **mountuje až při otevření** (AD08). Dokud byl pořád v DOM,
 * komponenta se nikdy neodmountovala: `useState` inicializátory níž se spustily
 * jedinkrát při načtení stránky a formulář pak navždy nabízel „dnes 10:00",
 * ať se kliklo na jakýkoli slot.
 *
 * Od AD18 je okno Radix dialog — focus trap, `Escape` a `aria-modal` zadarmo.
 */

function toLocalDatetimeValue(date: string, hour: number): string {
  const h = String(hour).padStart(2, '0')
  return `${date}T${h}:00`
}

function localDatetimeToISO(localDt: string): string {
  // The datetime-local input has no timezone info — we treat it as Prague
  // wall-clock time regardless of the browser's own timezone, and convert
  // it to a UTC ISO string correctly across CET/CEST transitions.
  return parsePragueDatetimeLocalToISO(localDt)
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

export function AdminEventModal({ onClose, defaultDate, defaultHour }: AdminEventModalProps) {
  const today = getPragueTodayISO()
  const initDate = defaultDate ?? today
  const initHour = defaultHour ?? 10

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<CalendarEventType>('manual')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [startsAt, setStartsAt] = useState(toLocalDatetimeValue(initDate, initHour))
  const [endsAt, setEndsAt] = useState(toLocalDatetimeValue(initDate, initHour + 1))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Žádné „vrať formulář na dnes 10:00" — stav umírá s odmountováním, takže
  // druhá událost v sezení začíná tam, kam uživatel klikl (AD08).
  const close = (saved: boolean) => onClose(saved)

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
          // Blokace je soukromá — do Hovorů se nezrcadlí, takže ani kontakt
          // nemá komu patřit.
          contact_name: eventType === 'manual' ? contactName.trim() || null : null,
          phone: eventType === 'manual' ? phone.trim() || null : null,
          email: eventType === 'manual' ? email.trim() || null : null,
        })
        close(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chyba serveru.')
      }
    })
  }

  const inputCls =
    'w-full border border-navy-100 rounded-chip px-3 py-2 text-sm text-ink placeholder:text-quiet ' +
    'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface'

  return (
    <Dialog open onOpenChange={open => { if (!open) close(false) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus size={16} strokeWidth={1.5} className="text-navy-600" aria-hidden="true" />
            Přidat do kalendáře
          </DialogTitle>
          <DialogDescription>Událost nebo blokace v diáři. Termín se hlídá proti kolizi.</DialogDescription>
        </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Event type selector */}
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map(({ id, label, description: desc, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setEventType(id)}
              className={cn(
                'flex flex-col items-start gap-1 p-3 rounded-chip border text-left transition-all duration-150',
                eventType === id
                  ? 'border-navy-400 bg-navy-50'
                  : 'border-navy-100 bg-surface hover:border-navy-200 hover:bg-navy-50/50',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  size={13}
                  strokeWidth={1.5}
                  className={eventType === id ? 'text-navy-700' : 'text-quiet'}
                />
                <span className={cn(
                  'text-xs font-semibold',
                  eventType === id ? 'text-navy-800' : 'text-ink',
                )}>
                  {label}
                </span>
              </div>
              <span className="text-[11px] text-quiet leading-snug">{desc}</span>
            </button>
          ))}
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
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
            <label className="text-sm font-medium text-ink">
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
            <label className="text-sm font-medium text-ink">
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

        {/* Kontakt (AD10) — jen u událostí, blokace se nezrcadlí */}
        {eventType === 'manual' && (
          <div className="flex flex-col gap-2 rounded-chip border border-navy-100 bg-navy-50/40 p-3">
            <p className="text-sm font-medium text-ink">
              Kontakt (nepovinné)
            </p>
            <p className="text-[11px] leading-snug text-quiet">
              Doplňte telefon nebo e-mail a z Hovorů i z kalendáře pak zavoláte jedním klikem.
            </p>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jméno"
              maxLength={120}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Telefon"
                maxLength={40}
                className={inputCls}
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-mail"
                maxLength={200}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Description (only for manual events) */}
        {eventType === 'manual' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">
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
          <p className="rounded-chip border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
          >
            {isPending
              ? <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Ukládám…</>
              : 'Uložit událost'
            }
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="inline-flex min-h-11 items-center rounded-full border border-input px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-navy-50"
          >
            Zrušit
          </button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  )
}
