import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SectionLabel } from '@/components/ws/brand'
import { hourRange, layoutWeek } from '@/lib/ws/calendar-layout'
import type { CalendarEntry } from '@/lib/ws/today'
import { addDays, formatClock, formatDayShort, formatTimeRange, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const HOUR_PX = 44

const KIND_CLASS: Record<CalendarEntry['kind'], string> = {
  visit:
    'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

const KIND_LABEL: Record<CalendarEntry['kind'], string> = {
  visit: 'Termín',
  block: 'Blokace',
  request: 'Nová poptávka',
}

export type CalendarLinks = {
  entry: (e: CalendarEntry) => string | null
  week: (weekStart: string) => string
}

/**
 * Týdenní kalendář na Dnes (mockup C). Vykreslený na serveru, bez JS:
 * termíny (navy-100 s levým okrajem), blokace (navy-50) a nové poptávky
 * jako čárkované bloky. Na telefonu místo něj TodayAgenda.
 */
export function WeekCalendar({
  entries,
  weekStart,
  today,
  opening,
  links,
  selectedId,
  className,
}: {
  entries: CalendarEntry[]
  weekStart: string
  today: string
  opening: { from: number; to: number } | null
  links: CalendarLinks
  /** Poptávka nebo termín otevřený v pravém panelu — zvýrazní se (R-057). */
  selectedId?: string | null
  className?: string
}) {
  const hours = hourRange(entries, opening)
  const placed = layoutWeek(entries, weekStart, hours)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const height = (hours.to - hours.from) * HOUR_PX
  const thisWeek = days.includes(today)
  const end = days[6]
  const range = `${formatDayShort(weekStart).replace(/^\S+ /, '')}–${formatDayShort(end).replace(/^\S+ /, '')}`

  return (
    <section aria-labelledby="tyden" className={cn('min-w-0 rounded-panel border bg-surface p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="tyden" className="flex items-baseline gap-3">
          <SectionLabel>Kalendář</SectionLabel>
          <span className="font-num text-sm text-ink">{range}</span>
        </h2>
        <div className="ml-auto flex items-center gap-1">
          {!thisWeek && (
            <Link href={links.week('')} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-navy-700 hover:bg-accent dark:text-navy-200">
              Tento týden
            </Link>
          )}
          <Link
            href={links.week(addDays(weekStart, -7))}
            aria-label="Předchozí týden"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink"
          >
            <ChevronLeft aria-hidden size={20} strokeWidth={1.5} />
          </Link>
          <Link
            href={links.week(addDays(weekStart, 7))}
            aria-label="Další týden"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink"
          >
            <ChevronRight aria-hidden size={20} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))]">
        <div aria-hidden />
        {days.map((day) => (
          <div key={day} className="flex justify-center pb-2">
            <span
              className={cn(
                'inline-flex min-h-7 items-center rounded-full px-2 font-num text-[11px] uppercase tracking-[0.04em]',
                day === today ? 'bg-navy-700 text-white' : 'text-quiet',
              )}
            >
              {formatDayShort(day).replace(/\s\d+\.$/, '')}
            </span>
          </div>
        ))}

        {/* Hodiny */}
        <div className="relative" style={{ height }} aria-hidden>
          {Array.from({ length: hours.to - hours.from }, (_, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 font-num text-[10px] text-quiet" style={{ top: i * HOUR_PX }}>
              {i === 0 ? '' : `${hours.from + i}`}
            </span>
          ))}
        </div>

        {days.map((day, dayIndex) => {
          const items = placed.filter((p) => p.dayIndex === dayIndex)
          return (
            <div
              key={day}
              className={cn('relative border-l', day === today && 'bg-navy-50/60 dark:bg-navy-900/60')}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${HOUR_PX}px)`,
              }}
            >
              <ul aria-label={formatDayShort(day)} className="contents">
                {items.map((p) => {
                  const e = p.item
                  const href = links.entry(e)
                  const when = formatTimeRange(e.start, e.end)
                  const label = `${KIND_LABEL[e.kind]}: ${e.title}${e.subtitle ? `, ${e.subtitle}` : ''}, ${formatDayShort(pragueParts(e.start).date)} ${when}`
                  const short = p.height * (height / 100) < 34
                  const selected = selectedId != null && e.id === selectedId
                  const body = (
                    <>
                      <span className="block truncate font-num text-[10px] leading-tight opacity-80">{formatClock(e.start)}</span>
                      {!short && <span className="block truncate text-[12px] font-semibold leading-tight">{e.title}</span>}
                    </>
                  )
                  const cls = cn(
                    'absolute block overflow-hidden rounded-tiny px-1.5 py-1 transition-[filter] duration-200',
                    KIND_CLASS[e.kind],
                    href && 'hover:brightness-[0.97] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'z-10 ring-2 ring-navy-700 ring-offset-1 ring-offset-surface dark:ring-navy-200',
                  )
                  const style = {
                    top: `${p.top}%`,
                    height: `max(${p.height}%, 18px)`,
                    left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / p.lanes}% - 4px)`,
                  }
                  return (
                    <li key={`${e.kind}-${e.id}-${dayIndex}`}>
                      {href ? (
                        <Link href={href} scroll={false} aria-label={label} aria-current={selected ? 'true' : undefined} title={label} className={cls} style={style}>
                          {body}
                        </Link>
                      ) : (
                        <span aria-label={label} title={label} className={cls} style={style}>
                          {body}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
