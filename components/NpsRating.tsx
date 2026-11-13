'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface NpsRatingProps {
  value: number | null
  onChange: (v: number) => void
  disabled?: boolean
}

function scoreClass(n: number, active: boolean): string {
  // Škála roste tmavostí, ne odstínem (R-091): Dílky nemají zelenou a červená
  // patří chybě, ne nízké známce.
  if (!active) return 'border-navy-100 bg-navy-50 text-quiet'
  if (n <= 6) return 'border-navy-200 bg-navy-50 text-navy-700'
  if (n <= 8) return 'border-navy-300 bg-navy-100 text-navy-900'
  return 'border-navy-700 bg-navy-700 text-white'
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
                'flex-1 h-9 text-sm font-semibold border rounded-chip',
                'transition-all duration-150 select-none',
                scoreClass(n, isActive),
                !isActive && 'hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700',
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
      <div className="flex justify-between text-xs text-quiet">
        <span>Nejhorší</span>
        <span>Nejlepší</span>
      </div>
    </div>
  )
}
