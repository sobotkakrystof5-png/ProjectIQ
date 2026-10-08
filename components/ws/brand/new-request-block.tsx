'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/ws/utils'
import { zqIn } from '@/lib/ws/motion'
import { LiveDot } from './live-dot'
import { TimeRange } from './time-range'

/**
 * Nová poptávka — všude stejně: plocha signal-bg, čárkovaný okraj signal-line, text signal-ink.
 * `appear` = právě dorazila: vyjede shora (600 ms) a svítí tečka.
 */
export function NewRequestBlock({
  start,
  end,
  customer,
  service,
  appear = false,
  className,
  children,
}: {
  start: Date | string
  end?: Date | string
  customer: string
  service?: string
  appear?: boolean
  className?: string
  /** Akce, typicky jedno tlačítko „Potvrdit termín". */
  children?: React.ReactNode
}) {
  return (
    <motion.div
      {...(appear ? zqIn : {})}
      className={cn(
        'rounded-chip border-[1.5px] border-dashed border-signal-line bg-signal-bg p-3 text-signal-ink',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-num text-[11px] font-medium uppercase tracking-[0.08em]">
        {appear && <LiveDot />}
        <span>Nová poptávka</span>
        <TimeRange start={start} end={end} className="ml-auto text-xs normal-case tracking-normal" />
      </div>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug">{customer}</p>
      {service && <p className="text-sm leading-snug opacity-80">{service}</p>}
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </motion.div>
  )
}
