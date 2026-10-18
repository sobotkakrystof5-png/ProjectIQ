import { cn } from '@/lib/ws/utils'
import { TileField } from './tile-field'

/** Tři dílky na místě, čtvrtý chybí — prázdný stav čeká, až ho něco doplní. */
function MissingTile({ onDark, small }: { onDark: boolean; small: boolean }) {
  return (
    <span aria-hidden className={cn('inline-grid grid-cols-2', small ? 'gap-1' : 'gap-1.5')}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            small ? 'block h-4 w-4 rounded-[5px]' : 'block h-6 w-6 rounded-[7px]',
            i === 3
              ? cn('border-[1.5px] border-dashed', onDark ? 'border-navy-400' : 'border-navy-300 dark:border-navy-500')
              : onDark
                ? 'bg-navy-700'
                : 'bg-navy-100 dark:bg-navy-800',
          )}
        />
      ))}
    </span>
  )
}

/**
 * Prázdný stav vždy říká, co udělat dál (AGENTS.md → B9): nadpis, jedna věta, jedna akce.
 * `size="large"` = tmavý panel s polem dílků (prázdná obrazovka, ne prázdný seznam v kartě),
 * `size="compact"` = nízký čárkovaný rámeček do úzkého sloupce nebo karty (RD04).
 */
export function EmptyState({
  title,
  description,
  action,
  size = 'default',
  className,
}: {
  title: string
  description: string
  action?: React.ReactNode
  size?: 'default' | 'large' | 'compact'
  className?: string
}) {
  const large = size === 'large'
  const compact = size === 'compact'
  return (
    <div
      className={cn(
        'relative flex flex-col items-center overflow-hidden text-center',
        large
          ? 'rounded-slab bg-navy-950 px-6 py-16 text-white sm:py-24'
          : compact
            ? 'rounded-box border border-dashed px-4 py-6'
            : 'rounded-box border border-dashed px-6 py-10',
        className,
      )}
    >
      {large && <TileField cols={30} rows={10} />}
      <div className="relative flex flex-col items-center">
        <MissingTile onDark={large} small={compact} />
        <h3
          className={cn(
            'font-semibold tracking-[-0.02em]',
            compact ? 'mt-3 text-base text-ink' : 'mt-5',
            large ? 'text-2xl sm:text-[28px]' : !compact && 'text-lg text-ink',
          )}
        >
          {title}
        </h3>
        <p className={cn('max-w-sm text-[15px]', compact ? 'mt-1' : 'mt-2', large ? 'text-navy-200' : 'text-quiet')}>{description}</p>
        {action && <div className={compact ? 'mt-4' : 'mt-6'}>{action}</div>}
      </div>
    </div>
  )
}
