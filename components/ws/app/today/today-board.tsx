import type { ReactNode } from 'react'

/**
 * Rozložení Dnes (RD04): nahoře jedna hlavní věc, pod ní kalendář jako hlavní
 * plocha a vedle něj zbylé poptávky. Karta zákazníka je v pravém panelu.
 * Bez dalších poptávek sloupec vedle kalendáře úplně zmizí. Na telefonu jdou
 * hlavní věc, poptávky a seznam dne pod sebou.
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
    <div className="flex flex-col gap-6">
      <div data-detail-hide>{focus}</div>
      {incoming ? (
        <div
          data-detail-grid
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div data-detail-hide className="min-w-0 lg:col-start-2 lg:row-start-1">
            {incoming}
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">{calendar}</div>
        </div>
      ) : (
        <div className="min-w-0">{calendar}</div>
      )}
    </div>
  )
}
