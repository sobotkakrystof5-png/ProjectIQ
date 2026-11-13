'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, X, ExternalLink,
  CalendarDays, Phone, Monitor, Video, MessageSquare,
  CalendarPlus, Lock, Trash2, Clock, Flag,
  Building2, User, Mail, MessageCircle, Coins,
} from 'lucide-react'
import { deleteCalendarEvent } from '@/app/calendar-actions'
import {
  CHANNEL_LABELS, LEAD_ACTION_TYPE_LABELS, LEAD_STATUS_LABELS,
  type ConsultationChannel, type CalendarEventType, type LeadActionType, type LeadStatus,
} from '@/lib/types'
import { AdminEventModal } from './AdminEventModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toolbar } from '@/components/ws/app/toolbar'
import { LEAD_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { cn } from '@/lib/utils'
import { staffAccent, staffTint } from '@/lib/ws/staff-colors'
import { ContactActions } from '@/components/admin/contact-actions'
import { mailtoHref } from '@/lib/contacts/href'
import {
  addIsoDays, getDaysInMonth, getMonthStartOffset, isoWeekday,
  pragueDayOf, pragueMinutesOf, toMondayFirst,
} from '@/lib/prague-time'
import { loadCalendarMonth } from '@/app/calendar-actions'
import type {
  CalendarData, RawCalendarEvent, RawConsultation, RawDeadline, RawLead,
} from '@/lib/admin/calendar'
import {
  covers, mergeRanges, neighbourAnchor, startOfMonthIso, startOfWeekIso, viewRange,
  type CalendarView, type DayRange,
} from '@/lib/admin/calendar-window'

// Tvary dat ze serveru žijí v `lib/admin/calendar.ts` — ten je čte z databáze
// a importuje je i server action pro dotažení dalšího období (AD08).

// ─── Unified event type ───────────────────────────────────────────────────────

type EventKind = 'consultation' | 'deadline' | 'manual' | 'block' | 'call'

interface UnifiedEvent {
  id: string
  kind: EventKind
  startsAt: Date
  endsAt: Date
  /**
   * Pražský kalendářní den a minuty od midnight. Mřížka se kreslí **jen**
   * z nich: `getHours()` čte zónu prohlížeče a zahazuje minuty, takže
   * událost v 10:15 se dřív nakreslila na linku 10:00 (AD08).
   */
  day: string
  startMin: number
  endMin: number
  allDay: boolean
  label: string
  sublabel: string
  channel?: ConsultationChannel
  meta: {
    projectId?: string
    meetingLink?: string | null
    clientWish?: string
    clientEmail?: string | null
    description?: string | null
    clientName?: string
    // kontakt z Hovorů — jen u kind === 'call'
    lead?: {
      id: string
      companyName: string
      contactName: string | null
      phone: string | null
      email: string | null
      status: LeadStatus
      estimatedValue: number | null
      notes: string | null
    }
    /**
     * Kontakt u ručně zapsané události — zrcadlený lead z migrace 051.
     * Je tu jen tehdy, když má telefon nebo e-mail; jinak by detail nabízel
     * akce, které nemají kam vést.
     */
    contact?: {
      name: string | null
      phone: string | null
      email: string | null
    }
  }
}

// ─── Colour system ────────────────────────────────────────────────────────────

/**
 * Barva události (AD17). Druh události ani kanál konzultace nejsou stav, jen
 * kategorie — a kategorie se podle R-091 nebarví vlastní paletou. Dílky mají
 * přesně na tohle tóny termínů `--staff-1…5` (DESIGN.md → Colors: „rozlišují
 * vlastníky termínů, nikdy nenesou naléhavost ani chybu"). Devět vlastních
 * odstínů od zelené po fialovou tím mizí.
 *
 * Barva se vkládá stylem, ne třídou: tokeny jsou CSS proměnné a plocha je
 * jejich nádech přes `color-mix`.
 */
const CHANNEL_TONE: Record<ConsultationChannel, number> = {
  whatsapp: 1,
  teams: 2,
  meet: 3,
  phone: 0,
  other: 4,
}

const KIND_TONE: Partial<Record<EventKind, number>> = {
  consultation: 0,
  deadline: 3,
  manual: 4,
  block: 0,
  call: 1,
}

export type EventStyle = {
  /** Plná barva: proužek, tečka, zvýraznění. */
  dot: React.CSSProperties
  /** Plocha bloku: nádech barvy, tenký okraj, text v barvě. */
  pill: React.CSSProperties
}

function getEventStyle(ev: UnifiedEvent): EventStyle {
  const tone = ev.kind === 'consultation' && ev.channel ? CHANNEL_TONE[ev.channel] : (KIND_TONE[ev.kind] ?? 0)
  const accent = staffAccent(null, tone)
  // Blokace je soukromá nedostupnost, ne něco, na co se kouká — proto tiše.
  if (ev.kind === 'block') {
    return {
      dot: { backgroundColor: 'rgb(var(--navy-300))' },
      pill: { backgroundColor: 'rgb(var(--navy-50))', borderColor: 'rgb(var(--navy-200))', color: 'rgb(var(--quiet))' },
    }
  }
  return {
    dot: { backgroundColor: accent },
    pill: {
      backgroundColor: staffTint(accent),
      borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
      color: accent,
    },
  }
}

function ChannelIcon({ channel }: { channel: ConsultationChannel }) {
  const size = 12
  const sw = 1.5
  if (channel === 'whatsapp') return <MessageSquare size={size} strokeWidth={sw} />
  if (channel === 'teams')    return <Monitor size={size} strokeWidth={sw} />
  if (channel === 'meet')     return <Video size={size} strokeWidth={sw} />
  return <Phone size={size} strokeWidth={sw} />
}

// ─── Data unification ─────────────────────────────────────────────────────────

/** Pražský den a rozsah minut jednoho okamžiku; konec přes midnight se zkrátí. */
function moment(start: Date, end: Date): Pick<UnifiedEvent, 'day' | 'startMin' | 'endMin'> {
  const day = pragueDayOf(start)
  const startMin = pragueMinutesOf(start)
  const endMin = pragueDayOf(end) === day ? pragueMinutesOf(end) : 24 * 60
  return { day, startMin, endMin: Math.max(endMin, startMin) }
}

function buildUnified({ consultations, deadlines, events, leads }: CalendarData): UnifiedEvent[] {
  const result: UnifiedEvent[] = []

  for (const c of consultations) {
    const start = new Date(c.scheduled_at)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    result.push({
      id: c.id,
      kind: 'consultation',
      startsAt: start,
      endsAt: end,
      ...moment(start, end),
      allDay: false,
      label: c.client_name,
      sublabel: CHANNEL_LABELS[c.channel],
      channel: c.channel,
      meta: {
        projectId: c.project_id,
        meetingLink: c.meeting_link,
        clientWish: c.client_wish,
        clientEmail: c.client_email,
        clientName: c.client_name,
      },
    })
  }

  for (const d of deadlines) {
    const [y, m, day] = d.deadline.split('-').map(Number)
    const start = new Date(y, m - 1, day, 0, 0, 0)
    const end   = new Date(y, m - 1, day, 23, 59, 59)
    result.push({
      id: `deadline-${d.id}`,
      kind: 'deadline',
      startsAt: start,
      endsAt: end,
      // Deadline je datum bez času — `d.deadline` je už pražský den.
      day: d.deadline,
      startMin: 0,
      endMin: 24 * 60,
      allDay: true,
      label: d.client_name,
      sublabel: 'Deadline',
      meta: { clientName: d.client_name, projectId: d.id },
    })
  }

  for (const e of events) {
    const start = new Date(e.starts_at)
    const end = new Date(e.ends_at)
    result.push({
      id: e.id,
      kind: e.event_type as EventKind,
      startsAt: start,
      endsAt: end,
      ...moment(start, end),
      allDay: false,
      label: e.title,
      sublabel: e.event_type === 'block' ? 'Blokovaný čas' : 'Událost',
      meta: {
        description: e.description,
        // Volat se dá jen tam, kde je na co. Blokace je soukromá
        // nedostupnost bez kontaktu, takže u ní kontakt nehledáme.
        contact:
          e.event_type !== 'block' && (e.contact_phone !== null || e.contact_email !== null)
            ? { name: e.contact_name, phone: e.contact_phone, email: e.contact_email }
            : undefined,
      },
    })
  }

  for (const lead of leads) {
    const start = new Date(lead.action_at)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    result.push({
      id: `lead-${lead.id}`,
      kind: 'call',
      startsAt: start,
      endsAt: end,
      ...moment(start, end),
      allDay: false,
      label: lead.contact_name || lead.company_name,
      sublabel: LEAD_ACTION_TYPE_LABELS[lead.next_action_type as LeadActionType] ?? lead.next_action_type ?? 'Akce',
      meta: {
        description: lead.next_action,
        lead: {
          id: lead.id,
          companyName: lead.company_name,
          contactName: lead.contact_name,
          phone: lead.phone,
          email: lead.email,
          status: lead.lead_status,
          estimatedValue: lead.estimated_value,
          notes: lead.notes,
        },
      },
    })
  }

  return result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS_CZ = [
  'Leden','Únor','Březen','Duben','Květen','Červen',
  'Červenec','Srpen','Září','Říjen','Listopad','Prosinec',
]
const WEEKDAYS_LONG_CZ = ['Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota','Neděle']
const WEEKDAYS_SHORT_CZ = ['Po','Út','St','Čt','Pá','So','Ne']

/** 'YYYY-MM-DD' → den měsíce (jen pro popisek v mřížce). */
function dayNumberOf(iso: string): number {
  return Number(iso.slice(8, 10))
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', timeZone: 'Europe/Prague' })
}

function eventsForDay(events: UnifiedEvent[], iso: string): UnifiedEvent[] {
  return events.filter(ev => ev.day === iso)
}

// ─── Event detail modal ───────────────────────────────────────────────────────

function EventDetailModal({
  event,
  onClose,
  onDeleted,
}: {
  event: UnifiedEvent
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const style = getEventStyle(event)
  const isManualEvent = event.kind === 'manual' || event.kind === 'block'
  const lead = event.kind === 'call' ? event.meta.lead : undefined
  // Ručně zapsaná událost má kontakt zrcadlený v Hovorech, ne `lead` z mřížky
  // (ten kalendář pro spárované řádky záměrně nekreslí, R-010). Bez tohohle
  // řádku šlo z detailu volat jen u plánovaných hovorů.
  const contact = lead === undefined ? event.meta.contact : undefined

  async function handleDelete() {
    if (!confirm('Smazat tuto událost?')) return
    setDeleting(true)
    try {
      await deleteCalendarEvent(event.id)
      onDeleted()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AnimatePresence>
      <m.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <m.div
          key="card"
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="w-full max-w-sm overflow-hidden rounded-box bg-surface shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Coloured header strip */}
          <div className="h-1.5" style={style.dot} />

          <div className="p-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold" style={style.pill}>
                  {event.kind === 'consultation' && event.channel && (
                    <ChannelIcon channel={event.channel} />
                  )}
                  {event.kind === 'deadline' && <Flag size={10} strokeWidth={1.5} />}
                  {event.kind === 'block' && <Lock size={10} strokeWidth={1.5} />}
                  <span>{event.sublabel}</span>
                </div>
                <h3 className="font-semibold text-ink text-base leading-tight">{event.label}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-chip text-quiet transition-colors hover:bg-navy-50"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Date / time */}
              <div className="flex items-start gap-2.5">
                <Clock size={14} strokeWidth={1.5} className="text-quiet mt-0.5 shrink-0" />
                <div>
                  <p className="text-ink font-medium">
                    {event.allDay
                      ? formatShortDate(event.startsAt)
                      : `${formatShortDate(event.startsAt)}, ${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`
                    }
                  </p>
                </div>
              </div>

              {/* Kontakt u ručně zapsané události (AD10) */}
              {contact && (
                <div className="space-y-2.5 rounded-chip border border-navy-100 bg-navy-50/60 p-3">
                  {contact.name !== null && contact.name !== '' && (
                    <div className="flex items-center gap-2.5">
                      <Building2 size={14} strokeWidth={1.5} className="shrink-0 text-quiet" />
                      <span className="text-ink">{contact.name}</span>
                    </div>
                  )}
                  <ContactActions
                    phone={contact.phone}
                    email={contact.email}
                    context={{ at: event.startsAt, projectName: event.label }}
                  />
                </div>
              )}

              {/* Kontakt z Hovorů */}
              {lead && (
                <div className="space-y-2.5 rounded-chip border border-navy-100 bg-navy-50/60 p-3">
                  {lead.contactName && (
                    <div className="flex items-center gap-2.5">
                      <Building2 size={14} strokeWidth={1.5} className="text-quiet shrink-0" />
                      <span className="text-ink">{lead.companyName}</span>
                    </div>
                  )}
                  {!lead.contactName && lead.companyName && (
                    <div className="flex items-center gap-2.5">
                      <User size={14} strokeWidth={1.5} className="text-quiet shrink-0" />
                      <span className="text-quiet">Kontaktní osoba není vyplněná</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Badge variant={toneVariant(LEAD_STATUS_TONE[lead.status])}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                    {lead.estimatedValue != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-quiet">
                        <Coins size={12} strokeWidth={1.5} />
                        {lead.estimatedValue.toLocaleString('cs-CZ')} Kč
                      </span>
                    )}
                  </div>

                  {/* Volat, SMS, e-mail, WhatsApp i šablony z jednoho místa (AD10). */}
                  <ContactActions
                    phone={lead.phone}
                    email={lead.email}
                    context={{ at: event.startsAt }}
                    emptyHint="Kontakt nemá vyplněný telefon ani e-mail."
                  />

                  {lead.notes && (
                    <div>
                      <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">Poznámky ke kontaktu</p>
                      <p className="text-ink leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  )}

                </div>
              )}

              {/* Client wish */}
              {event.meta.clientWish && (
                <div>
                  <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">Přání klienta</p>
                  <p className="text-ink leading-relaxed whitespace-pre-wrap">{event.meta.clientWish}</p>
                </div>
              )}

              {/* Client email */}
              {event.meta.clientEmail && (
                <div>
                  <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">E-mail klienta</p>
                  <a
                    href={mailtoHref(event.meta.clientEmail) ?? `mailto:${event.meta.clientEmail}`}
                    className="text-navy-700 hover:underline"
                  >
                    {event.meta.clientEmail}
                  </a>
                </div>
              )}

              {/* Description */}
              {event.meta.description && (
                <div>
                  <p className="mb-1 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">
                    {lead ? 'Co je v plánu' : 'Poznámka'}
                  </p>
                  <p className="text-ink leading-relaxed whitespace-pre-wrap">{event.meta.description}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-5">
              {event.meta.meetingLink && event.meta.meetingLink !== '#' && (
                <a
                  href={event.meta.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-navy-700 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Připojit se
                </a>
              )}

              {event.meta.projectId && event.kind === 'consultation' && (
                <a
                  href={`/dashboard/${event.meta.projectId}`}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-input text-sm font-semibold text-ink transition-colors hover:bg-navy-50"
                >
                  Detail zakázky
                </a>
              )}

              {event.kind === 'call' && (
                <a
                  href={lead ? `/dashboard/calls?lead=${lead.id}` : '/dashboard/calls'}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-input text-sm font-semibold text-ink transition-colors hover:bg-navy-50"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Otevřít hovory
                </a>
              )}

              {isManualEvent && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-danger/30 text-danger transition-colors hover:bg-danger/5 disabled:opacity-50"
                  aria-label="Smazat událost"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

const MAX_PILLS_PER_DAY = 3

function MonthView({
  events,
  year,
  month,
  todayIso,
  onSelectEvent,
  onSelectDay,
}: {
  events: UnifiedEvent[]
  year: number
  month: number
  todayIso: string
  onSelectEvent: (ev: UnifiedEvent) => void
  onSelectDay: (iso: string) => void
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const startOffset = getMonthStartOffset(year, month)
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1 border-b border-navy-100 pb-2">
        {WEEKDAYS_SHORT_CZ.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-quiet uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={i} className="min-h-[60px] bg-navy-50/40 sm:min-h-[90px]" />
          }

          const iso = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const isToday = iso === todayIso
          const isWeekend = toMondayFirst(isoWeekday(iso)) >= 5
          const dayEvents = eventsForDay(events, iso)
          const visible = dayEvents.slice(0, MAX_PILLS_PER_DAY)
          const overflow = dayEvents.length - MAX_PILLS_PER_DAY

          return (
            <div
              key={i}
              className={cn(
                'group flex min-h-[60px] cursor-pointer flex-col bg-surface p-1 transition-colors hover:bg-navy-50/40 sm:min-h-[90px] sm:p-1.5',
                isWeekend && 'bg-navy-50/30',
              )}
              onClick={() => onSelectDay(iso)}
            >
              {/* Day number */}
              <span className={cn(
                'text-xs font-semibold self-end w-6 h-6 flex items-center justify-center rounded-full mb-1 transition-colors',
                isToday
                  ? 'bg-navy-700 text-white'
                  : 'text-ink group-hover:text-navy-800',
                isWeekend && !isToday && 'text-navy-500',
              )}>
                {dayNum}
              </span>

              {/* Event pills */}
              <div className="flex flex-col gap-0.5 flex-1">
                {visible.map(ev => {
                  const style = getEventStyle(ev)
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={e => { e.stopPropagation(); onSelectEvent(ev) }}
                      className={cn(
                        'flex w-full items-center gap-1 truncate rounded-tiny border px-1 py-0.5 text-left text-[10px] font-semibold',
                        'transition-opacity hover:opacity-80',
                      )}
                      style={style.pill}
                      title={ev.label}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={style.dot} />
                      <span className="truncate">
                        {!ev.allDay && `${ev.startsAt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })} `}
                        {ev.label}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <span className="px-1 text-[10px] font-medium text-quiet">+{overflow} dalších</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week view ────────────────────────────────────────────────────────────────

const HOUR_PX = 52
const DAY_START = 8
const DAY_END = 22
const MIN_BLOCK_PX = 18

/**
 * Svislá pozice a výška bloku v mřížce dne, v minutách (AD08).
 *
 * Dřív se počítala z `getHours()`, takže schůzka 10:15–12:00 se nakreslila
 * od 10:00 a popisek vedle ní říkal 10:15. Událost začínající před
 * `DAY_START` navíc úplně zmizela — dnes se přilepí na horní hranu a je
 * poznat podle zkrácené výšky.
 */
function blockGeometry(ev: UnifiedEvent) {
  const gridStart = DAY_START * 60
  const gridEnd = (DAY_END + 1) * 60
  const from = Math.max(ev.startMin, gridStart)
  const to = Math.min(Math.max(ev.endMin, ev.startMin + 15), gridEnd)
  const topPx = ((from - gridStart) / 60) * HOUR_PX
  const heightPx = Math.max(MIN_BLOCK_PX, ((to - from) / 60) * HOUR_PX - 2)
  return { topPx, heightPx, clippedTop: ev.startMin < gridStart }
}

/** Padá aspoň část události do zobrazené části dne? */
function isInGrid(ev: UnifiedEvent): boolean {
  return !ev.allDay && ev.endMin > DAY_START * 60 && ev.startMin < (DAY_END + 1) * 60
}

function WeekView({
  events,
  weekStart,
  todayIso,
  onSelectEvent,
  onClickSlot,
}: {
  events: UnifiedEvent[]
  weekStart: string
  todayIso: string
  onSelectEvent: (ev: UnifiedEvent) => void
  onClickSlot: (date: string, hour: number) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addIsoDays(weekStart, i))
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START)

  // All-day events (deadlines)
  const allDayForWeek = events.filter(ev => ev.allDay && days.includes(ev.day))

  return (
    <div className="flex flex-col overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Day headers */}
        <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-navy-100 mb-0">
          <div />
          {days.map((d, i) => {
            const isToday = d === todayIso
            return (
              <div key={i} className={cn(
                'text-center py-2 border-l border-navy-100',
                isToday && 'bg-navy-50',
              )}>
                <p className="text-[10px] font-semibold text-quiet uppercase">
                  {WEEKDAYS_SHORT_CZ[toMondayFirst(isoWeekday(d))]}
                </p>
                <p className={cn(
                  'text-sm font-semibold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full',
                  isToday ? 'bg-navy-700 text-white' : 'text-ink',
                )}>
                  {dayNumberOf(d)}
                </p>
              </div>
            )
          })}
        </div>

        {/* All-day row */}
        {allDayForWeek.length > 0 && (
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-navy-100">
            <div className="text-[9px] text-quiet uppercase font-semibold flex items-center justify-end pr-2 py-1">
              Celý den
            </div>
            {days.map((d, i) => {
              const dayAllDay = allDayForWeek.filter(ev => ev.day === d)
              return (
                <div key={i} className="border-l border-navy-100 py-1 px-0.5 min-h-[28px]">
                  {dayAllDay.map(ev => {
                    const style = getEventStyle(ev)
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        className="block w-full truncate rounded-tiny border px-1 py-0.5 text-[10px] font-semibold"
                        style={style.pill}
                      >
                        {ev.label}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Time grid */}
        <div className="overflow-y-auto" style={{ maxHeight: '520px' }}>
          <div className="grid grid-cols-[48px_repeat(7,1fr)]">
            {/* Hour labels */}
            <div>
              {hours.map(h => (
                <div key={h} style={{ height: `${HOUR_PX}px` }}
                  className="flex items-start justify-end pr-2 pt-0.5">
                  <span className="font-num text-[10px] font-medium text-quiet">{h}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((d, di) => {
              const isToday = d === todayIso
              const timedEvents = events.filter(ev => ev.day === d && isInGrid(ev))
              const dateStr = d

              return (
                <div
                  key={di}
                  className={cn('border-l border-navy-100 relative', isToday && 'bg-navy-50/30')}
                  style={{ height: `${HOUR_PX * hours.length}px` }}
                >
                  {/* Hour grid lines + click zones */}
                  {hours.map((h, hi) => (
                    <div
                      key={h}
                      className="absolute w-full cursor-pointer border-t border-navy-50 transition-colors hover:bg-navy-50/60"
                      style={{ top: `${hi * HOUR_PX}px`, height: `${HOUR_PX}px` }}
                      onClick={() => onClickSlot(dateStr, h)}
                      title={`Přidat ${h}:00`}
                    />
                  ))}

                  {/* Events */}
                  {timedEvents.map(ev => {
                    const style = getEventStyle(ev)
                    const { topPx, heightPx, clippedTop } = blockGeometry(ev)

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelectEvent(ev) }}
                        className={cn(
                          'absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-tiny border text-left',
                          'transition-all hover:brightness-95',
                          clippedTop && 'rounded-t-none border-t-2 border-t-current',
                        )}
                        style={{ ...style.pill, top: `${topPx + 1}px`, height: `${heightPx}px` }}
                      >
                        <div className="px-1.5 py-1 flex flex-col h-full">
                          <span className="text-[10px] font-bold truncate leading-tight">{ev.label}</span>
                          {heightPx > 30 && (
                            <span className="text-[9px] opacity-70 truncate">
                              {formatTime(ev.startsAt)}
                              {ev.channel && ` · ${CHANNEL_LABELS[ev.channel]}`}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({
  events,
  date,
  onSelectEvent,
  onClickSlot,
}: {
  events: UnifiedEvent[]
  /** 'YYYY-MM-DD' pražského dne */
  date: string
  onSelectEvent: (ev: UnifiedEvent) => void
  onClickSlot: (dateStr: string, hour: number) => void
}) {
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START)
  const dayEvents = events.filter(ev => ev.day === date)
  const timedEvents = dayEvents.filter(isInGrid)
  const allDayEvents = dayEvents.filter(ev => ev.allDay)

  const dateStr = date

  return (
    <div className="flex gap-5">
      {/* Time grid */}
      <div className="flex-1">
        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            {allDayEvents.map(ev => {
              const style = getEventStyle(ev)
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className="w-full rounded-chip border px-3 py-2 text-left text-xs font-semibold"
                  style={style.pill}
                >
                  <span className="flex items-center gap-1.5">
                    <Flag size={10} strokeWidth={1.5} />
                    {ev.label} — {ev.sublabel}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Hour grid */}
        <div className="overflow-y-auto rounded-chip border border-navy-100" style={{ maxHeight: '560px' }}>
          <div className="relative" style={{ height: `${HOUR_PX * hours.length}px` }}>
            {/* Background grid lines */}
            {hours.map((h, hi) => (
              <div
                key={h}
                className="absolute flex w-full cursor-pointer items-start border-t border-navy-50 transition-colors hover:bg-navy-50/40"
                style={{ top: `${hi * HOUR_PX}px`, height: `${HOUR_PX}px` }}
                onClick={() => onClickSlot(dateStr, h)}
              >
                <span className="w-12 shrink-0 pr-3 pt-0.5 text-right font-num text-[10px] font-medium text-quiet">
                  {h}:00
                </span>
              </div>
            ))}

            {/* Events */}
            {timedEvents.map(ev => {
              const style = getEventStyle(ev)
              const { topPx, heightPx, clippedTop } = blockGeometry(ev)

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={e => { e.stopPropagation(); onSelectEvent(ev) }}
                  className={cn(
                    'absolute left-14 right-2 z-10 rounded-tiny border text-left',
                    'transition-all hover:brightness-95',
                    clippedTop && 'rounded-t-none border-t-2 border-t-current',
                  )}
                  style={{ ...style.pill, top: `${topPx + 1}px`, height: `${heightPx}px` }}
                >
                  <div className="px-3 py-1.5 flex flex-col h-full justify-center">
                    <span className="text-xs font-bold leading-tight">{ev.label}</span>
                    <span className="text-[11px] opacity-70 mt-0.5">
                      {formatTime(ev.startsAt)} – {formatTime(ev.endsAt)}
                      {ev.channel && ` · ${CHANNEL_LABELS[ev.channel]}`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day event list sidebar */}
      {timedEvents.length > 0 && (
        <div className="hidden sm:block w-52 shrink-0">
          <p className="mb-3 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">
            {timedEvents.length} {timedEvents.length === 1 ? 'událost' : 'události'}
          </p>
          <div className="flex flex-col gap-2">
            {timedEvents.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map(ev => {
              const style = getEventStyle(ev)
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className="flex w-full items-start gap-2.5 rounded-chip border px-3 py-2.5 text-left transition-all hover:brightness-95"
                  style={style.pill}
                >
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={style.dot} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{ev.label}</p>
                    <p className="text-[11px] opacity-70">{formatTime(ev.startsAt)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-quiet">
      {(Object.keys(CHANNEL_TONE) as ConsultationChannel[]).map((ch) => (
        <div key={ch} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: staffAccent(null, CHANNEL_TONE[ch]) }} />
          <span>{CHANNEL_LABELS[ch]}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: staffAccent(null, KIND_TONE.deadline ?? 0) }} />
        <span>Deadline</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: staffAccent(null, KIND_TONE.manual ?? 0) }} />
        <span>Vlastní událost</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-navy-300" />
        <span>Blokovaný čas</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: staffAccent(null, KIND_TONE.call ?? 0) }} />
        <span>Plánovaná akce (Hovory)</span>
      </div>
    </div>
  )
}

// ─── Main SmartCalendar ───────────────────────────────────────────────────────

type ViewMode = CalendarView

/** Co šipka posune — čte to `aria-label`, aby čtečka neříkala jen „tlačítko". */
const VIEW_STEP_LABELS: Record<ViewMode, string> = { month: 'měsíc', week: 'týden', day: 'den' }

export function SmartCalendar({
  initial,
  initialRange,
  today,
}: {
  initial: CalendarData
  /** Okno, které přišlo se stránkou (AD08). */
  initialRange: DayRange
  /** Dnešní pražský den, 'YYYY-MM-DD' — spočítaný na serveru. */
  today: string
}) {
  const router = useRouter()

  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(() => startOfMonthIso(today))
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null)
  const [createModal, setCreateModal] = useState<{ open: boolean; date?: string; hour?: number }>({ open: false })

  // Data kalendáře žijí tady, ne v propech: do prohlížeče přijde jen okno
  // kolem dneška a další měsíce se dotahují přes `loadCalendarMonth` (AD08).
  const [data, setData] = useState<CalendarData>(initial)
  const [loaded, setLoaded] = useState<DayRange[]>([initialRange])
  const [isLoading, startLoading] = useTransition()

  const unified = useMemo(() => buildUnified(data), [data])

  /**
   * Vymění vše, co padá do `range`, za nově stažené. Jednou funkcí se tak
   * řeší „dotáhni další měsíc" i „přečti znovu, něco se změnilo" — a není
   * potřeba nic dedupovat ani mazat podle id.
   */
  const replaceRange = useCallback((range: DayRange, incoming: CalendarData) => {
    const outside = (day: string) => day < range.from || day > range.to
    setData((prev) => ({
      consultations: [...prev.consultations.filter((c) => outside(pragueDayOf(c.scheduled_at))), ...incoming.consultations],
      deadlines: [...prev.deadlines.filter((d) => outside(d.deadline)), ...incoming.deadlines],
      events: [...prev.events.filter((e) => outside(pragueDayOf(e.starts_at))), ...incoming.events],
      leads: [...prev.leads.filter((l) => outside(pragueDayOf(l.action_at))), ...incoming.leads],
    }))
    setLoaded((prev) => mergeRanges([...prev, range]))
  }, [])

  /** Stáhne měsíc kolem kotvy, pokud zobrazení není celé v načteném okně. */
  const ensureLoaded = useCallback((nextView: ViewMode, nextAnchor: string, force = false) => {
    if (!force && covers(loaded, viewRange(nextView, nextAnchor))) return
    startLoading(async () => {
      const { range, data: fresh } = await loadCalendarMonth(nextAnchor)
      replaceRange(range, fresh)
    })
  }, [loaded, replaceRange])

  function goTo(nextView: ViewMode, nextAnchor: string) {
    setView(nextView)
    setAnchor(nextAnchor)
    ensureLoaded(nextView, nextAnchor)
  }

  // Navigation helpers
  function navigate(delta: number) {
    if (view === 'month') return goTo(view, neighbourAnchor(anchor, delta))
    if (view === 'week') return goTo(view, addIsoDays(anchor, delta * 7))
    return goTo(view, addIsoDays(anchor, delta))
  }

  function goToToday() {
    goTo(view, view === 'month' ? startOfMonthIso(today) : today)
  }

  function switchView(v: ViewMode) {
    // Měsíc se kotví na první den, aby krok vpřed nepřeskakoval kvůli
    // různě dlouhým měsícům.
    if (v === 'month') return goTo(v, startOfMonthIso(anchor))
    // Z měsíce na týden nebo den se jde na **dnešek**, pokud je v zobrazeném
    // měsíci. Kotva měsíce je jeho první den, takže bez tohohle by Den vždy
    // otevřel prvního — i když se člověk dívá na dnešek (ověřeno v prohlížeči).
    const sameMonth = anchor.slice(0, 7) === today.slice(0, 7)
    goTo(v, view === 'month' && sameMonth ? today : anchor)
  }

  // Header title
  function headerTitle() {
    const [y, mo] = anchor.split('-').map(Number)
    if (view === 'month') return `${MONTHS_CZ[mo - 1]} ${y}`
    if (view === 'week') {
      const ws = startOfWeekIso(anchor)
      const we = addIsoDays(ws, 6)
      const [wsY, wsM] = ws.split('-').map(Number)
      const [weY, weM] = we.split('-').map(Number)
      if (wsM === weM && wsY === weY) {
        return `${dayNumberOf(ws)}. – ${dayNumberOf(we)}. ${MONTHS_CZ[wsM - 1]} ${wsY}`
      }
      return `${dayNumberOf(ws)}. ${MONTHS_CZ[wsM - 1]} – ${dayNumberOf(we)}. ${MONTHS_CZ[weM - 1]} ${weY}`
    }
    const [dy, dm, dd] = anchor.split('-').map(Number)
    return new Date(Date.UTC(dy, dm - 1, dd)).toLocaleDateString('cs-CZ', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
  }

  const handleSelectDay = useCallback((iso: string) => {
    setView('day')
    setAnchor(iso)
  }, [])

  const handleClickSlot = useCallback((dateStr: string, hour: number) => {
    setCreateModal({ open: true, date: dateStr, hour })
  }, [])

  /** Po změně v kalendáři se přečte znovu jen zobrazený měsíc. */
  const reloadCurrent = useCallback(() => {
    startLoading(async () => {
      const { range, data: fresh } = await loadCalendarMonth(anchor)
      replaceRange(range, fresh)
    })
    // Odznaky v menu a Hovory se počítají na serveru.
    router.refresh()
  }, [anchor, replaceRange, router])

  const handleCreateClose = useCallback((saved: boolean) => {
    setCreateModal({ open: false })
    if (saved) reloadCurrent()
  }, [reloadCurrent])

  return (
    <div>
      {/* Toolbar */}
      <Toolbar className="mb-5">
        <div className="flex items-center gap-2">
          {/*
            Šipky měly jen ikonu, takže je čtečka četla jako „tlačítko"
            (otevřený problém z AD10). `aria-label` říká, kam vedou — měsíc,
            týden nebo den podle zobrazení.
          */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}
            aria-label={`Předchozí ${VIEW_STEP_LABELS[view]}`}
            title={`Předchozí ${VIEW_STEP_LABELS[view]}`}
          >
            <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(1)}
            aria-label={`Následující ${VIEW_STEP_LABELS[view]}`}
            title={`Následující ${VIEW_STEP_LABELS[view]}`}
          >
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            Dnes
          </Button>
          <h2 className="ml-1 text-base font-semibold text-ink">{headerTitle()}</h2>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Zobrazení: pilulky v jednom pouzdře jako v kalendáři Workspace. */}
          <div className="flex gap-1 rounded-full bg-navy-50 p-1" role="group" aria-label="Zobrazení kalendáře">
            {(['month', 'week', 'day'] as ViewMode[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                aria-pressed={view === v}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                  view === v ? 'bg-navy-700 text-white' : 'text-navy-900 hover:bg-navy-100',
                )}
              >
                {v === 'month' ? 'Měsíc' : v === 'week' ? 'Týden' : 'Den'}
              </button>
            ))}
          </div>

          {/* Jedna hlavní akce obrazovky. */}
          <Button onClick={() => setCreateModal({ open: true })}>
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            Přidat
          </Button>
        </div>
      </Toolbar>

      {/* Calendar body */}
      <div className="overflow-hidden rounded-box border border-navy-100 bg-surface">
        <div className="p-4 sm:p-5">
          <AnimatePresence mode="wait">
            <m.div
              key={`${view}-${anchor}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              // Dokud se dotahuje další měsíc, mřížka zešedne — ale zůstane
              // vidět a klikatelná, místo aby zmizela za kostlivcem.
              className={cn(isLoading && 'opacity-60 transition-opacity')}
            >
              {view === 'month' && (
                <MonthView
                  events={unified}
                  year={Number(anchor.slice(0, 4))}
                  month={Number(anchor.slice(5, 7))}
                  todayIso={today}
                  onSelectEvent={setSelectedEvent}
                  onSelectDay={handleSelectDay}
                />
              )}
              {view === 'week' && (
                <WeekView
                  events={unified}
                  weekStart={startOfWeekIso(anchor)}
                  todayIso={today}
                  onSelectEvent={setSelectedEvent}
                  onClickSlot={handleClickSlot}
                />
              )}
              {view === 'day' && (
                <DayView
                  events={unified}
                  date={anchor}
                  onSelectEvent={setSelectedEvent}
                  onClickSlot={handleClickSlot}
                />
              )}
            </m.div>
          </AnimatePresence>
        </div>

        {/* Legend footer */}
        <div className="border-t border-navy-100 px-5 py-3">
          <Legend />
        </div>
      </div>

      {/* Modals */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={reloadCurrent}
        />
      )}

      {/*
        AnimatePresence je **tady**, ne uvnitř modalu (AD08). Dřív modal
        nikdy neodmountoval, takže se `useState` inicializátory spustily jen
        při prvním načtení stránky a formulář navždy držel „dnes 10:00".
        Klik na slot v 11:00 se do něj nepropsal.
      */}
      <AnimatePresence>
        {createModal.open && (
          <AdminEventModal
            onClose={handleCreateClose}
            defaultDate={createModal.date}
            defaultHour={createModal.hour}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
