'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/ws/utils'

const MIN_SWIPE_PX = 72

/**
 * Telefon: přejetí prstem doleva/doprava přepne na další/předchozí období.
 * Svislé posouvání stránky zůstává; šikmé přejetí se nebere.
 */
export function SwipeDays({
  prevHref,
  nextHref,
  className,
  children,
}: {
  prevHref: string
  nextHref: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const start = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className={cn('touch-pan-y', className)}
      onTouchStart={(e) => {
        const t = e.touches[0]
        start.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.6) return
        router.push(dx < 0 ? nextHref : prevHref, { scroll: false })
      }}
    >
      {children}
    </div>
  )
}
