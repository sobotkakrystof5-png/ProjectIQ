'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, CalendarPlus, Lock, CalendarClock, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { createCalendarEvent, createClientAvailability, updateCalendarEvent } from '@/app/calendar-actions'
import {
  createCalendarMeeting,
  getMeetingReadiness,
  makeEventMeeting,
  saveMeetingSettings,
  undoCalendarMeeting,
  type MeetingReadiness,
} from '@/app/meeting-actions'
import { calendarIntro, defaultSubject } from '@/lib/admin/meeting-email'
import { CONSULTATION_DEFAULT_MINUTES, CONSULTATION_SLOT_MINUTES } from '@/lib/consultations/rules'
import { cn } from '@/lib/utils'
import { getPragueTodayISO, isoToPragueDateAndTime, parsePragueDatetimeLocalToISO } from '@/lib/prague-time'
import type { CalendarEventType } from '@/lib/types'

interface AdminEventModalProps {
  /** `saved` říká, jestli se má kalendář přečíst znovu. */
  onClose: (saved: boolean) => void
  /** Přečíst kalendář znovu i po zavření okna (třeba po „Zpět" v toastu). */
  onReload?: () => void
  defaultDate?: string   // 'YYYY-MM-DD' pre-fill the date field
  defaultHour?: number   // pre-fill the start hour
  /** Úprava existující události — formulář se předvyplní a uloží se jako změna. */
  editing?: EditableEvent
}

export type EditableEvent = {
  id: string
  type: CalendarEventType
  title: string
  description: string | null
  startsAt: string // ISO
  endsAt: string   // ISO
  contactName: string | null
  phone: string | null
  email: string | null
  /** Událost je schůzka s Google Meet (R-114, R-121). */
  meeting?: {
    inviteStatus: string | null
    inviteTo: string | null
    phone: string | null
    remindersOn: boolean
  } | null
}

/** ISO okamžik → hodnota pro `datetime-local` v pražském čase. */
function isoToLocalValue(iso: string): string {
  const { date, time } = isoToPragueDateAndTime(iso)
  return `${date}T${time.slice(0, 5)}`
}

/*
 * Modal se **mountuje až při otevření** (AD08). Dokud byl pořád v DOM,
 * komponenta se nikdy neodmountovala: `useState` inicializátory níž se spustily
 * jedinkrát při načtení stránky a formulář pak navždy nabízel „dnes 10:00",
 * ať se kliklo na jakýkoli slot.
 *
 * Od AD18 je okno Radix dialog — focus trap, `Escape` a `aria-modal` zadarmo.
 */

function toLocalDatetimeValue(date: string, hour: number): string {
  const h = String(hour).padStart(2, '0')
  return `${date}T${h}:00`
}

function localDatetimeToISO(localDt: string): string {
  // The datetime-local input has no timezone info — we treat it as Prague
  // wall-clock time regardless of the browser's own timezone, and convert
  // it to a UTC ISO string correctly across CET/CEST transitions.
  return parsePragueDatetimeLocalToISO(localDt)
}

/** Volno pro klienty není událost (vlastní tabulka, KP14) — jen třetí volba formuláře. */
type FormType = CalendarEventType | 'availability'

const pad2 = (n: number) => String(n).padStart(2, '0')

const EVENT_TYPES: { id: FormType; label: string; description: string; icon: typeof Lock }[] = [
  {
    id: 'manual',
    label: 'Událost / schůzka',
    description: 'Vlastní schůzka, úkol nebo připomínka',
    icon: CalendarPlus,
  },
  {
    id: 'block',
    label: 'Blokování času',
    description: 'Blokuj termín — klienti neuvidí volný slot',
    icon: Lock,
  },
  {
    id: 'availability',
    label: 'Volno pro klienty',
    description: 'Čas, kdy si klienti můžou zarezervovat konzultaci',
    icon: CalendarClock,
  },
]

function safeIso(local: string): string | null {
  try {
    const iso = parsePragueDatetimeLocalToISO(local)
    return Number.isNaN(Date.parse(iso)) ? null : iso
  } catch {
    return null
  }
}

/** Co klient dostane, podle toho, jestli je telefon a jestli jsou SMS nastavené. */
function remindersPlanText(hasPhone: boolean, smsReady: boolean): string {
  if (hasPhone && smsReady) return 'Den předem e-mail a SMS, hodinu předem e-mail, 10 minut předem SMS.'
  if (hasPhone) return 'Den předem a hodinu předem e-mailem. SMS zatím nejsou nastavené.'
  return 'Den předem a hodinu předem e-mailem. Pro SMS doplňte telefon.'
}

