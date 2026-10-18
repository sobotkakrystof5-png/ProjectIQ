'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cancelAppointment, moveAppointment, resizeAppointment, restoreAppointment } from '@/app/w/[business]/poptavky/actions'
import { Label } from '@/components/ui/label'
import { undoToast, useWsAction } from './use-ws-action'
import { clockValue, NativeSelect, parseClock, StaffSelect, WhenFields } from './when-fields'

/** Délky v nabídce: čtvrthodiny do 2 h, pak po půlhodinách a hodinách (delší zadá tažení v kalendáři). */
const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480]

const durationLabel = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`)

/** Detail termínu: Přesunout (formulář), Délka (výběr) a Zrušit (hned, se „Zpět“). */
export function AppointmentActions({
  slug,
  appointmentId,
  kind,
  at,
  durationMin,
  staffId: currentStaff,
  staff,
  closeHref,
}: {
  slug: string
  appointmentId: string
  kind: 'visit' | 'block'
  at: { day: string; minutes: number }
  /** Dosavadní délka v minutách. */
  durationMin: number
  staffId: string | null
  staff: { id: string; name: string }[]
  closeHref: string
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const [moving, setMoving] = useState(false)
  const [day, setDay] = useState(at.day)
  const [time, setTime] = useState(clockValue(at.minutes))
  const [staffId, setStaffId] = useState(currentStaff ?? '')
  const [length, setLength] = useState(durationMin)

  const cancel = () =>
    run(
      () => cancelAppointment({ slug, appointmentId }),
      () => {
        undoToast(kind === 'block' ? 'Blokace je pryč.' : 'Termín je zrušený.', () => restoreAppointment({ slug, appointmentId }), {
          done: kind === 'block' ? 'Blokace je zpátky.' : 'Termín je zpátky.',
        })
        router.push(closeHref, { scroll: false })
      },
    )

  // Klávesnicová a dotyková náhrada tažení za spodní okraj v kalendáři.
  const changeLength = (value: string) => {
    const next = Number(value)
    if (!Number.isInteger(next) || next === length) return
    const previous = length
    setLength(next)
    void run(
      () => resizeAppointment({ slug, appointmentId, durationMin: next }),
      (r) =>
        undoToast(r.message, () => resizeAppointment({ slug, appointmentId, durationMin: r.prevDurationMin }), {
          done: 'Délka je zpátky.',
        }),
    ).then((ok) => {
      if (!ok) setLength(previous)
    })
  }

  const move = (e: React.FormEvent) => {
    e.preventDefault()
    const minutes = parseClock(time)
    if (!day || minutes === null) {
      toast.error('Vyberte prosím den a čas.')
      return
    }
    void run(
      () => moveAppointment({ slug, appointmentId, at: { day, minutes }, staffId: staffId || null }),
      (r) => {
        undoToast(r.message, () => moveAppointment({ slug, appointmentId, at: { day: r.prev.day, minutes: r.prev.minutes }, staffId: r.prev.staffId }), {
          done: 'Termín je zpátky na původním místě.',
        })
        setMoving(false)
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
          Přesunout
        </Button>
        <Button variant="ghost" className="text-danger hover:bg-danger/10" disabled={pending} onClick={() => void cancel()}>
          {kind === 'block' ? 'Zrušit blokaci' : 'Zrušit termín'}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`delka-${appointmentId}`}>Délka</Label>
        <NativeSelect id={`delka-${appointmentId}`} value={String(length)} onChange={changeLength}>
          {(DURATIONS.includes(length) ? DURATIONS : [...DURATIONS, length].sort((a, b) => a - b)).map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {moving && (
        <form onSubmit={move} className="flex flex-col gap-3 rounded-box border bg-ground p-4 dark:bg-navy-950">
          <WhenFields idPrefix={`presun-${appointmentId}`} day={day} time={time} onDay={setDay} onTime={setTime} />
          {kind === 'visit' && <StaffSelect id={`presun-kdo-${appointmentId}`} staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Beze změny" />}
          <div>
            <Button type="submit" disabled={pending}>
              Přesunout sem
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
