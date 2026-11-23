'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { recordMeeting, undoMeeting } from '@/app/meeting-actions'
import { MEETING_LENGTHS, approxIso, initialSlot } from '@/lib/admin/meeting-slot'
import { cn } from '@/lib/utils'

/**
 * „Schůzka domluvena": s klientem je termín už domluvený (telefonem, osobně),
 * takže se jen zapíše — událost v kalendáři a kontakt v Hovorech. Bez Google
 * Meetu a bez e-mailu; na to je „Domluvit schůzku". Firma tím odchází
 * z fronty asistenta. „Zpět" v oznámení událost smaže.
 */

export type ArrangedFirm = {
  id: string
  company: string
  callbackAt: string | null
  callbackText?: string | null
}

export function ArrangedMeetingButton({
  firm,
  nowIso,
  appearance = 'button',
}: {
  firm: ArrangedFirm
  nowIso: string
  /** `button` vedle ostatních akcí, `row` jako buňka na konci řádku v seznamu. */
  appearance?: 'button' | 'row'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {appearance === 'row' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Schůzka domluvena: ${firm.company}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border-l border-navy-100 px-4 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
        >
          <CalendarCheck size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden lg:inline">Schůzka domluvena</span>
        </button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <CalendarCheck size={16} strokeWidth={1.5} aria-hidden="true" />
          Schůzka domluvena
        </Button>
      )}
      {open && <ArrangedMeetingDialog firm={firm} nowIso={nowIso} open={open} onOpenChange={setOpen} />}
    </>
  )
}

const fieldClass =
  'w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

function ArrangedMeetingDialog({
  firm,
  nowIso,
  open,
  onOpenChange,
}: {
  firm: ArrangedFirm
  nowIso: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const first = initialSlot(firm.callbackAt, nowIso)
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)
  const [minutes, setMinutes] = useState(60)
  const [note, setNote] = useState('')
  const valid = approxIso(date, time) !== null

  const submit = () =>
    start(async () => {
      const result = await recordMeeting({ outreachId: firm.id, date, time, minutes, note })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      const eventId = result.eventId
      toast.success('Schůzka je v kalendáři.', {
        description: 'Kontakt najdete i v Hovorech.',
        duration: 8000,
        undo: () =>
          start(async () => {
            const undone = await undoMeeting(eventId)
            if (undone.ok) toast.success('Schůzka zrušená.')
            else toast.error(undone.error)
            router.refresh()
          }),
      })
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schůzka domluvena: {firm.company}</DialogTitle>
          <DialogDescription>Zapíšeme ji do kalendáře a do Hovorů. Klientovi nic neposíláme.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending && valid) submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Den</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Čas</span>
              <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Délka</span>
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className={cn(fieldClass, 'h-11')}
              >
                {MEETING_LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minut` : m === 60 ? '1 hodina' : m === 90 ? '1,5 hodiny' : `${m / 60} hodiny`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {firm.callbackText && <p className="-mt-2 text-xs text-quiet">Klient v hovoru řekl: „{firm.callbackText}"</p>}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              Kde a o čem <span className="font-normal text-quiet">(nepovinné)</span>
            </span>
            <Input
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Třeba u nich v provozovně, projít ukázku"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? 'Ukládám…' : 'Uložit do kalendáře'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
