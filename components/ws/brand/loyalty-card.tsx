'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/ws/utils'
import { zqStamp } from '@/lib/ws/motion'

function remainingText(remaining: number): string {
  if (remaining === 1) return 'Do odměny zbývá 1 návštěva'
  if (remaining >= 2 && remaining <= 4) return `Do odměny zbývají ${remaining} návštěvy`
  return `Do odměny zbývá ${remaining} návštěv`
}

/**
 * Věrnostní karta: gradient navy-600 → navy-800, bílá razítka jako dílky, prázdné čárkovaně.
 * Nové razítko „vyskočí" (500 ms); plná karta → „Odměna připravena".
 */
export function LoyaltyCard({
  customer,
  stamps,
  total = 10,
  reward,
  business,
  className,
}: {
  customer: string
  stamps: number
  total?: number
  /** Co zákazník dostane, např. „Střih zdarma". */
  reward: string
  business?: string
  className?: string
}) {
  const filled = Math.min(Math.max(stamps, 0), total)
  const full = filled >= total
  return (
    <div
      className={cn(
        'relative w-full max-w-sm overflow-hidden rounded-panel bg-gradient-to-br from-navy-600 to-navy-800 p-5 text-white shadow-xl shadow-navy-950/25',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {business && <p className="truncate text-sm text-navy-200">{business}</p>}
          <p className="truncate text-lg font-semibold tracking-[-0.02em]">{customer}</p>
        </div>
        <p className="shrink-0 font-num text-sm text-navy-200">
          <span className="text-white">{filled}</span> / {total}
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-5 gap-2" aria-label={`${filled} z ${total} razítek`}>
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className="relative aspect-square">
            <span className="absolute inset-0 rounded-tiny border border-dashed border-white/35" aria-hidden />
            <AnimatePresence initial={false}>
              {i < filled && (
                <motion.span
                  key="stamp"
                  {...zqStamp}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  className="absolute inset-0 rounded-tiny bg-white shadow-sm"
                  aria-hidden
                />
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>

      <p className={cn('mt-4 text-sm', full ? 'font-semibold text-reward' : 'text-navy-200')} aria-live="polite">
        {full ? `Odměna připravena: ${reward}` : `${remainingText(total - filled)}: ${reward}`}
      </p>
    </div>
  )
}
