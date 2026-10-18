import { Skeleton } from '@/components/ui/skeleton'
import { HeadingSkeleton, PageSkeleton, TabsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Zakázek: nadpis, přepínač pohledu a filtry a sloupce podle stavů.
export default function JobsLoading() {
  return (
    <PageSkeleton maxWidth={1440}>
      <HeadingSkeleton />
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-12 w-44 rounded-full" />
        <TabsSkeleton count={4} />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex w-[280px] shrink-0 flex-col gap-2.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-[96px] rounded-panel" />
            <Skeleton className="h-[96px] rounded-panel" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  )
}
