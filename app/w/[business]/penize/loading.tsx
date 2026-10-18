import { Skeleton } from '@/components/ui/skeleton'
import { HeadingSkeleton, MetricsSkeleton, PageSkeleton, TabsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Peněz (stejná pro Přehled měsíce, Faktury, Příjmy a Daně): nadpis,
// záložky, tři čísla a hlavní plocha.
export default function MoneyLoading() {
  return (
    <PageSkeleton maxWidth={1440}>
      <HeadingSkeleton action />
      <TabsSkeleton count={4} />
      <MetricsSkeleton />
      <Skeleton className="h-[320px] rounded-panel" />
    </PageSkeleton>
  )
}
