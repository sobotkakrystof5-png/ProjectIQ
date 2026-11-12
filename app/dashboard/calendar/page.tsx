import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { SmartCalendar } from '@/components/SmartCalendar'
import { loadCalendarWindow } from '@/lib/admin/calendar'
import { windowFor } from '@/lib/admin/calendar-window'
import { getPragueTodayISO } from '@/lib/prague-time'

// Po sloučení byznysů (AD02, R-088) kalendář ukazuje všechno — i historické
// záznamy, které sem dřív nepouštěl filtr `business = 'vizeon'`.
//
// Od AD08 se čte jen okno kolem zobrazeného měsíce (± týden), ne celá
// historie. Další období si kalendář dotáhne sám přes `loadCalendarMonth`.
export const revalidate = 0

export default async function CalendarPage() {
  const today = getPragueTodayISO()
  const range = windowFor(today)
  const data = await loadCalendarWindow(range)

  return (
    <PageShell width="wide">
      <PageHeader
        title="Kalendář"
        subtitle="Konzultace, plánované hovory, termíny a vlastní události na jednom místě."
        subtitleFont="sans"
      />

      <SmartCalendar initial={data} initialRange={range} today={today} />
    </PageShell>
  )
}
