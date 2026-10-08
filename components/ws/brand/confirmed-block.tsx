import { cn } from '@/lib/ws/utils'
import { TimeRange } from './time-range'

/** Potvrzený termín v kalendáři: plocha navy-100, levý okraj 3 px navy-700, text navy-900. */
export function ConfirmedBlock({
  start,
  end,
  customer,
  service,
  className,
}: {
  start: Date | string
  end?: Date | string
  customer: string
  service?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-chip border-l-[3px] border-navy-700 bg-navy-100 py-3 pl-3 pr-3 text-navy-900 transition-colors duration-300 ease-zq dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
        className,
      )}
    >
      <TimeRange start={start} end={end} className="text-xs" />
      <p className="mt-1 text-[15px] font-semibold leading-snug">{customer}</p>
      {service && <p className="text-sm leading-snug text-navy-900/75 dark:text-navy-200">{service}</p>}
    </div>
  )
}
