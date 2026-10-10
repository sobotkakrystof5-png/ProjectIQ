'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { cancelAppointment, createBlock } from '@/app/w/[business]/poptavky/actions'
import { undoToast, useWsAction } from './use-ws-action'
import { parseClock, StaffSelect, WhenFields } from './when-fields'

const REASONS = ['Dovolená', 'Školení', 'Zavřeno', 'Lékař']

/** Blokace v kalendáři (S10): dovolená, školení, zavřeno. Celý den je výchozí. */
export function BlockForm({
  slug,
  closeHref,
  staff,
  today,
}: {
  slug: string
  closeHref: string
  staff: { id: string; name: string }[]
  today: string
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const [title, setTitle] = useState('Dovolená')
  const [allDay, setAllDay] = useState(true)
  const [fromDay, setFromDay] = useState(today)
  const [fromTime, setFromTime] = useState('09:00')
  const [toDay, setToDay] = useState(today)
  const [toTime, setToTime] = useState('12:00')
  const [staffId, setStaffId] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const fromMin = allDay ? 0 : parseClock(fromTime)
    const toMin = allDay ? 0 : parseClock(toTime)
    if (!fromDay || !toDay || fromMin === null || toMin === null || !title.trim()) {
      toast.error('Vyplňte prosím, od kdy do kdy blokace platí, a důvod.')
      return
    }
    void run(
      () =>
        createBlock({
          slug,
          staffId: staffId || null,
          allDay,
          from: { day: fromDay, minutes: fromMin },
          to: { day: toDay, minutes: toMin },
          title,
        }),
      (r) => {
        undoToast(r.message, () => cancelAppointment({ slug, appointmentId: r.appointmentId }), { done: 'Blokace je pryč.' })
        router.push(closeHref, { scroll: false })
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blok-duvod">Důvod</Label>
        <Input id="blok-duvod" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required list="blok-duvody" />
        <datalist id="blok-duvody">
          {REASONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
        Celý den
      </label>
      <WhenFields idPrefix="blok-od" dayLabel="Od" timeLabel="Čas" day={fromDay} time={fromTime} onDay={setFromDay} onTime={setFromTime} hideTime={allDay} />
      <WhenFields idPrefix="blok-do" dayLabel="Do" timeLabel="Čas" day={toDay} time={toTime} onDay={setToDay} onTime={setToTime} hideTime={allDay} />
      <StaffSelect id="blok-kdo" staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Všichni (zavřeno)" />
      <p className="text-sm text-quiet">Blokace se ukáže v kalendáři.</p>
      <div>
        <Button type="submit" disabled={pending}>
          Přidat blokaci
        </Button>
      </div>
    </form>
  )
}
