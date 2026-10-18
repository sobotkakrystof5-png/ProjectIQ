import { Skeleton } from '@/components/ui/skeleton'
import { HeadingSkeleton, PageSkeleton, RowsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Zákazníků: nadpis, hledání, skupiny a seznam.
export default function CustomersLoading() {
  return (
    <PageSkeleton maxWidth={1280}>
      <HeadingSkeleton />
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-11 w-full max-w-md rounded-full" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <RowsSkeleton rows={8} rowHeight={64} />
      </div>
    </PageSkeleton>
  )
}
