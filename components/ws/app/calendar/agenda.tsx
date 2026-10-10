import Link from 'next/link'
import type { CalEntry } from '@/lib/ws/calendar'
import { formatRelativeDay, formatTimeRange, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const KIND_CLASS: Record<CalEntry['kind'], string> = {
  visit: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

/** Telefon: místo mřížky seznam po dnech (Den a Týden). Klik otevře detail v panelu. */
export function CalendarAgenda({
  entries,
  days,
  today,
  hrefFor,
  showStaff,
  className,
}: {
  entries: CalEntry[]
  days: string[]
  today: string
  hrefFor: (e: CalEntry) => string
  showStaff: boolean
  className?: string
}) {
  const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime())
  const dayOf = (e: CalEntry) => {
    const d = pragueParts(e.start).date
    return d < days[0] ? days[0] : d
  }
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {days.map((day) => {
        const list = sorted.filter((e) => dayOf(e) === day)
        return (
          <section key={day} className="flex flex-col gap-2">
            <h2 className={cn('font-num text-xs uppercase tracking-[0.08em]', day === today ? 'text-navy-700 dark:text-navy-200' : 'text-quiet')}>
              {formatRelativeDay(day, today)}
            </h2>
            {list.length === 0 ? (
              <p className="text-sm text-quiet">Nic domluveného.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((e) => (
                  <li key={`${e.kind}-${e.id}`}>
                    <Link
                      href={hrefFor(e)}
                      scroll={false}
                      className={cn('block min-h-11 rounded-chip px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', KIND_CLASS[e.kind])}
                    >
                      <span className="font-num text-xs">
                        {e.kind === 'request' ? 'Nová poptávka · ' : ''}
                        {formatTimeRange(e.start, e.end)}
                      </span>
                      <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                      {(e.subtitle || (showStaff && e.staff_name)) && (
                        <span className="block truncate text-sm opacity-80">
                          {[e.subtitle, showStaff ? e.staff_name : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
