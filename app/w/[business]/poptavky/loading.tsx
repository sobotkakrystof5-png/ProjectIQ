import { HeadingSkeleton, PageSkeleton, RowsSkeleton, TabsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Poptávek: nadpis, záložky Nové / Potvrzené / Vyřízené a seznam.
export default function RequestsLoading() {
  return (
    <PageSkeleton maxWidth={960}>
      <HeadingSkeleton />
      <TabsSkeleton count={3} />
      <RowsSkeleton rows={6} rowHeight={72} />
    </PageSkeleton>
  )
}
