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
import { LEAD_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { cn, whatsappHref } from '@/lib/utils'
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
  }
}

// ─── Colour system ────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<ConsultationChannel, { pill: string; dot: string; icon: string }> = {
  whatsapp: { pill: 'bg-green-100 text-green-800 border-green-200',  dot: 'bg-green-500',  icon: 'text-green-600' },
  teams:    { pill: 'bg-blue-100 text-blue-800 border-blue-200',     dot: 'bg-blue-500',   icon: 'text-blue-600' },
  meet:     { pill: 'bg-red-100 text-red-800 border-red-200',        dot: 'bg-red-500',    icon: 'text-red-600' },
  phone:    { pill: 'bg-slate-100 text-slate-700 border-slate-200',  dot: 'bg-slate-400',  icon: 'text-slate-500' },
  other:    { pill: 'bg-gray-100 text-gray-700 border-gray-200',     dot: 'bg-gray-400',   icon: 'text-gray-500' },
}

const KIND_COLORS: Partial<Record<EventKind, { pill: string; dot: string }>> = {
  deadline: { pill: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
  manual:   { pill: 'bg-amber-100 text-amber-800 border-amber-200',    dot: 'bg-amber-500' },
  block:    { pill: 'bg-slate-100 text-slate-600 border-slate-300',    dot: 'bg-slate-400' },
  call:     { pill: 'bg-cyan-100 text-cyan-800 border-cyan-200',       dot: 'bg-cyan-500' },
}

function getEventStyle(ev: UnifiedEvent) {
  if (ev.kind === 'consultation' && ev.channel) return CHANNEL_COLORS[ev.channel]
  return KIND_COLORS[ev.kind] ?? { pill: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' }
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
      meta: { description: e.description },
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
  const waHref = lead?.phone ? whatsappHref(lead.phone) : null

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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Coloured header strip */}
          <div className={cn('h-1.5', style.dot)} />

          <div className="p-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border mb-2', style.pill)}>
                  {event.kind === 'consultation' && event.channel && (
                    <ChannelIcon channel={event.channel} />
                  )}
                  {event.kind === 'deadline' && <Flag size={10} strokeWidth={1.5} />}
                  {event.kind === 'block' && <Lock size={10} strokeWidth={1.5} />}
                  <span>{event.sublabel}</span>
                </div>
                <h3 className="font-semibold text-foreground text-base leading-tight">{event.label}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Date / time */}
              <div className="flex items-start gap-2.5">
                <Clock size={14} strokeWidth={1.5} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-foreground font-medium">
                    {event.allDay
                      ? formatShortDate(event.startsAt)
                      : `${formatShortDate(event.startsAt)}, ${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`
                    }
                  </p>
                </div>
              </div>

              {/* Kontakt z Hovorů */}
              {lead && (
                <div className="space-y-2.5 rounded-xl bg-slate-50 border border-border p-3">
                  {lead.contactName && (
                    <div className="flex items-center gap-2.5">
                      <Building2 size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                      <span className="text-foreground">{lead.companyName}</span>
                    </div>
                  )}
                  {!lead.contactName && lead.companyName && (
                    <div className="flex items-center gap-2.5">
                      <User size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Kontaktní osoba není vyplněná</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Badge variant={toneVariant(LEAD_STATUS_TONE[lead.status])}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                    {lead.estimatedValue != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Coins size={12} strokeWidth={1.5} />
                        {lead.estimatedValue.toLocaleString('cs-CZ')} Kč
                      </span>
                    )}
                  </div>

                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2.5 text-navy-700 hover:underline">
                      <Phone size={14} strokeWidth={1.5} className="shrink-0" />
                      {lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-2.5 text-navy-700 hover:underline break-all">
                      <Mail size={14} strokeWidth={1.5} className="shrink-0" />
                      {lead.email}
                    </a>
                  )}
                  {!lead.phone && !lead.email && (
                    <p className="text-xs text-muted-foreground">Kontakt nemá vyplněný telefon ani e-mail.</p>
                  )}

                  {lead.notes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Poznámky ke kontaktu</p>
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  )}

                  {/* Rychlé akce */}
                  {(lead.phone || lead.email) && (
                    <div className="flex gap-1.5 pt-0.5">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground bg-white border border-border py-2 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Phone size={12} strokeWidth={1.5} />
                          Volat
                        </a>
                      )}
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground bg-white border border-border py-2 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Mail size={12} strokeWidth={1.5} />
                          Napsat
                        </a>
                      )}
                      {waHref && (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-green-700 bg-white border border-green-200 py-2 rounded-lg hover:bg-green-50 transition-colors"
                        >
                          <MessageCircle size={12} strokeWidth={1.5} />
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Client wish */}
              {event.meta.clientWish && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Přání klienta</p>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{event.meta.clientWish}</p>
                </div>
              )}

              {/* Client email */}
              {event.meta.clientEmail && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">E-mail klienta</p>
                  <a href={`mailto:${event.meta.clientEmail}`} className="text-navy-700 hover:underline">
                    {event.meta.clientEmail}
                  </a>
                </div>
              )}

              {/* Description */}
              {event.meta.description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {lead ? 'Co je v plánu' : 'Poznámka'}
                  </p>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{event.meta.description}</p>
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
                  className="flex-1 flex items-center justify-center gap-1.5 brand-gradient text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Připojit se
                </a>
              )}

              {event.meta.projectId && event.kind === 'consultation' && (
                <a
                  href={`/dashboard/${event.meta.projectId}`}
                  className="flex-1 flex items-center justify-center text-sm font-semibold text-navy-800 border border-navy-200 py-2.5 rounded-xl hover:bg-navy-50 transition-colors"
                >
                  Detail zakázky
                </a>
              )}

              {event.kind === 'call' && (
                <a
                  href={lead ? `/dashboard/calls?lead=${lead.id}` : '/dashboard/calls'}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-navy-800 border border-navy-200 py-2.5 rounded-xl hover:bg-navy-50 transition-colors"
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
                  className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
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
      <div className="grid grid-cols-7 mb-1 border-b border-border pb-2">
        {WEEKDAYS_SHORT_CZ.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={i} className="bg-gray-50/50 min-h-[60px] sm:min-h-[90px]" />
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
                'bg-white min-h-[60px] sm:min-h-[90px] p-1 sm:p-1.5 flex flex-col cursor-pointer hover:bg-navy-50/40 transition-colors group',
                isWeekend && 'bg-gray-50/30',
              )}
              onClick={() => onSelectDay(iso)}
            >
              {/* Day number */}
              <span className={cn(
                'text-xs font-semibold self-end w-6 h-6 flex items-center justify-center rounded-full mb-1 transition-colors',
                isToday
                  ? 'brand-gradient text-white shadow-sm'
                  : 'text-foreground group-hover:text-navy-800',
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
                        'flex items-center gap-1 text-left rounded px-1 py-0.5 text-[10px] font-semibold',
                        'border truncate w-full hover:opacity-80 transition-opacity',
                        style.pill,
                      )}
                      title={ev.label}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
                      <span className="truncate">
                        {!ev.allDay && `${ev.startsAt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })} `}
                        {ev.label}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium px-1">+{overflow} dalších</span>
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
        <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-border mb-0">
          <div />
          {days.map((d, i) => {
            const isToday = d === todayIso
            return (
              <div key={i} className={cn(
                'text-center py-2 border-l border-border',
                isToday && 'bg-navy-50',
              )}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {WEEKDAYS_SHORT_CZ[toMondayFirst(isoWeekday(d))]}
                </p>
                <p className={cn(
                  'text-sm font-semibold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full',
                  isToday ? 'brand-gradient text-white' : 'text-foreground',
                )}>
                  {dayNumberOf(d)}
                </p>
              </div>
            )
          })}
        </div>

        {/* All-day row */}
        {allDayForWeek.length > 0 && (
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-border">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold flex items-center justify-end pr-2 py-1">
              Celý den
            </div>
            {days.map((d, i) => {
              const dayAllDay = allDayForWeek.filter(ev => ev.day === d)
              return (
                <div key={i} className="border-l border-border py-1 px-0.5 min-h-[28px]">
                  {dayAllDay.map(ev => {
                    const style = getEventStyle(ev)
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        className={cn('w-full text-[10px] font-semibold px-1 py-0.5 rounded border truncate block', style.pill)}
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
                  <span className="text-[10px] text-muted-foreground font-medium">{h}:00</span>
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
                  className={cn('border-l border-border relative', isToday && 'bg-navy-50/30')}
                  style={{ height: `${HOUR_PX * hours.length}px` }}
                >
                  {/* Hour grid lines + click zones */}
                  {hours.map((h, hi) => (
                    <div
                      key={h}
                      className="absolute w-full border-t border-gray-100 hover:bg-navy-50/60 cursor-pointer transition-colors"
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
                          'absolute left-0.5 right-0.5 rounded border text-left overflow-hidden z-10',
                          'hover:brightness-95 transition-all shadow-sm',
                          clippedTop && 'rounded-t-none border-t-2 border-t-current',
                          style.pill,
                        )}
                        style={{ top: `${topPx + 1}px`, height: `${heightPx}px` }}
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
                  className={cn('w-full text-left text-xs font-semibold px-3 py-2 rounded-lg border', style.pill)}
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
        <div className="overflow-y-auto rounded-xl border border-border" style={{ maxHeight: '560px' }}>
          <div className="relative" style={{ height: `${HOUR_PX * hours.length}px` }}>
            {/* Background grid lines */}
            {hours.map((h, hi) => (
              <div
                key={h}
                className="absolute w-full flex items-start border-t border-gray-100 hover:bg-navy-50/40 cursor-pointer transition-colors"
                style={{ top: `${hi * HOUR_PX}px`, height: `${HOUR_PX}px` }}
                onClick={() => onClickSlot(dateStr, h)}
              >
                <span className="text-[10px] text-muted-foreground font-medium w-12 text-right pr-3 pt-0.5 shrink-0">
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
                    'absolute left-14 right-2 rounded-lg border text-left z-10 shadow-sm',
                    'hover:brightness-95 transition-all',
                    clippedTop && 'rounded-t-none border-t-2 border-t-current',
                    style.pill,
                  )}
                  style={{ top: `${topPx + 1}px`, height: `${heightPx}px` }}
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
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
                  className={cn(
                    'w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl border',
                    'hover:brightness-95 transition-all',
                    style.pill,
                  )}
                >
                  <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', style.dot)} />
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {(Object.entries(CHANNEL_COLORS) as [ConsultationChannel, typeof CHANNEL_COLORS[ConsultationChannel]][]).map(([ch, c]) => (
        <div key={ch} className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', c.dot)} />
          <span>{CHANNEL_LABELS[ch]}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-purple-500" />
        <span>Deadline</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span>Vlastní událost</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <span>Blokovaný čas</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-cyan-500" />
        <span>Plánovaná akce (Hovory)</span>
      </div>
    </div>
  )
}

// ─── Main SmartCalendar ───────────────────────────────────────────────────────

type ViewMode = CalendarView

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
    goTo(v, v === 'month' ? startOfMonthIso(anchor) : anchor)
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-navy-50 hover:text-navy-800 hover:border-navy-200 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-navy-50 hover:text-navy-800 hover:border-navy-200 transition-colors"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="text-xs font-semibold text-navy-800 border border-navy-200 px-3 py-1.5 rounded-lg hover:bg-navy-50 transition-colors"
          >
            Dnes
          </button>
          <h2 className="text-base font-semibold text-foreground ml-1">{headerTitle()}</h2>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* View switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['month', 'week', 'day'] as ViewMode[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-md transition-all',
                  view === v
                    ? 'bg-white text-navy-800 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'month' ? 'Měsíc' : v === 'week' ? 'Týden' : 'Den'}
              </button>
            ))}
          </div>

          {/* Add event */}
          <button
            type="button"
            onClick={() => setCreateModal({ open: true })}
            className="flex items-center gap-1.5 brand-gradient text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={13} strokeWidth={1.5} />
            Přidat
          </button>
        </div>
      </div>

      {/* Calendar body */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
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
        <div className="border-t border-border px-5 py-3">
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
