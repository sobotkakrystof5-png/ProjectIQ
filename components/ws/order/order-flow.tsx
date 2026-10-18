'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { CalendarPlus, Check, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOrderSlots, submitOrder, type OrderAvailability, type OrderSlots, type OrderStaff } from '@/app/r/[slug]/actions'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { addDays, formatDayShort, formatMinutes } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

// Objednávací stránka (S11): služba → termín → kontakt → hotovo. Mobil napřed,
// jedna hlavní akce na krok. Režim času podle byznysu: volné časy z otevírací
// doby, nebo (bez nastavené doby) zákazník čas navrhne sám, nebo bez času.

export type OrderField = {
  key: string
  label: string
  type: string
  required: boolean
  options: string[]
  help: string | null
}

export type OrderService = { id: string; name: string; durationMin: number; price: number | null; currency: string }

type Step = 'service' | 'time' | 'contact' | 'done'

type When = { day: string; minutes: number }

const FREE_TIMES = Array.from({ length: (20 - 7) * 2 + 1 }, (_, i) => 7 * 60 + i * 30)

const inputBase =
  'flex h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-danger'

function Pill({ active, children, ...props }: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100',
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function OrderFlow({
  slug,
  businessName,
  embedded,
  services,
  fields,
  booking,
  initialAvailability,
  today,
}: {
  slug: string
  businessName: string
  embedded: boolean
  services: OrderService[]
  fields: OrderField[]
  booking: 'slots' | 'free' | 'none'
  initialAvailability: OrderAvailability | null
  today: string
}) {
  const steps = useMemo<Step[]>(
    () => [...(services.length > 1 ? (['service'] as Step[]) : []), ...(booking !== 'none' ? (['time'] as Step[]) : []), 'contact'],
    [services.length, booking],
  )
  const initialServiceId = services.length === 1 ? services[0].id : null
  const initialKey = initialAvailability ? availabilityKey(initialServiceId, null) : null
  const [step, setStep] = useState<Step>(steps[0])
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [staffOptions, setStaffOptions] = useState<OrderStaff[]>(initialAvailability?.staff ?? [])
  const [slots, setSlots] = useState<OrderSlots | null>(initialAvailability?.slots ?? null)
  const [slotsFor, setSlotsFor] = useState<string | null>(initialKey)
  const [day, setDay] = useState<string | null>(null)
  const [when, setWhen] = useState<When | null>(null)
  const [freeDay, setFreeDay] = useState('')
  const [freeTime, setFreeTime] = useState('')
  const [error, setError] = useState<{ text: string; field?: string } | null>(null)
  const [confirmation, setConfirmation] = useState<{ portalUrl?: string; calendarUid?: string } | null>(null)
  const [pending, start] = useTransition()
  const slotRequest = useRef(0)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)

  const service = services.find((s) => s.id === serviceId) ?? null
  const stepIndex = step === 'done' ? steps.length : steps.indexOf(step)

  useEffect(() => {
    if (mounted.current) stepHeading.current?.focus({ preventScroll: true })
    else mounted.current = true
  }, [step])

  const loadSlotsFor = (id: string | null, forStaff: string | null, force = false) => {
    const key = availabilityKey(id, forStaff)
    if (booking !== 'slots' || (!force && slotsFor === key)) return
    const requestId = ++slotRequest.current
    setSlots(null)
    setSlotsFor(key)
    start(async () => {
      const res = await getOrderSlots({ slug, serviceId: id, staffId: forStaff })
      if (requestId !== slotRequest.current) return
      if (res.ok) {
        setSlots(res.slots)
        setStaffOptions(res.staff)
      } else {
        setSlots(null)
        setSlotsFor(null)
        setError({ text: res.error })
      }
    })
  }

  const go = (next: Step, forService: string | null = serviceId, forStaff: string | null = staffId) => {
    setError(null)
    if (next === 'time') loadSlotsFor(forService, forStaff)
    setStep(next)
  }
  const nextAfter = (s: Step): Step => steps[steps.indexOf(s) + 1] ?? 'contact'
  const back = () => {
    const i = steps.indexOf(step)
    if (i > 0) go(steps[i - 1])
  }

  const selectStaff = (id: string | null) => {
    if (id === staffId) return
    setStaffId(id)
    setDay(null)
    setWhen(null)
    setError(null)
    loadSlotsFor(serviceId, id, true)
  }

  const chosenWhen: When | null =
    booking === 'free' && freeDay && freeTime ? { day: freeDay, minutes: Number(freeTime) } : booking === 'slots' ? when : null

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (k: string) => String(form.get(k) ?? '')
    const values: Record<string, string> = {}
    for (const f of fields) values[f.key] = text(`f_${f.key}`)
    setError(null)
    start(async () => {
      try {
        const res = await submitOrder({
          slug,
          embedded,
          serviceId,
          staffId,
          when: chosenWhen,
          name: text('name'),
          phone: text('phone'),
          email: text('email'),
          message: text('message'),
          fields: values,
          website: text('website'),
          marketingConsent: form.get('consent') === 'on',
        })
        if (res.ok) {
          setConfirmation({ portalUrl: res.portalUrl, calendarUid: crypto.randomUUID() })
          setStep('done')
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        if (res.slotTaken) {
          setWhen(null)
          if (res.slots) {
            setSlots(res.slots)
            setSlotsFor(availabilityKey(serviceId, staffId))
            setDay(res.slots.find((d) => d.times.length)?.date ?? null)
            if (res.staff) setStaffOptions(res.staff)
          } else {
            setSlotsFor(null)
            loadSlotsFor(serviceId, staffId, true)
          }
          setError({ text: res.error })
          setStep('time')
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        setError({ text: res.error, field: res.field })
      } catch {
        setError({ text: 'Spojení se nepovedlo. Zkuste to prosím znovu.' })
      }
    })
  }

  const invalid = (name: string) => (error?.field === name ? true : undefined)
  const slotsByDay = new Map((slots ?? []).map((d) => [d.date, d]))
  const dayList = slots === null
    ? []
    : Array.from({ length: 21 }, (_, i) => {
        const date = addDays(today, i)
        return slotsByDay.get(date) ?? { date, label: formatDayShort(date), times: [] }
      })
  const activeDay = dayList.find((d) => d.date === day) ?? dayList.find((d) => d.times.length > 0) ?? dayList[0] ?? null
  const nearestDay = dayList.find((d) => d.times.length > 0) ?? null
  const nearestTime = nearestDay?.times[0] ?? null
  const selectedStaffName = staffOptions.find((s) => s.id === staffId)?.name ?? null
  const pickTime = (date: string, minutes: number) => {
    setWhen({ day: date, minutes })
    setDay(date)
    go('contact')
  }

  return (
    <div className="flex flex-col gap-6">
      {step !== 'done' && steps.length > 1 && (
        <div className="flex items-center gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={back}
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-navy-50"
              aria-label="Zpět"
            >
              <ChevronLeft aria-hidden size={20} strokeWidth={1.5} />
            </button>
          ) : null}
          <ol className="flex flex-1 gap-1.5" aria-label={`Krok ${stepIndex + 1} ze ${steps.length}`}>
            {steps.map((s, i) => (
              <li key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100">
                <span
                  className="block h-full rounded-full bg-navy-700 transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: i <= stepIndex ? '100%' : '0%' }}
                />
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && step !== 'contact' && (
        <p role="alert" className="rounded-box bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error.text}
        </p>
      )}

      {step !== 'done' && (service || chosenWhen || selectedStaffName) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-box bg-navy-50 px-4 py-3 text-[14px] text-navy-900" aria-label="Shrnutí objednávky">
          {service && <span className="font-semibold">{service.name}</span>}
          {service?.price !== null && service?.price !== undefined && (
            <span className="font-num">{formatMoney(service.price, { currency: (service.currency as WsCurrency) ?? 'CZK' })}</span>
          )}
          {chosenWhen && <span className="font-num">{formatDayShort(chosenWhen.day)} v {formatMinutes(chosenWhen.minutes)}</span>}
          {selectedStaffName && <span>{selectedStaffName}</span>}
        </div>
      )}

      <section key={step} className="ws-order-step-in flex flex-col gap-5">
          {step === 'service' && (
            <>
              <h2 ref={stepHeading} tabIndex={-1} className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none">Co pro vás můžeme udělat?</h2>
              <ul className="flex flex-col gap-2.5">
                {services.map((s) => {
                  const active = s.id === serviceId
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setServiceId(s.id)
                          setStaffId(null)
                          setDay(null)
                          setWhen(null)
                          go(nextAfter('service'), s.id, null)
                        }}
                        className={cn(
                          'flex min-h-[64px] w-full items-center justify-between gap-4 rounded-box border px-5 py-3 text-left transition-colors',
                          active ? 'border-navy-700 bg-navy-50' : 'border-navy-100 bg-surface hover:border-navy-300',
                        )}
                      >
                        <span className="flex flex-col">
                          <span className="text-[16px] font-semibold text-ink">{s.name}</span>
                          <span className="font-num text-[13px] text-quiet">{s.durationMin} min</span>
                        </span>
                        {s.price !== null && (
                          <span className="font-num text-[15px] font-medium text-ink">
                            {formatMoney(s.price, { currency: (s.currency as WsCurrency) ?? 'CZK' })}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setServiceId(null)
                  setStaffId(null)
                  setDay(null)
                  setWhen(null)
                  go(nextAfter('service'), null, null)
                }}
                className="self-start text-[15px] font-medium text-navy-500 underline-offset-4 hover:underline"
              >
                Nevím, poradíte mi
              </button>
            </>
          )}

          {step === 'time' && booking === 'slots' && (
            <>
              <h2 ref={stepHeading} tabIndex={-1} className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none">Kdy se vám to hodí?</h2>
              {!slots ? (
                <p className="text-[15px] text-quiet" aria-live="polite">
                  Hledáme volné časy…
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {staffOptions.length > 1 && (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-[14px] font-medium text-ink">Kdo vás obslouží?</legend>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Pracovník">
                        <Pill active={staffId === null} onClick={() => selectStaff(null)}>Kdokoli</Pill>
                        {staffOptions.map((worker) => (
                          <Pill key={worker.id} active={staffId === worker.id} onClick={() => selectStaff(worker.id)}>
                            {worker.name}
                          </Pill>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {nearestDay && nearestTime !== null && (
                    <Button variant="outline" size="lg" className="justify-start" onClick={() => pickTime(nearestDay.date, nearestTime.minutes)}>
                      <CalendarPlus aria-hidden size={18} strokeWidth={1.5} />
                      <span className="flex flex-col items-start">
                        <span>Nejbližší volný termín</span>
                        <span className="font-num text-[13px] font-normal">{nearestDay.label} v {nearestTime.time}</span>
                      </span>
                    </Button>
                  )}

                  {nearestDay ? (
                    <>
                      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Den">
                        {dayList.map((d) => (
                          <Pill
                            key={d.date}
                            active={d.date === activeDay?.date}
                            disabled={d.times.length === 0}
                            aria-label={`${d.label}${d.times.length === 0 ? ', bez volných termínů' : ''}`}
                            onClick={() => setDay(d.date)}
                          >
                            {d.label}
                          </Pill>
                        ))}
                      </div>
                      {activeDay?.times.length ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Čas">
                          {activeDay.times.map((t) => (
                            <Pill
                              key={t.minutes}
                              active={when?.day === activeDay.date && when.minutes === t.minutes}
                              onClick={() => pickTime(activeDay.date, t.minutes)}
                            >
                              <span className="font-num">{t.time}</span>
                            </Pill>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[14px] text-quiet" aria-live="polite">Na tento den už není volný termín.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] text-quiet">
                        V příštích třech týdnech není volný termín. Napište nám a domluvíme ho.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setWhen(null)
                          go('contact')
                        }}
                      >
                        Napsat bez termínu
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'time' && booking === 'free' && (
            <>
              <h2 ref={stepHeading} tabIndex={-1} className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none">Kdy se vám to hodí?</h2>
              <p className="-mt-2 text-[15px] text-quiet">Navrhněte čas, potvrdíme vám ho.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Den
                  <Input
                    type="date"
                    value={freeDay}
                    min={today}
                    max={addDays(today, 60)}
                    onChange={(e) => setFreeDay(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Čas
                  <select className={inputBase} value={freeTime} onChange={(e) => setFreeTime(e.target.value)}>
                    <option value="">Vyberte</option>
                    {FREE_TIMES.map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button size="lg" disabled={!freeDay || !freeTime} onClick={() => go('contact')}>
                Pokračovat
              </Button>
              <button
                type="button"
                onClick={() => {
                  setFreeDay('')
                  setFreeTime('')
                  go('contact')
                }}
                className="self-start text-[15px] font-medium text-navy-500 underline-offset-4 hover:underline"
              >
                Čas domluvíme potom
              </button>
            </>
          )}

          {step === 'contact' && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <h2 ref={stepHeading} tabIndex={-1} className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none">Na koho se máme obrátit?</h2>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Jméno a příjmení
                <Input name="name" autoComplete="name" required maxLength={120} aria-invalid={invalid('name')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Telefon
                <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} aria-invalid={invalid('phone')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                E-mail
                <Input name="email" type="email" autoComplete="email" maxLength={200} aria-invalid={invalid('email')} />
              </label>
              <p className="-mt-2 text-[13px] text-quiet">Stačí telefon nebo e-mail.</p>

              {fields.map((f) => (
                <FieldInput key={f.key} field={f} invalid={invalid(`fields.${f.key}`)} />
              ))}

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                <span>
                  Zpráva <span className="font-normal text-quiet">(nepovinné)</span>
                </span>
                <textarea
                  name="message"
                  rows={3}
                  maxLength={2000}
                  className={cn(inputBase, 'h-auto min-h-[88px] py-2.5')}
                />
              </label>

              <label className="flex min-h-11 items-start gap-3 text-[15px]">
                <input type="checkbox" name="consent" className="mt-0.5 h-5 w-5 shrink-0 accent-navy-700" />
                <span>Chci občas dostat nabídku nebo novinku od {businessName}.</span>
              </label>

              {/* Past na roboty: lidé pole nevidí ani na něj neskočí tabulátorem. */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Web
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              {error && (
                <p role="alert" className="rounded-box bg-danger/10 px-4 py-3 text-[15px] text-danger">
                  {error.text}
                </p>
              )}
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? 'Odesíláme…' : 'Odeslat poptávku'}
              </Button>
              <p className="text-[13px] text-quiet">
                Údaje uvidí jen {businessName} a použije je jen k odpovědi na vaši poptávku.
              </p>
            </form>
          )}

          {step === 'done' && (
            <div className="ws-order-step-in flex flex-col items-start gap-4 rounded-panel bg-surface p-6 shadow-sm">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-navy-700 text-white">
                <Check aria-hidden size={24} strokeWidth={2} />
              </span>
              <h2 ref={stepHeading} tabIndex={-1} className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none">Poptávka je odeslaná</h2>
              <p className="text-[16px] text-quiet">
                {chosenWhen
                  ? `Termín ${formatDayShort(chosenWhen.day)} v ${formatMinutes(chosenWhen.minutes)} zatím čeká na potvrzení firmy.`
                  : 'Firma vaši poptávku dostala a ozve se vám.'}
              </p>
              {chosenWhen && (
                <Button variant="outline" onClick={() => downloadTentativeCalendar({
                  day: chosenWhen.day,
                  minutes: chosenWhen.minutes,
                  durationMin: service?.durationMin ?? 60,
                  businessName,
                  serviceName: service?.name ?? null,
                  uid: confirmation?.calendarUid ?? crypto.randomUUID(),
                })}>
                  <CalendarPlus aria-hidden size={18} strokeWidth={1.5} />
                  Přidat do kalendáře
                </Button>
              )}
              {confirmation?.portalUrl && (
                <a href={confirmation.portalUrl} className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold text-navy-700 underline-offset-4 hover:underline">
                  Otevřít klientský portál
                </a>
              )}
              {chosenWhen && <p className="text-[13px] text-quiet">Přidaný čas je předběžný. Po potvrzení vám firma pošle aktuální údaje.</p>}
            </div>
          )}
      </section>
    </div>
  )
}

function availabilityKey(serviceId: string | null, staffId: string | null): string {
  return `${serviceId ?? 'bez-sluzby'}:${staffId ?? 'kdokoli'}`
}

function icsLocalDate(day: string, minutes: number): string {
  const normalizedDay = addDays(day, Math.floor(minutes / 1440)).replaceAll('-', '')
  const localMinutes = ((minutes % 1440) + 1440) % 1440
  const hours = String(Math.floor(localMinutes / 60)).padStart(2, '0')
  const mins = String(localMinutes % 60).padStart(2, '0')
  return `${normalizedDay}T${hours}${mins}00`
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function downloadTentativeCalendar(input: {
  day: string
  minutes: number
  durationMin: number
  businessName: string
  serviceName: string | null
  uid: string
}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const summary = [input.serviceName, input.businessName].filter(Boolean).join(' · ')
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZakazIQ//Objednavka//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@zakaziq.cz`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Prague:${icsLocalDate(input.day, input.minutes)}`,
    `DTEND;TZID=Europe/Prague:${icsLocalDate(input.day, input.minutes + input.durationMin)}`,
    'STATUS:TENTATIVE',
    'TRANSP:TRANSPARENT',
    `SUMMARY:${icsText(`Předběžně: ${summary}`)}`,
    `DESCRIPTION:${icsText('Termín čeká na potvrzení firmy.')}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'predbezny-termin.ics'
  link.click()
  URL.revokeObjectURL(url)
}

function FieldInput({ field, invalid }: { field: OrderField; invalid?: true }) {
  const name = `f_${field.key}`
  const [choice, setChoice] = useState('')
  const label = (
    <span>
      {field.label}
      {!field.required && <span className="font-normal text-quiet"> (nepovinné)</span>}
    </span>
  )
  const help = field.help ? <span className="text-[13px] font-normal text-quiet">{field.help}</span> : null

  if (field.type === 'choice') {
    return (
      <fieldset className="flex flex-col gap-2" aria-invalid={invalid}>
        <legend className="mb-1.5 text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => (
            <Pill key={o} active={choice === o} onClick={() => setChoice(choice === o ? '' : o)}>
              {o}
            </Pill>
          ))}
        </div>
        <input type="hidden" name={name} value={choice} />
        {help}
      </fieldset>
    )
  }
  if (field.type === 'select') {
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <select name={name} className={inputBase} aria-invalid={invalid} defaultValue="">
          <option value="">Vyberte</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {help}
      </label>
    )
  }
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <Input
        name={name}
        type={field.type === 'date' ? 'date' : 'text'}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        autoComplete={field.type === 'address' ? 'street-address' : 'off'}
        maxLength={1000}
        aria-invalid={invalid}
      />
      {help}
    </label>
  )
}
