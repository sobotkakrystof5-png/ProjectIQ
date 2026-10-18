'use client'

import { AnimatePresence, m } from 'framer-motion'
import { cn } from '@/lib/ws/utils'
import { zqStamp } from '@/lib/ws/motion'
import { accentGradient, accentVars } from '@/lib/ws/accent'
import { loyaltyCardView, type LoyaltyCardStatus } from '@/lib/ws/loyalty-card-view'

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
  status,
  accentColor,
  className,
}: {
  customer: string
  stamps: number
  total?: number
  /** Co zákazník dostane, např. „Střih zdarma". */
  reward: string
  business?: string
  status?: LoyaltyCardStatus | null
  accentColor?: string | null
  className?: string
}) {
  const card = loyaltyCardView({ stamps, needed: total, reward, status })
  const full = card.status === 'full'
  const redeemed = card.status === 'redeemed'
  const gradient = accentGradient(accentColor)
  return (
    <div
      style={{ ...accentVars(accentColor), ...(gradient ? { backgroundImage: gradient } : {}) }}
      className={cn(
        'relative w-full max-w-sm overflow-hidden rounded-panel bg-gradient-to-br from-navy-700 to-navy-800 p-5 text-white shadow-xl shadow-navy-950/25',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {business && <p className="truncate text-sm text-navy-200">{business}</p>}
          <p className="truncate text-lg font-semibold tracking-[-0.02em]">{customer}</p>
        </div>
        <p className="shrink-0 font-num text-sm text-navy-200" aria-label={card.progress}>
          <span className="text-white">{card.stamps}</span> / {card.needed}
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-5 gap-2" aria-label={card.progress}>
        {Array.from({ length: card.needed }, (_, i) => (
          <li key={i} className="relative aspect-square">
            <span className="absolute inset-0 rounded-tiny border border-dashed border-white/35" aria-hidden />
            <AnimatePresence initial={false}>
              {i < card.stamps && (
                <m.span
                  key="stamp"
                  {...zqStamp}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  className={cn('absolute inset-0 rounded-tiny bg-white shadow-sm', redeemed && 'opacity-50')}
                  aria-hidden
                />
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>

      <p
        className={cn('mt-4 text-sm', full ? 'font-semibold text-reward' : redeemed ? 'font-semibold text-navy-50' : 'text-navy-200')}
        aria-live="polite"
      >
        {card.message}
      </p>
    </div>
  )
}
