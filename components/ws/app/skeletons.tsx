import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/ws/utils'

// Kostry obrazovek, než přijdou data (RD02). Tvar kopíruje skutečnou obrazovku
// (šířka, nadpis, hlavní plocha), aby se po načtení nic neposunulo. Postranní
// panel a hlavička zůstávají, kostra se kreslí jen do `<main>`.

const PAGE = 'mx-auto flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'

/** Obal kostry: šířka jako u obrazovky, `aria-busy` a text pro čtečku. */
export function PageSkeleton({ maxWidth, children }: { maxWidth: 960 | 880 | 1280 | 1440; children: React.ReactNode }) {
  const width = { 880: 'max-w-[880px]', 960: 'max-w-[960px]', 1280: 'max-w-[1280px]', 1440: 'max-w-[1440px]' }[maxWidth]
  return (
    <div className={cn(PAGE, width)} aria-busy="true">
      <span className="sr-only" role="status">
        Načítám…
      </span>
      {children}
    </div>
  )
}

export function HeadingSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      {action && <Skeleton className="h-11 w-36 rounded-full" />}
    </div>
  )
}

/** Řádek přepínače (záložky, pohled Den / Týden / Měsíc). */
export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-11 w-28 rounded-full" />
      ))}
    </div>
  )
}

export function RowsSkeleton({ rows = 6, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="rounded-panel" style={{ height: rowHeight }} />
      ))}
    </div>
  )
}

/** Dlaždice s čísly (Příjmy / Výdaje / Rozdíl, Poptávky / Zákazníci…). */
export function MetricsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[96px] rounded-panel" />
      ))}
    </div>
  )
}

export function TaxSkeleton() {
  return <Skeleton className="h-[220px] rounded-panel" />
}
