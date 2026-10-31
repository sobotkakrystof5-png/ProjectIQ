import Link from 'next/link'
import { cn } from '@/lib/ws/utils'

/** Řádek pod hlavičkou: přepínače pohledu, filtry, hledání. Zalamuje se na telefonu. */
export function Toolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}>{children}</div>
}

export type PillNavItem = {
  key: string
  label: string
  href: string
  active: boolean
  /** Počet vedle popisku (monospace). */
  count?: number
}

/**
 * Přepínač odkazů v pilulkách. Stav je v URL, takže jde o obyčejné odkazy.
 * `chips` = samostatné pilulky s posuvem (stavy, skupiny), `segmented` =
 * pilulky v jednom pouzdře (pohled kalendáře).
 */
export function PillNav({
  label,
  items,
  variant = 'chips',
  className,
}: {
  /** Popisek pro čtečky (aria-label). */
  label: string
  items: PillNavItem[]
  variant?: 'chips' | 'segmented'
  className?: string
}) {
  const segmented = variant === 'segmented'
  return (
    <nav
      aria-label={label}
      className={cn(
        segmented ? 'flex gap-1 rounded-full bg-navy-50 p-1 dark:bg-navy-900' : '-mx-1 flex gap-2 overflow-x-auto px-1 pb-1',
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            segmented ? 'min-h-11 px-4 text-sm' : 'min-h-11 px-4 text-sm',
            item.active
              ? 'bg-navy-700 text-white'
              : segmented
                ? 'text-navy-900 hover:bg-navy-100 dark:text-navy-100 dark:hover:bg-navy-800'
                : 'text-navy-900 hover:bg-navy-100 dark:text-navy-100 dark:hover:bg-navy-800',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={cn('font-num text-xs', item.active ? 'text-navy-200' : 'text-quiet')}>{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
