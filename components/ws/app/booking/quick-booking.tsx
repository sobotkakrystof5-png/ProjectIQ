'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cancelAppointment, createManualBooking } from '@/app/w/[business]/poptavky/actions'
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
  today,
  start,
  fullFormHref,
  settingsHref,
  onClose,
}: {
  slug: string
  services: (Option & { duration_min: number })[]
  staff: Option[]
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
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : '')
  const [staffId, setStaffId] = useState(start.staffId ?? '')
  const [day, setDay] = useState(start.day)
  const [time, setTime] = useState(clockValue(start.minutes))
  const [dragged, setDragged] = useState<number | null>(start.durationMin)

  const service = services.find((s) => s.id === serviceId)
  const duration = dragged ?? service?.duration_min ?? 60
  const minutes = parseClock(time)
  const { advice } = useSlotAdvice(
    day && minutes !== null
      ? { slug, at: { day, minutes }, durationMin: duration, serviceId: serviceId || null, staffId: staffId || null }
      : null,
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (minutes === null || !day) {
      toast.error('Vyberte prosím den a čas.')
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
          serviceId: serviceId || null,
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
          <h2 className="text-[16px] font-semibold text-ink">Nová rezervace</h2>
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

      <CustomerPicker slug={slug} id="rychla-zakaznik" text={text} picked={picked} onText={setText} onPick={setPicked} autoFocus />

      {!picked && text.trim().length >= 2 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rychla-telefon">Telefon (nepovinné)</Label>
          <Input id="rychla-telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="font-num" />
        </div>
      )}

      {services.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rychla-sluzba">Služba</Label>
          <NativeSelect
            id="rychla-sluzba"
            value={serviceId}
            onChange={(v) => {
              setServiceId(v)
              setDragged(null)
            }}
          >
            <option value="">Bez služby (1 hodina)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_min} min
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <WhenFields idPrefix="rychla" day={day} time={time} onDay={setDay} onTime={setTime} />
      <StaffSelect id="rychla-kdo" staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Kdo bude mít volno" />

      {advice && (
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
          Uložit rezervaci
        </Button>
        <Link
          href={fullFormHref({ name: picked?.name ?? text.trim(), customerId: picked?.id ?? '', day, minutes: minutes ?? start.minutes, serviceName: service?.name ?? '', staffId })}
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
