import { Skeleton } from '@/components/ui/skeleton'
import { HeadingSkeleton, PageSkeleton } from '@/components/ws/app/skeletons'

// Kostra Zakázek: nadpis a sloupce podle stavů.
export default function JobsLoading() {
  return (
    <PageSkeleton maxWidth={1440}>
      <HeadingSkeleton />
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
