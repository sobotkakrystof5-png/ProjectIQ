'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cancelAppointment, createGroupSession, createManualBooking } from '@/app/w/[business]/poptavky/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import type { CustomerOption } from '@/lib/ws/calendar'
import { formatMinutes, formatRelativeDay } from '@/lib/ws/time'
import { CustomerPicker } from './customer-picker'
import { AdviceTip, SuggestionChips } from './slot-advice-view'
import { undoToast, useWsAction } from './use-ws-action'
import { useSlotAdvice } from './use-slot-advice'
import { clockValue, NativeSelect, parseClock, StaffSelect, WhenFields } from './when-fields'

type Option = { id: string; name: string }

export type QuickBookingStart = {
  day: string
  minutes: number
  staffId: string | null
  /** Délka vybraná tažením v mřížce; `null` = platí délka služby. */
  durationMin: number | null
}

/**
 * Rychlé zadání rezervace (RD05): malé okno u kliknutého místa v mřížce.
 * Zákazník, služba, čas a pracovník stačí; poznámka a další údaje jsou
 * v úplném formuláři (odkaz „Další údaje“ přenese, co už je vyplněné).
 * Pod časem je hned vidět, jestli je volný, a tři nejbližší volné časy.
 */
export function QuickBooking({
  slug,
  services,
  staff,
  canCreateGroupSessions,
  today,
  start,
  fullFormHref,
  settingsHref,
  onClose,
}: {
  slug: string
  services: (Option & { duration_min: number })[]
  staff: Option[]
  canCreateGroupSessions: boolean
  today: string
  start: QuickBookingStart
  fullFormHref: (state: { name: string; customerId: string; day: string; minutes: number; serviceName: string; staffId: string }) => string
  /** Odkaz na Nastavení otevírací doby (kdyby chyběla). */
  settingsHref: string
  onClose: () => void
}) {
  const { run, pending } = useWsAction()
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<CustomerOption | null>(null)
  const [phone, setPhone] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>(services.length === 1 ? [services[0].id] : [])
  const [staffId, setStaffId] = useState(start.staffId ?? '')
  const [day, setDay] = useState(start.day)
  const [time, setTime] = useState(clockValue(start.minutes))
  const [dragged, setDragged] = useState<number | null>(start.durationMin)
  const [groupMode, setGroupMode] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('Skupinová lekce')
  const [capacity, setCapacity] = useState('6')

  const selectedServices = serviceIds.map((id) => services.find((item) => item.id === id)).filter((item): item is (Option & { duration_min: number }) => Boolean(item))
  const duration = selectedServices.length ? selectedServices.reduce((sum, item) => sum + item.duration_min, 0) : dragged ?? 60
  const minutes = parseClock(time)
  const { advice } = useSlotAdvice(
    day && minutes !== null
      ? { slug, at: { day, minutes }, durationMin: duration, serviceId: serviceIds[0] ?? null, staffId: staffId || null }
      : null,
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (minutes === null || !day) {
      toast.error('Vyberte prosím den a čas.')
      return
    }
    if (groupMode) {
      if (selectedServices.length !== 1) {
        toast.error('Pro skupinovou lekci vyberte jednu službu.')
        return
      }
      const seats = Number(capacity)
      if (!Number.isInteger(seats) || seats < 2 || seats > 30) {
        toast.error('Kapacita může být od 2 do 30 míst.')
        return
      }
      void run(
        () => createGroupSession({ slug, serviceId: selectedServices[0].id, staffId: staffId || null, at: { day, minutes }, title: sessionTitle, capacity: seats }),
        (r) => {
          toast.success(r.message)
          onClose()
        },
        { refresh: true },
      )
      return
    }
    if (!picked && !text.trim()) {
      toast.error('Napište prosím jméno zákazníka.')
      return
    }
    void run(
      () =>
        createManualBooking({
          slug,
          customerId: picked?.id ?? null,
          name: picked ? undefined : text,
          phone: !picked && phone ? phone : undefined,
          serviceId: serviceIds[0] ?? null,
          serviceIds,
          staffId: staffId || null,
          at: { day, minutes },
          durationMin: dragged,
        }),
      (r) => {
        undoToast(r.message, () => cancelAppointment({ slug, appointmentId: r.appointmentId }), { done: 'Rezervace je zrušená.' })
        onClose()
      },
      { refresh: false },
    )
  }

  const where = `${formatRelativeDay(day, today)} ${minutes !== null ? formatMinutes(minutes) : ''}`.trim()

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" aria-label="Rychlá rezervace">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-ink">{groupMode ? 'Skupinová lekce' : 'Nová rezervace'}</h2>
          <p className="font-num text-sm text-quiet">
            {where}, {duration < 60 ? `${duration} min` : `${Math.floor(duration / 60)} h${duration % 60 ? ` ${duration % 60} min` : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít"
          className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden size={18} strokeWidth={1.5} />
        </button>
      </div>

      {canCreateGroupSessions ? (
        <div className="flex rounded-full border p-1" aria-label="Typ termínu">
          <button type="button" onClick={() => setGroupMode(false)} aria-pressed={!groupMode} className={`min-h-9 flex-1 rounded-full px-3 text-sm font-semibold ${groupMode ? 'text-quiet' : 'bg-navy-700 text-white'}`}>Rezervace</button>
          <button type="button" onClick={() => { setGroupMode(true); if (serviceIds.length > 1) setServiceIds(serviceIds.slice(0, 1)); setPicked(null); setText('') }} aria-pressed={groupMode} className={`min-h-9 flex-1 rounded-full px-3 text-sm font-semibold ${groupMode ? 'bg-navy-700 text-white' : 'text-quiet'}`}>Skupinová lekce</button>
        </div>
      ) : null}

      {!groupMode && <CustomerPicker slug={slug} id="rychla-zakaznik" text={text} picked={picked} onText={setText} onPick={setPicked} autoFocus />}

      {!groupMode && !picked && text.trim().length >= 2 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rychla-telefon">Telefon (nepovinné)</Label>
          <Input id="rychla-telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="font-num" />
        </div>
      )}

      {services.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Služby</Label>
          <fieldset className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-box border border-line p-2">
            <legend className="sr-only">Služby rezervace</legend>
            {services.map((s) => {
              const checked = serviceIds.includes(s.id)
              return (
                <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-chip px-2 text-[14px] text-ink hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && serviceIds.length >= (groupMode ? 1 : 5)}
                    onChange={() => {
                      setServiceIds(groupMode ? (checked ? [] : [s.id]) : checked ? serviceIds.filter((id) => id !== s.id) : [...serviceIds, s.id])
                      setDragged(null)
                    }}
                    className="h-4 w-4 accent-navy-700"
                  />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="font-num text-quiet">{s.duration_min} min</span>
                </label>
              )
            })}
          </fieldset>
          <p className="text-[13px] text-quiet">{selectedServices.length ? `Celkem ${duration} min` : 'Bez služby se zapíše hodinový termín.'}</p>
        </div>
      )}

      <WhenFields idPrefix="rychla" day={day} time={time} onDay={setDay} onTime={setTime} />
      <StaffSelect id="rychla-kdo" staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Kdo bude mít volno" />

      {groupMode && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5"><Label htmlFor="lekce-nazev">Název lekce</Label><Input id="lekce-nazev" value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} maxLength={120} required /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lekce-kapacita">Počet míst</Label><Input id="lekce-kapacita" type="number" min={2} max={30} step={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></div>
        </div>
      )}

      {!groupMode && advice && (
        <div className="flex flex-col gap-3">
          <AdviceTip advice={advice} />
          <SuggestionChips
            advice={advice}
            settingsHref={settingsHref}
            heading={advice.state === 'conflict' || advice.outsideHours ? 'Volné časy poblíž' : 'Další volné časy'}
            onPick={(s) => {
              setDay(s.day)
              setTime(clockValue(s.minutes))
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={pending}>
          {groupMode ? 'Vypsat lekci' : 'Uložit rezervaci'}
        </Button>
        <Link
          href={fullFormHref({ name: picked?.name ?? text.trim(), customerId: picked?.id ?? '', day, minutes: minutes ?? start.minutes, serviceName: selectedServices.map((item) => item.name).join(' + '), staffId })}
          scroll={false}
          onClick={onClose}
          className="inline-flex min-h-11 items-center text-[15px] font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200"
        >
          Další údaje
        </Link>
      </div>
    </form>
  )
}
