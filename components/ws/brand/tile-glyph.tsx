import { cn } from '@/lib/ws/utils'

/** Malý znak 2×2 (dílky 5 px, šachovnice navy-700 / navy-300) — odrážka u oborů a štítků. */
export function TileGlyph({ size = 5, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 grid-cols-2', className)}
      style={{ gap: Math.max(1, Math.round(size * 0.4)) }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('block', i === 0 || i === 3 ? 'bg-navy-700 dark:bg-navy-300' : 'bg-navy-300 dark:bg-navy-600')}
          style={{ width: size, height: size, borderRadius: Math.max(1, size * 0.3) }}
        />
      ))}
    </span>
  )
}
