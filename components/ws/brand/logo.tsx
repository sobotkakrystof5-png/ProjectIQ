import { cn } from '@/lib/ws/utils'

/**
 * Logo ZakazIQ: tmavě modrý čtverec (gradient navy-600 → navy-800) s mřížkou 2×2 bílých dílků.
 * Při velikosti 32 px mají dílky 9 px a mezeru 4 px, ostatní velikosti se škálují.
 * `animated` — dva dílky (vpravo nahoře, vlevo dole) jemně dýchají; jen v hlavičce.
 */
export function Logo({
  size = 32,
  animated = false,
  wordmark = false,
  onDark = false,
  className,
}: {
  size?: number
  animated?: boolean
  wordmark?: boolean
  /** Text vedle loga na tmavé ploše. */
  onDark?: boolean
  className?: string
}) {
  const tile = (size * 9) / 32
  const gap = (size * 4) / 32
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        role="img"
        aria-label={wordmark ? undefined : 'ZakazIQ'}
        aria-hidden={wordmark || undefined}
        className="inline-grid shrink-0 place-content-center bg-gradient-to-br from-navy-600 to-navy-800"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          gridTemplateColumns: `repeat(2, ${tile}px)`,
          gap,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('block bg-white', animated && (i === 1 || i === 2) && 'animate-zq-breathe')}
            style={{
              width: tile,
              height: tile,
              borderRadius: Math.max(1.5, tile * 0.28),
              animationDelay: animated && i === 2 ? '1.5s' : undefined,
            }}
          />
        ))}
      </span>
      {wordmark && (
        <span
          className={cn(
            'font-semibold tracking-[-0.03em]',
            onDark ? 'text-white' : 'text-ink',
          )}
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          ZakazIQ
        </span>
      )}
    </span>
  )
}
