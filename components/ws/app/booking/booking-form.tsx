'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { cancelAppointment, createManualBooking } from '@/app/w/[business]/poptavky/actions'
import { undoToast, useWsAction } from './use-ws-action'
import { clockValue, NativeSelect, parseClock, StaffSelect, WhenFields } from './when-fields'

type Option = { id: string; name: string }

/**
 * Nová rezervace (S10) v pravém panelu: zákazník, služba, den a čas.
 * Předvyplní se z příkazu v ⌘K („rezervace Tereza pátek 9:00“) nebo
 * z kliknutí do kalendáře. Zákazníka server najde podle telefonu či
 * e-mailu, jinak založí nového.
 */
export function BookingForm({
  slug,
  closeHref,
  services,
  staff,
  today,
  prefill,
}: {
  slug: string
  closeHref: string
  services: (Option & { duration_min: number })[]
  staff: Option[]
  today: string
  prefill: { name: string; day: string | null; minutes: number | null; service: string; staffId: string | null }
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const matched = prefill.service
    ? services.find((s) => s.name.toLocaleLowerCase('cs').startsWith(prefill.service.toLocaleLowerCase('cs')))
    : undefined
  const [name, setName] = useState(prefill.name)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [serviceId, setServiceId] = useState(matched?.id ?? (services.length === 1 ? services[0].id : ''))
  const [staffId, setStaffId] = useState(prefill.staffId ?? '')
  const [day, setDay] = useState(prefill.day ?? today)
  const [time, setTime] = useState(prefill.minutes !== null ? clockValue(prefill.minutes) : '')
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const minutes = parseClock(time)
    if (!name.trim() || !day || minutes === null) {
      toast.error('Vyplňte prosím jméno, den a čas.')
      return
    }
    void run(
      () =>
        createManualBooking({
          slug,
          name,
          phone: phone || undefined,
          email: email || undefined,
          serviceId: serviceId || null,
          staffId: staffId || null,
          at: { day, minutes },
          note: note || undefined,
        }),
      (r) => {
        undoToast(r.message, () => cancelAppointment({ slug, appointmentId: r.appointmentId }), { done: 'Rezervace je zrušená.' })
        router.push(closeHref, { scroll: false })
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rez-jmeno">Jméno zákazníka</Label>
        <Input id="rez-jmeno" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rez-telefon">Telefon (nepovinné)</Label>
          <Input id="rez-telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="font-num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rez-email">E-mail (nepovinné)</Label>
          <Input id="rez-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
      </div>
      {services.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rez-sluzba">Služba</Label>
          <NativeSelect id="rez-sluzba" value={serviceId} onChange={setServiceId}>
            <option value="">Bez služby (1 hodina)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_min} min
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <WhenFields idPrefix="rez" day={day} time={time} onDay={setDay} onTime={setTime} />
      <StaffSelect id="rez-kdo" staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Kdo bude mít volno" />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rez-poznamka">Poznámka (nepovinné)</Label>
        <textarea
          id="rez-poznamka"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>
      <p className="text-sm text-quiet">Podle telefonu nebo e-mailu poznáme stálého zákazníka. Jinak ho založíme.</p>
      <div>
        <Button type="submit" disabled={pending}>
          Uložit rezervaci
        </Button>
      </div>
    </form>
  )
}
