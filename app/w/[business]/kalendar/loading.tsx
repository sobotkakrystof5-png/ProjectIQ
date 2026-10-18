import { Skeleton } from '@/components/ui/skeleton'
import { HeadingSkeleton, PageSkeleton, TabsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Kalendáře: nadpis, přepínač pohledu a mřížka s pruhem Příchozí.
export default function CalendarLoading() {
  return (
    <PageSkeleton maxWidth={1440}>
      <HeadingSkeleton action />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TabsSkeleton count={3} />
          <Skeleton className="h-[560px] rounded-panel" />
        </div>
        <div className="hidden flex-col gap-2.5 xl:flex">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
        </div>
      </div>
    </PageSkeleton>
  )
}
