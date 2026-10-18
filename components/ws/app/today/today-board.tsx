import type { ReactNode } from 'react'

/** Kalendář má na široké obrazovce hlavní plochu; na telefonu zůstávají příchozí první. */
export function TodayBoard({
  incoming,
  calendar,
  customer,
}: {
  incoming: ReactNode
  calendar: ReactNode
  customer: ReactNode
}) {
  return (
    <div data-detail-grid className="grid items-start gap-6 lg:grid-rows-[min-content_1fr] lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div data-detail-hide className="min-w-0 lg:col-start-2 lg:row-start-1">{incoming}</div>
      <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {calendar}
      </div>
      <div data-detail-hide className="min-w-0 lg:col-start-2 lg:row-start-2">{customer}</div>
    </div>
  )
}
