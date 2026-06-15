'use client'

import { useState } from 'react'
import { BookingModal } from './BookingModal'
import { CalendarDays } from 'lucide-react'

interface BookingCTAProps {
  token: string
  bookedSlots: string[]
}

export function BookingCTA({ token, bookedSlots }: BookingCTAProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-brand-300 text-brand-800 text-sm font-semibold py-2.5 rounded-xl hover:bg-brand-50 transition-colors"
      >
        <CalendarDays size={15} strokeWidth={1.5} />
        Konzultace o aktuálním stavu projektu
      </button>

      <BookingModal
        token={token}
        bookedSlots={bookedSlots}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
