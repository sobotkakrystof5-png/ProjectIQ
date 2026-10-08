import { cn } from '@/lib/ws/utils'
import { formatClock, formatTimeRange } from '@/lib/ws/time'

/** Čas nebo rozsah v JetBrains Mono, pražský čas: „9:00–10:30". */
export function TimeRange({
  start,
  end,
  className,
}: {
  start: Date | string
  end?: Date | string
  className?: string
}) {
  const startIso = new Date(start).toISOString()
  return (
    <time dateTime={startIso} className={cn('whitespace-nowrap font-num tabular-nums', className)}>
      {end ? formatTimeRange(start, end) : formatClock(start)}
    </time>
  )
}
