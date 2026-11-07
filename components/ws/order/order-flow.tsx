'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { CalendarPlus, Check, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOrderSlots, submitOrder, type OrderAvailability, type OrderSlots, type OrderStaff } from '@/app/r/[slug]/actions'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { addDays, formatDayShort, formatMinutes, pragueParts } from '@/lib/ws/time'
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
type OrderSession = OrderAvailability['sessions'][number]

type Step = 'service' | 'time' | 'contact' | 'done'

const STEP_LABEL: Record<Exclude<Step, 'done'>, string> = { service: 'Služba', time: 'Termín', contact: 'Kontakt' }

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
  hasSessions,
  initialAvailability,
  today,
}: {
  slug: string
  businessName: string
  embedded: boolean
  services: OrderService[]
  fields: OrderField[]
  booking: 'slots' | 'free' | 'none'
  hasSessions: boolean
  initialAvailability: OrderAvailability | null
  today: string
}) {
  const steps = useMemo<Step[]>(
    () => [...(services.length > 1 ? (['service'] as Step[]) : []), ...(booking !== 'none' || hasSessions ? (['time'] as Step[]) : []), 'contact'],
    [services.length, booking, hasSessions],
  )
  const initialServiceIds = services.length === 1 ? [services[0].id] : []
  const initialKey = initialAvailability ? availabilityKey(initialServiceIds, null) : null
  const [step, setStep] = useState<Step>(steps[0])
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceIds)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [staffOptions, setStaffOptions] = useState<OrderStaff[]>(initialAvailability?.staff ?? [])
  const [slots, setSlots] = useState<OrderSlots | null>(initialAvailability?.slots ?? null)
  const [sessions, setSessions] = useState<OrderSession[]>(initialAvailability?.sessions ?? [])
  const [sessionId, setSessionId] = useState<string | null>(null)
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

  const selectedServices = serviceIds.map((id) => services.find((service) => service.id === id)).filter((service): service is OrderService => Boolean(service))
  const durationMin = selectedServices.reduce((sum, selected) => sum + selected.durationMin, 0) || 60
  const priceByCurrency = selectedServices.reduce<Record<string, number>>((totals, selected) => {
    if (selected.price !== null) totals[selected.currency] = (totals[selected.currency] ?? 0) + selected.price
    return totals
  }, {})
  const stepIndex = step === 'done' ? steps.length : steps.indexOf(step)

  useEffect(() => {
    if (mounted.current) stepHeading.current?.focus({ preventScroll: true })
    else mounted.current = true
  }, [step])

  const loadSlotsFor = (ids: readonly string[], forStaff: string | null, force = false) => {
    const key = availabilityKey(ids, forStaff)
    if ((booking !== 'slots' && !hasSessions) || (!force && slotsFor === key)) return
    const requestId = ++slotRequest.current
    setSlots(null)
    setSlotsFor(key)
    start(async () => {
      const res = await getOrderSlots({ slug, serviceId: ids[0] ?? null, serviceIds: [...ids], staffId: forStaff })
      if (requestId !== slotRequest.current) return
      if (res.ok) {
        setSlots(res.slots)
        setStaffOptions(res.staff)
        setSessions(res.sessions)
      } else {
        setSlots(null)
        setSessions(res.sessions ?? [])
        setSlotsFor(null)
        setError({ text: res.error })
      }
    })
  }

  const go = (next: Step, forServices: readonly string[] = serviceIds, forStaff: string | null = staffId) => {
    setError(null)
    if (next === 'time') loadSlotsFor(forServices, forStaff)
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
    loadSlotsFor(serviceIds, id, true)
  }

  const selectedSession = sessions.find((session) => session.id === sessionId) ?? null
  const chosenWhen: When | null = selectedSession
    ? (() => { const p = pragueParts(selectedSession.start); return { day: p.date, minutes: p.minutes } })()
    : booking === 'free' && freeDay && freeTime ? { day: freeDay, minutes: Number(freeTime) } : booking === 'slots' ? when : null

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
          serviceId: serviceIds[0] ?? null,
          serviceIds,
          sessionId,
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
            setSlotsFor(availabilityKey(serviceIds, staffId))
            setDay(res.slots.find((d) => d.times.length)?.date ?? null)
            if (res.staff) setStaffOptions(res.staff)
            if (res.sessions) setSessions(res.sessions)
          } else {
            setSlotsFor(null)
            loadSlotsFor(serviceIds, staffId, true)
          }
          setError({ text: res.error })
          setStep('time')
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        if (res.sessionFull) {
          setSessionId(null)
          setSessions(res.sessions ?? [])
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
    setSessionId(null)
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
          <ol className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1" aria-label={`Krok ${stepIndex + 1} ze ${steps.length}`}>
            {steps.map((s, i) => {
              const done = i < stepIndex
              const current = i === stepIndex
              return (
                <li key={s} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-num text-[12px] font-medium transition-colors duration-200',
                      done || current ? 'bg-navy-700 text-white' : 'bg-navy-50 text-quiet',
                      current && 'ring-4 ring-navy-100',
                    )}
                  >
                    {done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className={cn('text-[13px] font-medium', current ? 'text-ink' : 'text-quiet', !current && 'hidden sm:inline')}>
                    {STEP_LABEL[s as Exclude<Step, 'done'>]}
                  </span>
                  {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-navy-100 sm:w-8" />}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {error && step !== 'contact' && (
        <p role="alert" className="rounded-box bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error.text}
        </p>
      )}

      {step !== 'done' && (selectedServices.length > 0 || chosenWhen || selectedStaffName) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-box bg-navy-50 px-4 py-3 text-[14px] text-navy-900" aria-label="Shrnutí objednávky">
          <span className="font-num text-[11px] font-medium uppercase tracking-[0.08em] text-quiet">Vaše volba</span>
          {selectedServices.length > 0 && <span className="font-semibold">{selectedServices.map((s) => s.name).join(' + ')}</span>}
          {Object.entries(priceByCurrency).map(([currency, amount]) => (
            <span key={currency} className="font-num">{formatMoney(amount, { currency: currency as WsCurrency })}</span>
          ))}
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
                  const active = serviceIds.includes(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={!active && (serviceIds.length >= 5 || selectedServices.reduce((sum, item) => sum + item.durationMin, 0) + s.durationMin > 720)}
                        aria-pressed={active}
                        onClick={() => {
                          const next = active ? serviceIds.filter((id) => id !== s.id) : [...serviceIds, s.id]
                          setServiceIds(next)
                          setStaffId(null)
                          setDay(null)
                          setWhen(null)
                          setSessionId(null)
                          setSlotsFor(null)
                          setSlots(null)
                          setError(null)
                        }}
                        className={cn(
                          'group flex min-h-[64px] w-full items-center gap-4 rounded-box border px-4 py-3 text-left transition-colors duration-200 ease-zq sm:px-5',
                          active ? 'border-navy-700 bg-navy-50' : 'border-navy-100 bg-surface hover:border-navy-300',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                            active ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-200 bg-surface group-hover:border-navy-400',
                          )}
                        >
                          {active && <Check size={14} strokeWidth={2.5} />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[16px] font-semibold text-ink">{s.name}</span>
                          <span className="font-num text-[13px] text-quiet">{s.durationMin} min</span>
                        </span>
                        {s.price !== null && (
                          <span className="shrink-0 font-num text-[15px] font-medium text-ink">
                            {formatMoney(s.price, { currency: (s.currency as WsCurrency) ?? 'CZK' })}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[14px] text-quiet">Vyberte až pět služeb. Jejich délky se spojí do jednoho navazujícího termínu, nejvýše na 12 hodin.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => { setServiceIds([]); setStaffId(null); setDay(null); setWhen(null); setSlotsFor(null); setSlots(null); setError(null); go(nextAfter('service'), [], null) }}>
                  Nevím, poradíte mi
                </Button>
                <Button type="button" disabled={serviceIds.length === 0} onClick={() => go(nextAfter('service'))}>
                  Pokračovat{selectedServices.length ? ` · ${durationMin} min` : ''}
                </Button>
              </div>
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
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" role="group" aria-label="Čas">
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

          {step === 'time' && sessions.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="skupinove-lekce">
              <h2 id="skupinove-lekce" className="text-[19px] font-semibold text-ink">Skupinové lekce</h2>
              <p className="text-[14px] text-quiet">Vyberte vypsaný termín. Místo se rezervuje hned po odeslání poptávky.</p>
              <ul className="flex flex-col gap-2">
                {sessions.map((session) => {
                  const start = pragueParts(session.start)
                  const active = session.id === sessionId
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setServiceIds([session.serviceId])
                          setSessionId(session.id)
                          setWhen(null)
                          setDay(start.date)
                          go('contact', [session.serviceId], null)
                        }}
                        className={cn('flex min-h-[68px] w-full items-center justify-between gap-3 rounded-box border px-4 py-3 text-left', active ? 'border-navy-700 bg-navy-50' : 'border-line bg-surface hover:border-navy-300')}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-ink">{session.serviceName}</span>
                          <span className="font-num text-sm text-quiet">{formatDayShort(start.date)} v {formatMinutes(start.minutes)} · {session.staffName ?? 'Skupinová lekce'}</span>
                        </span>
                        <span className="shrink-0 font-num text-sm text-navy-700">{session.places} {session.places === 1 ? 'místo' : session.places >= 2 && session.places <= 4 ? 'místa' : 'míst'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
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
                <span>Chci od firmy {businessName} občas dostat nabídku nebo novinku.</span>
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
            <div className="ws-order-step-in flex flex-col items-start gap-5">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-navy-700 text-white">
                <Check aria-hidden size={28} strokeWidth={2} />
              </span>
              <div className="flex flex-col gap-2">
                <h2 ref={stepHeading} tabIndex={-1} className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] focus:outline-none sm:text-[30px]">Poptávka je odeslaná</h2>
                <p className="max-w-[46ch] text-[16px] leading-relaxed text-quiet">
                  {chosenWhen
                    ? `Termín ${formatDayShort(chosenWhen.day)} v ${formatMinutes(chosenWhen.minutes)} zatím čeká na potvrzení firmy ${businessName}. Potvrzení přijde e-mailem.`
                    : `Firma ${businessName} vaši poptávku dostala a ozve se vám.`}
                </p>
              </div>
              {(selectedServices.length > 0 || chosenWhen) && (
                <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-box bg-navy-50 px-4 py-3 text-[15px] text-navy-900">
                  {selectedServices.length > 0 && (
                    <>
                      <dt className="text-quiet">Služba</dt>
                      <dd className="font-semibold">{selectedServices.map((s) => s.name).join(' + ')}</dd>
                    </>
                  )}
                  {chosenWhen && (
                    <>
                      <dt className="text-quiet">Termín</dt>
                      <dd className="font-num">{formatDayShort(chosenWhen.day)} v {formatMinutes(chosenWhen.minutes)}{durationMin ? `, ${durationMin} min` : ''}</dd>
                    </>
                  )}
                  {selectedStaffName && (
                    <>
                      <dt className="text-quiet">Kdo</dt>
                      <dd>{selectedStaffName}</dd>
                    </>
                  )}
                </dl>
              )}
              {chosenWhen && (
                <Button variant="outline" onClick={() => downloadTentativeCalendar({
                  day: chosenWhen.day,
                  minutes: chosenWhen.minutes,
                  durationMin,
                  businessName,
                  serviceName: selectedServices.map((selected) => selected.name).join(' + ') || null,
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

function availabilityKey(serviceIds: readonly string[], staffId: string | null): string {
  return `${serviceIds.join(',') || 'bez-sluzby'}:${staffId ?? 'kdokoli'}`
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
