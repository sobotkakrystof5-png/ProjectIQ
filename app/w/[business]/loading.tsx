import { Skeleton } from '@/components/ui/skeleton'

// Kostra obrazovky Dnes, než přijdou data (postranní panel a hlavička zůstávají).
export default function TodayLoading() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true">
      <span className="sr-only" role="status">
        Načítám…
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
        </div>
        <Skeleton className="h-[420px] rounded-panel md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1" />
        <div className="flex flex-col gap-3 md:col-start-2 md:row-start-1 xl:col-start-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[360px] rounded-panel" />
        </div>
      </div>
    </div>
  )
}
