import Link from 'next/link'
import type { CalEntry } from '@/lib/ws/calendar'
import { addDays, formatClock, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const WEEKDAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne']
const SHOWN = 3

const DOT: Record<CalEntry['kind'], string> = {
  visit: 'bg-navy-700 dark:bg-navy-300',
  block: 'bg-navy-200 dark:bg-navy-700',
  request: 'border border-dashed border-signal-line bg-signal-bg',
}

/** Měsíc: 6 týdnů, v každém dni prvních pár položek, klik na den = pohled Den. */
export function MonthGrid({
  gridStart,
  month,
  today,
  entries,
  dayHref,
}: {
  gridStart: string
  /** 'YYYY-MM' zobrazeného měsíce (dny okolo jsou ztlumené). */
  month: string
  today: string
  entries: CalEntry[]
  dayHref: (day: string) => string
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const byDay = new Map<string, CalEntry[]>()
  for (const e of [...entries].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const d = pragueParts(e.start).date
    byDay.set(d, [...(byDay.get(d) ?? []), e])
  }

  return (
    <div className="overflow-hidden rounded-panel border bg-surface">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center font-num text-[11px] uppercase tracking-[0.06em] text-quiet">
            {w}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {days.map((day, i) => {
          const list = byDay.get(day) ?? []
          const inMonth = day.startsWith(month)
          const requests = list.filter((e) => e.kind === 'request').length
          return (
            <li key={day} className={cn('min-w-0 border-b', i % 7 !== 0 && 'border-l', i >= 35 && 'border-b-0')}>
              <Link
                href={dayHref(day)}
                aria-label={`${day}: ${list.length} položek`}
                className={cn(
                  'flex h-full min-h-[64px] flex-col gap-1 p-1.5 transition-colors hover:bg-navy-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-navy-900/60 sm:min-h-[112px] sm:p-2',
                  !inMonth && 'bg-ground/60 text-quiet',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center self-start rounded-full font-num text-[12px]',
                    day === today && 'bg-navy-700 text-white',
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                {/* telefon: jen tečky */}
                <span className="flex flex-wrap gap-1 sm:hidden">
                  {list.slice(0, 6).map((e) => (
                    <span key={`${e.kind}-${e.id}`} className={cn('h-1.5 w-1.5 rounded-full', DOT[e.kind])} />
                  ))}
                </span>
                <ul className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {list.slice(0, SHOWN).map((e) => (
                    <li
                      key={`${e.kind}-${e.id}`}
                      className={cn(
                        'flex min-w-0 items-center gap-1.5 rounded-[6px] px-1 text-[11px] leading-5',
                        e.kind === 'request' && 'border border-dashed border-signal-line bg-signal-bg text-signal-ink',
                      )}
                    >
                      {e.kind !== 'request' && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[e.kind])} />}
                      <span className="font-num opacity-80">{formatClock(e.start)}</span>
                      <span className="truncate">{e.title}</span>
                    </li>
                  ))}
                  {list.length > SHOWN && <li className="px-1 font-num text-[11px] text-quiet">+{list.length - SHOWN} další</li>}
                </ul>
                {requests > 0 && <span className="sr-only">{requests} nových poptávek</span>}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
