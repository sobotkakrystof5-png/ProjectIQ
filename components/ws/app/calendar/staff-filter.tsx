import Link from 'next/link'
import { cn } from '@/lib/ws/utils'

export type StaffFilterItem = { key: string; label: string; href: string; active: boolean; accent?: string }

/**
 * Kdo je v kalendáři vidět: Všichni nebo jeden pracovník. Barevná tečka je
 * stejná jako barva jeho termínů, takže slouží i jako legenda.
 */
export function StaffFilter({ items, className }: { items: StaffFilterItem[]; className?: string }) {
  return (
    <nav aria-label="Pracovník" className={cn('-mx-1 flex gap-2 overflow-x-auto px-1 pb-1', className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item.active
              ? 'bg-navy-700 text-white'
              : 'bg-navy-50 text-navy-900 hover:bg-navy-100 dark:bg-navy-900 dark:text-navy-100',
          )}
        >
          {item.accent && (
            <span
              aria-hidden
              className={cn('h-2.5 w-2.5 rounded-full', item.active && 'ring-2 ring-white/70')}
              style={{ backgroundColor: item.accent }}
            />
          )}
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
