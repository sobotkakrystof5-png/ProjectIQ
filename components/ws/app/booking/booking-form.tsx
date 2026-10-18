'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { cancelAppointment, createManualBooking } from '@/app/w/[business]/poptavky/actions'
import { undoToast, useWsAction } from './use-ws-action'
import { clockValue, parseClock, StaffSelect, WhenFields } from './when-fields'

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
  prefill: {
    name: string
    /** Stálý zákazník vybraný v rychlém zadání (jinak se podle jména/telefonu založí nový). */
    customer: { id: string; name: string } | null
    day: string | null
    minutes: number | null
    service: string
    serviceIds: string[]
    staffId: string | null
  }
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const matched = prefill.service
    ? services.find((s) => s.name.toLocaleLowerCase('cs').startsWith(prefill.service.toLocaleLowerCase('cs')))
    : undefined
  const [customer, setCustomer] = useState(prefill.customer)
  const [name, setName] = useState(prefill.name)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const requestedServices = prefill.serviceIds.filter((id) => services.some((service) => service.id === id)).slice(0, 5)
  const [serviceIds, setServiceIds] = useState<string[]>(requestedServices.length ? requestedServices : matched ? [matched.id] : services.length === 1 ? [services[0].id] : [])
  const [staffId, setStaffId] = useState(prefill.staffId ?? '')
  const [day, setDay] = useState(prefill.day ?? today)
  const [time, setTime] = useState(prefill.minutes !== null ? clockValue(prefill.minutes) : '')
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const minutes = parseClock(time)
    if ((!customer && !name.trim()) || !day || minutes === null) {
      toast.error('Vyplňte prosím jméno, den a čas.')
      return
    }
    if (!customer && !phone.trim() && !email.trim()) {
      toast.error('Zadejte prosím telefon nebo e-mail.')
      return
    }
    void run(
      () =>
        createManualBooking({
          slug,
          customerId: customer?.id ?? null,
          name: customer ? undefined : name,
          phone: customer ? undefined : phone || undefined,
          email: customer ? undefined : email || undefined,
          serviceId: serviceIds[0] ?? null,
          serviceIds,
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
      {customer ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Zákazník</span>
          <div className="flex min-h-11 items-center gap-2 rounded-chip border border-input bg-navy-50 px-3 dark:bg-navy-900">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{customer.name}</span>
            <button
              type="button"
              onClick={() => {
                setName(customer.name)
                setCustomer(null)
              }}
              className="inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-navy-700 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-navy-200"
            >
              Změnit
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rez-jmeno">Jméno zákazníka</Label>
            <Input id="rez-jmeno" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rez-telefon">Telefon</Label>
              <Input id="rez-telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="font-num" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rez-email">E-mail</Label>
              <Input id="rez-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
          </div>
        </>
      )}
      {services.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Služby</Label>
          <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-box border border-line p-2">
            <legend className="sr-only">Služby rezervace</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-chip px-2 text-sm hover:bg-accent">
              <input type="checkbox" checked={serviceIds.length === 0} onChange={() => setServiceIds([])} className="h-4 w-4 accent-navy-700" />
              Bez služby (1 hodina)
            </label>
            {services.map((s) => (
              <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-chip px-2 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  disabled={!serviceIds.includes(s.id) && (serviceIds.length >= 5 || serviceIds.reduce((sum, id) => sum + (services.find((item) => item.id === id)?.duration_min ?? 0), 0) + s.duration_min > 720)}
                  onChange={() => setServiceIds(serviceIds.includes(s.id) ? serviceIds.filter((id) => id !== s.id) : [...serviceIds, s.id])}
                  className="h-4 w-4 accent-navy-700"
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="font-num text-quiet">{s.duration_min} min</span>
              </label>
            ))}
          </fieldset>
          {serviceIds.length > 1 && <p className="text-sm text-quiet">Služby se naplánují za sebou ({serviceIds.reduce((sum, id) => sum + (services.find((item) => item.id === id)?.duration_min ?? 0), 0)} min).</p>}
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
      {!customer && <p className="text-sm text-quiet">Vyplňte alespoň telefon nebo e-mail. Podle kontaktu poznáme stálého zákazníka, jinak ho založíme.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          Uložit rezervaci
        </Button>
      </div>
    </form>
  )
}
