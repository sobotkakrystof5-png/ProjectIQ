import { PageShell } from '@/components/ws/app/page-header'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Kostlivec obrazovky adminu pro `loading.tsx` (AD06).
 *
 * Smysl není „ukázat něco, než to doběhne" — smysl je, aby se stránka
 * nepřeskládala, až data dorazí. Proto má kostlivec **stejnou šířku
 * a stejné rozvržení** jako hotová obrazovka: tytéž `PageShell`, tutéž
 * hlavičku, stejně vysoké bloky.
 *
 * Co se nekreslí: nic, co by se dalo splést se skutečným údajem. Žádná
 * nula, žádné „0 Kč", žádný text.
 */

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  )
}

/** Dnes: hlavní věc nahoře, pod ní sekce a vpravo peníze. */
export function TodaySkeleton() {
  return (
    <PageShell width="wide">
      <Header />
      <Skeleton className="h-36 w-full rounded-panel" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
          <Skeleton className="h-40 w-full rounded-box" />
          <Skeleton className="h-40 w-full rounded-box" />
        </div>
        <Skeleton className="h-72 w-full rounded-box" />
      </div>
    </PageShell>
  )
}

/** Výpis: hlavička, pruh filtrů a řádky. */
export function TableSkeleton({
  width = 'wide',
  rows = 8,
}: {
  width?: 'narrow' | 'default' | 'wide' | 'table'
  rows?: number
}) {
  return (
    <PageShell width={width}>
      <Header />
      <Skeleton className="h-11 w-64 rounded-chip" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-box" />
        ))}
      </div>
    </PageShell>
  )
}

/** Kalendář: týdenní mřížka v jednom kuse. */
export function CalendarSkeleton() {
  return (
    <PageShell width="wide">
      <Header />
      <Skeleton className="h-[640px] w-full rounded-panel" />
    </PageShell>
  )
}
