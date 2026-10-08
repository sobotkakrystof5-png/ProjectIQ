import { cn } from '@/lib/ws/utils'

/** Které dílky pulzují: deterministicky ~9 % (index × 37 mod 100 < 9), bez JavaScriptu v prohlížeči. */
export function isPulsingTile(index: number): boolean {
  return (index * 37) % 100 < 9
}

/**
 * Pole dílků do pozadí tmavých ploch (hero, „Jak to funguje", ceník, velké prázdné stavy).
 * Čisté CSS, skoro neviditelné čtverce 44 px; pulz vypne prefers-reduced-motion.
 * Rodič musí mít `relative` a `overflow-hidden`.
 */
export function TileField({ cols = 28, rows = 12, className }: { cols?: number; rows?: number; className?: string }) {
  const count = cols * rows
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 grid content-start gap-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${cols}, 44px)` }}
    >
      {Array.from({ length: count }, (_, i) =>
        isPulsingTile(i) ? (
          <span
            key={i}
            className="block h-11 w-11 rounded-[10px] bg-navy-500 opacity-10 animate-zq-pulse"
            style={{ animationDuration: `${4 + (i % 4)}s`, animationDelay: `${((i * 7) % 60) / 10}s` }}
          />
        ) : (
          <span key={i} className="block h-11 w-11 rounded-[10px] border border-navy-200/5 bg-navy-200/5" />
        ),
      )}
    </div>
  )
}
