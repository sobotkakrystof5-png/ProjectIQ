import Link from 'next/link'
import { EmptyState, SectionLabel } from '@/components/ws/brand'
import type { CalendarEntry } from '@/lib/ws/today'
import { formatRelativeDay, formatTimeRange, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const KIND_CLASS: Record<CalendarEntry['kind'], string> = {
  visit: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

/**
 * Telefon (mockup D): místo týdenní mřížky seznam termínů od dneška do
 * konce týdne, po dnech. Klik otevře detail v panelu přes celou obrazovku.
 */
export function TodayAgenda({
  entries,
  today,
  hrefFor,
  className,
}: {
  entries: CalendarEntry[]
  today: string
  hrefFor: (e: CalendarEntry) => string | null
  className?: string
}) {
  const upcoming = entries
    .filter((e) => pragueParts(e.end).date >= today)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  // Termín, který začal včera a ještě běží, patří pod dnešek.
  const dayOf = (e: CalendarEntry) => {
    const d = pragueParts(e.start).date
    return d < today ? today : d
  }
  const uniqueDays = Array.from(new Set(upcoming.map(dayOf)))

  return (
    <section aria-labelledby="agenda" className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 id="agenda">
        <SectionLabel>Kalendář</SectionLabel>
      </h2>
      {upcoming.length === 0 ? (
        <EmptyState
          size="compact"
          title="Do konce týdne nic domluveného"
          description="Nové poptávky s termínem se ukážou tady."
        />
      ) : (
        uniqueDays.map((day) => (
          <div key={day} className="flex flex-col gap-2">
            <p className="font-num text-xs uppercase tracking-[0.08em] text-quiet">{formatRelativeDay(day, today)}</p>
            <ul className="flex flex-col gap-2">
              {upcoming
                .filter((e) => dayOf(e) === day)
                .map((e) => {
                  const href = hrefFor(e)
                  const body = (
                    <>
                      <span className="font-num text-xs">{formatTimeRange(e.start, e.end)}</span>
                      <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                      {e.subtitle && <span className="block truncate text-sm opacity-80">{e.subtitle}</span>}
                    </>
                  )
                  const cls = cn('block min-h-11 rounded-chip px-3 py-2.5', KIND_CLASS[e.kind])
                  return (
                    <li key={`${e.kind}-${e.id}`}>
                      {href ? (
                        <Link href={href} scroll={false} className={cn(cls, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