function inviteStatusText(status: string | null): string {
  switch (status) {
    case 'sent':
      return 'Pozvánka klientovi odešla.'
    case 'pending':
    case 'sending':
      return 'Pozvánka se odesílá.'
    case 'failed':
      return 'Pozvánka klientovi neodešla. Pošlete ji znovu z detailu.'
    default:
      return 'Pozvánka se klientovi neposílala.'
  }
}

export function AdminEventModal({ onClose, onReload, defaultDate, defaultHour, editing }: AdminEventModalProps) {
  const today = getPragueTodayISO()
  const initDate = defaultDate ?? today
  const initHour = defaultHour ?? 10

  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [eventType, setEventType] = useState<FormType>(editing?.type ?? 'manual')
  // Volno pro klienty (KP14): den, od–do, délka konzultace, opakování.
  const [avDay, setAvDay] = useState(initDate)
  const [avStart, setAvStart] = useState(`${pad2(Math.min(initHour, 22))}:00`)
  const [avEnd, setAvEnd] = useState(`${pad2(Math.min(initHour + 2, 23))}:00`)
  const [avSlot, setAvSlot] = useState<number>(CONSULTATION_DEFAULT_MINUTES)
  const [avRepeat, setAvRepeat] = useState(false)
  const [avUntil, setAvUntil] = useState('')
  const [contactName, setContactName] = useState(editing?.contactName ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [startsAt, setStartsAt] = useState(
    editing ? isoToLocalValue(editing.startsAt) : toLocalDatetimeValue(initDate, initHour),
  )
  const [endsAt, setEndsAt] = useState(
    editing ? isoToLocalValue(editing.endsAt) : toLocalDatetimeValue(initDate, initHour + 1),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ─── Schůzka přes Google Meet (R-137) ───
  const existingMeeting = editing?.meeting ?? null
  const [readiness, setReadiness] = useState<MeetingReadiness | null>(null)
  const [meetingOn, setMeetingOn] = useState(false)
  const [subjectEdited, setSubjectEdited] = useState<string | null>(null)
  const [introEdited, setIntroEdited] = useState<string | null>(null)
  const [demoUrl, setDemoUrl] = useState('')
  const [reminders, setReminders] = useState(existingMeeting ? existingMeeting.remindersOn : true)
  const [notifyChange, setNotifyChange] = useState(true)

  useEffect(() => {
    if (eventType !== 'manual' || readiness) return
    let alive = true
    getMeetingReadiness()
      .then((r) => { if (alive) setReadiness(r) })
      .catch(() => {})
    return () => { alive = false }
  }, [eventType, readiness])

  const startsIso = useMemo(() => safeIso(startsAt), [startsAt])
  const endsIso = useMemo(() => safeIso(endsAt), [endsAt])
  const subject = subjectEdited ?? (startsIso ? defaultSubject(startsIso) : 'Naše schůzka')
  const intro = introEdited ?? (startsIso ? calendarIntro(startsIso, Boolean(demoUrl.trim())) : '')
  const timeChanged =
    Boolean(editing) &&
    (startsIso === null || endsIso === null ||
      Date.parse(startsIso) !== Date.parse(editing!.startsAt) ||
      Date.parse(endsIso) !== Date.parse(editing!.endsAt))
  const inviteSent = existingMeeting?.inviteStatus === 'sent'
  const canMeet = Boolean(readiness?.available && readiness.google && readiness.mail)
  const settingUp = eventType === 'manual' && !existingMeeting && meetingOn

  // Žádné „vrať formulář na dnes 10:00" — stav umírá s odmountováním, takže
  // druhá událost v sezení začíná tam, kam uživatel klikl (AD08).
  const close = (saved: boolean) => onClose(saved)

  function handleStartsAtChange(val: string) {
    setStartsAt(val)
    // Auto-advance ends_at by 1 hour if it's now before starts_at
    const start = new Date(val)
    const end = new Date(endsAt)
    if (!isNaN(start.getTime()) && end <= start) {
      const newEnd = new Date(start.getTime() + 60 * 60 * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      setEndsAt(
        `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`
      )
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (eventType === 'availability') {
      if (avEnd <= avStart) { setError('Konec musí být po začátku.'); return }
      setError(null)
      startTransition(async () => {
        try {
          await createClientAvailability({
            day: avDay,
            start: avStart,
            end: avEnd,
            slotMinutes: avSlot,
            repeatWeekly: avRepeat,
            repeatUntil: avRepeat && avUntil ? avUntil : null,
          })
          close(true)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Volno se nepodařilo uložit.')
        }
      })
      return
    }
    if (!title.trim()) { setError('Název je povinný.'); return }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('Čas konce musí být po čase začátku.')
      return
    }
    if (settingUp && !email.trim()) {
      setError('Zadejte prosím e-mail klienta. Pošleme na něj pozvánku.')
      return
    }
    if (settingUp && !canMeet) {
      setError('Schůzku přes Google Meet teď nejde založit. Podívejte se na upozornění u přepínače.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const draft = {
          email: email.trim(),
          phone: phone.trim() || null,
          subject,
          intro,
          demoUrl: demoUrl.trim() || null,
          reminders,
        }

        // Nová schůzka: Meet, pozvánka za 15 s s „Zpět", připomínky.
        if (!editing && settingUp) {
          const res = await createCalendarMeeting({
            title: title.trim(),
            description: description.trim() || null,
            startsAt: localDatetimeToISO(startsAt),
            endsAt: localDatetimeToISO(endsAt),
            contactName: contactName.trim() || null,
            draft,
          })
          if (!res.ok) { setError(res.error); return }
          close(true)
          announceInvite(res.eventId, 'delete')
          return
        }

        const payload = {
          title: title.trim(),
          description: description.trim() || null,
          starts_at: localDatetimeToISO(startsAt),
          ends_at: localDatetimeToISO(endsAt),
          event_type: eventType as CalendarEventType,
          // Blokace je soukromá — do Hovorů se nezrcadlí, takže ani kontakt
          // nemá komu patřit.
          contact_name: eventType === 'manual' ? contactName.trim() || null : null,
          phone: eventType === 'manual' ? phone.trim() || null : null,
          email: eventType === 'manual' ? email.trim() || null : null,
        }
        if (!editing) {
          await createCalendarEvent(payload)
          close(true)
          return
        }

        const update = await updateCalendarEvent(editing.id, payload, {
          notifyClient: Boolean(existingMeeting) && inviteSent && timeChanged && notifyChange,
        })
        if (existingMeeting && readiness?.available) {
          const saved = await saveMeetingSettings({
            eventId: editing.id,
            email: email.trim() || null,
            phone: phone.trim() || null,
            reminders,
          })
          if (!saved.ok) { setError(saved.error); return }
        }
        if (settingUp) {
          const res = await makeEventMeeting({ eventId: editing.id, draft })
          if (!res.ok) { setError(res.error); return }
          close(true)
          announceInvite(res.eventId, 'revert')
          return
        }
        close(true)
        if (update.warning) toast.error(update.warning)
        else if (update.noticeQueued) toast.success('Uloženo. Klient dostane zprávu o změně termínu.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chyba serveru.')
      }
    })
  }

  function announceInvite(eventId: string, mode: 'delete' | 'revert') {
    toast.success('Schůzka je v kalendáři. Pozvánka odejde za 15 s.', {
      description: reminders ? 'Připomínky klientovi jsou naplánované.' : undefined,
      duration: 15_000,
      undo: async () => {
        const undone = await undoCalendarMeeting(eventId, mode)
        if (undone.ok) toast.success(mode === 'delete' ? 'Schůzka zrušená, pozvánka neodešla.' : 'Pozvánka neodešla, událost zůstala.')
        else toast.error(undone.error)
        onReload?.()
      },
    })
  }

  const inputCls =
    'w-full border border-navy-100 rounded-chip px-3 py-2 text-sm text-ink placeholder:text-quiet ' +
    'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface'

  return (
    <Dialog open onOpenChange={open => { if (!open) close(false) }}>
      <DialogContent className={settingUp ? 'max-w-lg' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus size={16} strokeWidth={1.5} className="text-navy-600" aria-hidden="true" />
            {editing ? 'Upravit v kalendáři' : 'Přidat do kalendáře'}
          </DialogTitle>
          <DialogDescription>{editing ? 'Změňte, co potřebujete, a uložte. Termín se hlídá proti kolizi.' : eventType === 'availability' ? 'Klienti si v tomhle čase zarezervují konzultaci. Co už máte v kalendáři, zůstane obsazené.' : 'Událost nebo blokace v diáři. Termín se hlídá proti kolizi.'}</DialogDescription>
        </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Event type selector */}
        {!editing && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EVENT_TYPES.map(({ id, label, description: desc, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setEventType(id)}
              className={cn(
                'flex flex-col items-start gap-1 p-3 rounded-chip border text-left transition-all duration-150',
                eventType === id
                  ? 'border-navy-400 bg-navy-50'
                  : 'border-navy-100 bg-surface hover:border-navy-200 hover:bg-navy-50/50',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  size={13}
                  strokeWidth={1.5}
                  className={eventType === id ? 'text-navy-700' : 'text-quiet'}
                />
                <span className={cn(
                  'text-xs font-semibold',
                  eventType === id ? 'text-navy-800' : 'text-ink',
                )}>
                  {label}
                </span>
              </div>
              <span className="text-[11px] text-quiet leading-snug">{desc}</span>
            </button>
          ))}
        </div>}

        {eventType === 'availability' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="av-day" className="text-sm font-medium text-ink">Den *</label>
              <input id="av-day" type="date" value={avDay} min={today} onChange={e => setAvDay(e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="av-start" className="text-sm font-medium text-ink">Od *</label>
                <input id="av-start" type="time" step={900} value={avStart} onChange={e => setAvStart(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="av-end" className="text-sm font-medium text-ink">Do *</label>
                <input id="av-end" type="time" step={900} value={avEnd} onChange={e => setAvEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="av-slot" className="text-sm font-medium text-ink">Délka jedné konzultace</label>
              <select id="av-slot" value={avSlot} onChange={e => setAvSlot(Number(e.target.value))} className={cn(inputCls, 'min-h-11')}>
                {CONSULTATION_SLOT_MINUTES.map(m => <option key={m} value={m}>{m} minut</option>)}
              </select>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={avRepeat} onChange={e => setAvRepeat(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Opakovat každý týden
            </label>
            {avRepeat && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="av-until" className="text-sm font-medium text-ink">Opakovat do (nepovinné)</label>
                <input id="av-until" type="date" value={avUntil} min={avDay} onChange={e => setAvUntil(e.target.value)} className={inputCls} />
                <p className="text-[11px] leading-snug text-quiet">Bez data se volno opakuje, dokud ho nesmažete.</p>
              </div>
            )}
          </div>
        )}

        {eventType !== 'availability' && <>
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            Název *
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={eventType === 'block' ? 'Např. Nedostupný' : 'Např. Schůzka s partnerem'}
            maxLength={120}
            className={inputCls}
            autoFocus
          />
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">
              Začátek *
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={e => handleStartsAtChange(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">
              Konec *
            </label>
            <input
              type="datetime-local"
              value={endsAt}
              min={startsAt}
              onChange={e => setEndsAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Kontakt (AD10) — jen u událostí, blokace se nezrcadlí */}
        {eventType === 'manual' && (
          <div className="flex flex-col gap-2 rounded-chip border border-navy-100 bg-navy-50/40 p-3">
            <p className="text-sm font-medium text-ink">
              Kontakt (nepovinné)
            </p>
            <p className="text-[11px] leading-snug text-quiet">
              Doplňte telefon nebo e-mail a z Hovorů i z kalendáře pak zavoláte jedním klikem.
            </p>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jméno"
              maxLength={120}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Telefon"
                maxLength={40}
                className={inputCls}
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={settingUp ? 'E-mail (povinný)' : 'E-mail'}
                required={settingUp}
                maxLength={200}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Schůzka přes Google Meet (R-137) — jen u událostí */}
        {eventType === 'manual' && existingMeeting && (
          <div className="flex flex-col gap-2 rounded-chip border border-navy-100 bg-navy-50/40 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <Video size={14} strokeWidth={1.5} aria-hidden="true" className="text-navy-700" />
              Schůzka přes Google Meet
            </p>
            <p className="text-[11px] leading-snug text-quiet">{inviteStatusText(existingMeeting.inviteStatus)}</p>
            {readiness?.available && (
              <ReminderCheckbox
                checked={reminders}
                onChange={setReminders}
                hint={remindersPlanText(Boolean(phone.trim()), Boolean(readiness.sms))}
              />
            )}
            {inviteSent && timeChanged && (
              <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={notifyChange}
                  onChange={(e) => setNotifyChange(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-navy-700"
                />
                <span>
                  Poslat klientovi zprávu o změně termínu
                  <span className="block text-[11px] leading-snug text-quiet">
                    {existingMeeting.phone ? 'E-mailem a SMS' : 'E-mailem'} s novým časem. Odkaz na připojení zůstává.
                  </span>
                </span>
              </label>
            )}
            {reminders && readiness?.available && readiness.trigger !== true && <TriggerWarning neverRan={readiness.trigger === null} />}
          </div>
        )}

        {eventType === 'manual' && !existingMeeting && readiness?.available && (
          <div className="flex flex-col gap-3 rounded-chip border border-navy-100 p-3">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Video size={14} strokeWidth={1.5} aria-hidden="true" className="text-navy-700" />
                  Schůzka přes Google Meet
                </span>
                <span className="text-[11px] leading-snug text-quiet">Klient dostane pozvánku s odkazem a připomínky.</span>
              </span>
              <Switch checked={meetingOn} onCheckedChange={setMeetingOn} aria-label="Schůzka přes Google Meet" />
            </label>

            {meetingOn && !readiness.google && (
              <p className="text-xs text-quiet">
                Odkaz na Meet vzniká ve vašem Google Kalendáři. Nejdřív ho propojte{' '}
                <a href="/dashboard/profil#google" className="font-semibold text-navy-700 underline-offset-4 hover:underline">
                  v Profilu
                </a>
                .
              </p>
            )}
            {meetingOn && readiness.google && !readiness.mail && (
              <p className="text-xs text-quiet">Odesílání e-mailů z vizeon.cz není nastavené, pozvánka by neodešla.</p>
            )}

            {meetingOn && canMeet && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="meeting-subject" className="text-sm font-medium text-ink">Předmět</label>
                  <input
                    id="meeting-subject"
                    type="text"
                    value={subject}
                    maxLength={200}
                    onChange={(e) => setSubjectEdited(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="meeting-intro" className="text-sm font-medium text-ink">Text pozvánky</label>
                  <textarea
                    id="meeting-intro"
                    value={intro}
                    rows={8}
                    maxLength={4000}
                    onChange={(e) => setIntroEdited(e.target.value)}
                    className={cn(inputCls, 'resize-y')}
                  />
                  <p className="flex items-start gap-1.5 text-[11px] leading-snug text-quiet">
                    Pod text sami doplníme termín, tlačítko Připojit se, ukázku a váš podpis. Přiložíme i soubor do kalendáře.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="meeting-demo" className="text-sm font-medium text-ink">Odkaz na ukázku (nepovinné)</label>
                  <input
                    id="meeting-demo"
                    type="url"
                    inputMode="url"
                    value={demoUrl}
                    maxLength={500}
                    placeholder="https://…"
                    onChange={(e) => setDemoUrl(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <ReminderCheckbox
                  checked={reminders}
                  onChange={setReminders}
                  hint={remindersPlanText(Boolean(phone.trim()), readiness.sms)}
                />
                {reminders && readiness.trigger !== true && <TriggerWarning neverRan={readiness.trigger === null} />}
              </div>
            )}
          </div>
        )}

        {/* Description (only for manual events) */}
        {eventType === 'manual' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">
              Poznámka (nepovinné)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Detail nebo připomínka…"
              className={cn(inputCls, 'resize-none')}
            />
          </div>
        )}

        </>}

        {error && (
          <p className="rounded-chip border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
          >
            {isPending
              ? <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Ukládám…</>
              : settingUp ? 'Poslat pozvánku' : editing ? 'Uložit změny' : eventType === 'availability' ? 'Uložit volno' : 'Uložit událost'
            }
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="inline-flex min-h-11 items-center rounded-full border border-input px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-navy-50"
          >
            Zrušit
          </button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  )
}

function ReminderCheckbox({
  checked,
  onChange,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  hint: string
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-navy-700"
      />
      <span>
        Připomenout klientovi
        <span className="block text-[11px] leading-snug text-quiet">{hint}</span>
      </span>
    </label>
  )
}

function TriggerWarning({ neverRan }: { neverRan: boolean }) {
  return (
    <p className="rounded-chip border border-navy-100 bg-surface px-3 py-2 text-[11px] leading-snug text-quiet">
      {neverRan
        ? 'Spouštěč připomínek ještě neběžel. Dokud ho nenastavíte, připomínky počkají.'
        : 'Spouštěč připomínek teď neběží. Připomínky odejdou, až se zase rozběhne.'}
    </p>
  )
}
