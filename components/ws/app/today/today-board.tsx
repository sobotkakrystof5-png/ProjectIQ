import type { ReactNode } from 'react'

/**
 * Dnes: kalendář je hlavní pracovní plocha, vedle něj je to, co čeká na reakci.
 * Na telefonu jdou hlavní věc, poptávky a seznam dne pod sebou.
 */
export function TodayBoard({
  focus,
  incoming,
  calendar,
}: {
  focus: ReactNode
  /** Zbylé nové poptávky; `null` = žádné, sloupec se nevykreslí. */
  incoming: ReactNode | null
  calendar: ReactNode
}) {
  return (
    <div
      data-detail-grid
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div data-detail-hide className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-1">
        {focus}
        {incoming}
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{calendar}</div>
    </div>
  )
}
