'use client'

import { useRef } from 'react'
import { cn } from '@/lib/ws/utils'
import { useRevealState } from './use-in-view'

/**
 * Nájezd sekce zdola při scrollu, jednou (`animate-zq-rise`, references/motion.md).
 * Bez JavaScriptu i při prefers-reduced-motion je obsah vidět rovnou — schová se jen to,
 * co je při načtení pod ohybem, a jen dokud k němu uživatel nedoscrolluje.
 */
export function Reveal({
  as = 'div',
  delay = 0,
  className,
  children,
}: {
  as?: 'div' | 'li' | 'article'
  delay?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useRevealState(ref)

  // div/li/article mají stejné API — pro typy stačí jeden z nich.
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref}
      className={cn(state === 'pending' && 'opacity-0', state === 'shown' && 'animate-zq-rise', className)}
      style={state === 'shown' && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
