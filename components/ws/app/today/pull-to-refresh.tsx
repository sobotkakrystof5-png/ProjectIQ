'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/ws/utils'

const THRESHOLD = 72
const MAX = 110

/**
 * „Táhni pro obnovení“ na Dnes (S18). Jen v aplikaci přidané na plochu —
 * v prohlížeči má telefon vlastní gesto a dvě obnovení by se pletla.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [refreshing, start] = useTransition()
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    setEnabled(standalone && window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      const next = dy > 0 ? Math.min(MAX, dy * 0.5) : 0
      pullRef.current = next
      setPull(next)
    }
    const onEnd = () => {
      if (startY.current !== null && pullRef.current >= THRESHOLD) start(() => router.refresh())
      startY.current = null
      pullRef.current = 0
      setPull(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, router])

  const visible = enabled && (pull > 8 || refreshing)
  return (
    <>
      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 top-[72px] z-40 flex justify-center transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transform: `translateY(${refreshing ? 24 : pull / 2}px)` }}
      >
        {visible && (
          <span className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-lg shadow-navy-950/10">
            <RotateCw aria-hidden size={16} strokeWidth={1.5} className={cn(refreshing && 'animate-spin motion-reduce:animate-none')} />
            {refreshing ? 'Obnovuji…' : pull >= THRESHOLD ? 'Pusťte pro obnovení' : 'Táhněte dolů'}
          </span>
        )}
      </div>
      {children}
    </>
  )
}
