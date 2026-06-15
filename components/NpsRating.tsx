'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface NpsRatingProps {
  value: number | null
  onChange: (v: number) => void
  disabled?: boolean
}

function scoreClass(n: number, active: boolean): string {
  if (!active) return 'border-gray-200 bg-gray-50 text-gray-400'
  if (n <= 6) return 'border-red-300 bg-red-50 text-red-700'
  if (n <= 8) return 'border-amber-300 bg-amber-50 text-amber-700'
  return 'border-emerald-400 bg-emerald-50 text-emerald-700'
}

export function NpsRating({ value, onChange, disabled }: NpsRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const effective = hovered ?? value ?? 0

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const isActive = n <= effective && effective > 0
          const isSelected = value === n
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              className={cn(
                'flex-1 h-9 text-sm font-semibold border rounded-lg',
                'transition-all duration-150 select-none',
                scoreClass(n, isActive),
                !isActive && 'hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                isSelected && 'scale-110 shadow-sm',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              onMouseEnter={() => !disabled && setHovered(n)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => !disabled && onChange(n)}
              aria-label={`Hodnocení ${n}`}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Nejhorší</span>
        <span>Nejlepší</span>
      </div>
    </div>
  )
}
