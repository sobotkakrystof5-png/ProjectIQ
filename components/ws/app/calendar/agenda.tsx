import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { CalEntry } from '@/lib/ws/calendar'
import { staffTint } from '@/lib/ws/staff-colors'
import { formatRelativeDay, formatTimeRange, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const KIND_CLASS: Record<CalEntry['kind'], string> = {
  visit: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

/**
 * Telefon: místo mřížky seznam po dnech (Den a Týden). Klik otevře detail
 * v panelu, u každého dne je velké „+ Rezervace“, prázdný den nabízí hledání
 * volného času. Přejetí mezi dny řeší obal SwipeDays.
 */
export function CalendarAgenda({
  entries,
  days,
  today,
  hrefFor,
  showStaff,
  addHref,
  findHref,
  accentFor,
  className,
}: {
  entries: CalEntry[]
  days: string[]
  today: string
  hrefFor: (e: CalEntry) => string
  showStaff: boolean
  /** Odkaz na novou rezervaci v daný den; `null` = tlačítko se nevykreslí. */
  addHref?: ((day: string) => string) | null
  /** Odkaz na Najít volný čas; `null` = bez něj. */
  findHref?: string | null
  /** Barva pracovníka termínu (CSS barva), jen u víc pracovníků. */
  accentFor?: (e: CalEntry) => string | undefined
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
            <div className="flex min-h-11 items-center justify-between gap-3">
              <h2 className={cn('font-num text-xs uppercase tracking-[0.08em]', day === today ? 'text-navy-700 dark:text-navy-200' : 'text-quiet')}>
                {formatRelativeDay(day, today)}
              </h2>
              {addHref && (
                <Link
                  href={addHref(day)}
                  scroll={false}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-navy-700 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-navy-200"
                >
                  <Plus aria-hidden size={16} strokeWidth={1.5} />
                  Rezervace
                </Link>
              )}
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-quiet">
                Nic domluveného.
                {findHref && (
                  <>
                    {' '}
                    <Link href={findHref} scroll={false} className="font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
                      Najít volný čas
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((e) => {
                  const accent = e.kind === 'visit' ? accentFor?.(e) : undefined
                  return (
                    <li key={`${e.kind}-${e.id}`}>
                      <Link
                        href={hrefFor(e)}
                        scroll={false}
                        style={accent ? { borderLeftColor: accent, backgroundColor: staffTint(accent) } : undefined}
                        className={cn(
                          'block min-h-11 rounded-chip px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          KIND_CLASS[e.kind],
                          accent && 'text-navy-900 dark:text-navy-50',
                        )}
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
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
