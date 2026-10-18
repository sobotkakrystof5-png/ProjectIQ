import { HeadingSkeleton, PageSkeleton, RowsSkeleton } from '@/components/ws/app/skeletons'

// Kostra Nastavení a jeho podstránek: nadpis a seznam částí / formulář.
export default function SettingsLoading() {
  return (
    <PageSkeleton maxWidth={880}>
      <HeadingSkeleton />
      <RowsSkeleton rows={6} rowHeight={72} />
    </PageSkeleton>
  )
}
