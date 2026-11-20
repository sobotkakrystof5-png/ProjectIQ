'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeadEmailDialog, type LeadEmailReadiness, type LeadEmailTarget } from '@/components/LeadEmailDialog'
import { cn } from '@/lib/utils'

/**
 * Tlačítko „Poslat e-mail" (R-132): otevře okno se třemi šablonami (Portfolio,
 * Nabídka, Schůzka s Google Meet). Stejné tlačítko je u kontaktů, na kartě
 * kontaktu a u firem od AI asistenta; v Hovorech má tabulka vlastní.
 *
 * Bez e-mailu se nevykreslí vůbec — není kam psát.
 */

const CHIP =
  'relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-chip bg-navy-700 px-3 text-sm font-semibold text-white ' +
  'transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 ' +
  'focus-visible:ring-offset-1'

export function SendEmailButton({
  target,
  readiness,
  appearance = 'outline',
  className,
}: {
  target: Omit<LeadEmailTarget, 'email'> & { email: string | null }
  readiness: LeadEmailReadiness
  /** `chip` = malé tlačítko do řádku tabulky, jinak pilulka Dílků. */
  appearance?: 'primary' | 'outline' | 'chip'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const email = target.email?.trim()
  if (!email) return null

  return (
    <>
      {appearance === 'chip' ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(CHIP, className)}>
          <Send size={14} strokeWidth={1.5} aria-hidden="true" />
          Poslat e-mail
        </button>
      ) : (
        <Button type="button" variant={appearance} onClick={() => setOpen(true)} className={className}>
          <Send size={15} strokeWidth={1.5} aria-hidden="true" />
          Poslat e-mail
        </Button>
      )}
      {open && (
        <LeadEmailDialog key={target.id} target={{ ...target, email }} readiness={readiness} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
