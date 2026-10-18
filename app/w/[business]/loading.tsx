import { Skeleton } from '@/components/ui/skeleton'

// Kostra obrazovky Dnes, než přijdou data (postranní panel a hlavička zůstávají).
export default function TodayLoading() {
  return (
    <div
      className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Načítám…
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid items-start gap-6 lg:grid-rows-[min-content_1fr] lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-2.5 lg:col-start-2 lg:row-start-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
        </div>
        <Skeleton className="h-[420px] rounded-panel lg:col-start-1 lg:row-span-2 lg:row-start-1" />
        <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[360px] rounded-panel" />
        </div>
      </div>
    </div>
  )
}
