'use client'

import { useState } from 'react'
import { BookingModal } from './BookingModal'
import { CalendarDays } from 'lucide-react'
import type { FreeSlot } from '@/lib/consultations/rules'
import { getPragueTodayISO } from '@/lib/prague-time'

interface BookingCTAProps {
  token: string
  /** Volné časy z volna pro klienty (KP14). Prázdné = teď nic volného. */
  freeSlots: FreeSlot[]
}

export function BookingCTA({ token, freeSlots }: BookingCTAProps) {
  const [open, setOpen] = useState(false)

  if (freeSlots.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-chip border border-navy-100 bg-navy-50 px-3 py-2.5 text-sm text-quiet">
        <CalendarDays size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
        Volný termín na konzultaci teď nemám. Napište mi prosím požadavek výš a ozvu se vám.
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-chip border border-navy-300 text-sm font-semibold text-navy-800 transition-colors hover:bg-navy-50"
      >
        <CalendarDays size={15} strokeWidth={1.5} />
        Konzultace o aktuálním stavu projektu
      </button>

      <BookingModal
        token={token}
        freeSlots={freeSlots}
        today={getPragueTodayISO()}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
