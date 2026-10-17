import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { CalendarAgenda } from '@/components/ws/app/calendar/agenda'
import { MonthGrid } from '@/components/ws/app/calendar/month-grid'
import { TimeGrid, type GridColumn, type GridItem } from '@/components/ws/app/calendar/time-grid'
import { AccentHeading } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'
import { getCalendarData, type CalEntry } from '@/lib/ws/calendar'
import { hourRange, layoutWeek } from '@/lib/ws/calendar-layout'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith } from '@/lib/ws/detail-param'
import { WS_FEATURES } from '@/lib/ws/features'
import { navHref, navItemForSegment } from '@/lib/ws/nav'
import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatTimeRange,
  isIsoDate,
  pragueParts,
  pragueToUtc,
  weekStartOf,
} from '@/lib/ws/time'
import { getEnabledModules } from '@/lib/ws/today'
import { cn } from '@/lib/ws/utils'

export const metadata: Metadata = { title: 'Kalendář' }

type SearchParams = Record<string, string | string[] | undefined>
type View = 'den' | 'tyden' | 'mesic'

const VIEWS: { key: View; label: string }[] = [
  { key: 'den', label: 'Den' },
  { key: 'tyden', label: 'Týden' },
  { key: 'mesic', label: 'Měsíc' },
]

const KIND_LABEL: Record<CalEntry['kind'], string> = { visit: 'Termín', block: 'Blokace', request: 'Nová poptávka' }

const monthName = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function monthStart(day: string, shift = 0): string {
  const [y, m] = day.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + shift, 1))
  return d.toISOString().slice(0, 10)
}

/**
 * Kalendář (S10, mockup C): Den (sloupce podle pracovníků), Týden, Měsíc.
 * Nové poptávky jako čárkované bloky na chtěném čase, potvrzení na bloku,
 * přetažení termínu se „Zpět“, blokace. Stav v URL: `?pohled=`, `?datum=`.
 */
export default async function CalendarPage(
  props: {
    params: Promise<{ business: string }>
    searchParams: Promise<SearchParams>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const modules = await getEnabledModules(ctx, business)
  if (!navItemForSegment('kalendar', modules)) notFound()

  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, 'kalendar')
  const viewParam = first(searchParams.pohled)
  const view: View = viewParam === 'den' || viewParam === 'mesic' ? viewParam : 'tyden'
  const dateParam = first(searchParams.datum)
  const date = isIsoDate(dateParam) ? dateParam : today

  const rangeStart = view === 'den' ? date : view === 'tyden' ? weekStartOf(date) : weekStartOf(monthStart(date))
  const rangeDays = view === 'den' ? 1 : view === 'tyden' ? 7 : 42
  const data = await getCalendarData(ctx, business, {
    from: pragueToUtc(rangeStart, 0),
    to: pragueToUtc(addDays(rangeStart, rangeDays), 0),
  })

  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)
  const hrefFor = (e: CalEntry) => link({ detail: e.kind === 'request' ? `poptavka:${e.id}` : `termin:${e.id}` })
  const canBook = WS_FEATURES.newBooking
  const newBookingBase = canBook ? hrefWith(pathname, searchParams, { detail: 'nova-rezervace', den: null, cas: null, pracovnik: null }) : null
  const multiStaff = data.staff.length > 1

  const step = (dir: -1 | 1) =>
    view === 'den' ? addDays(date, dir) : view === 'tyden' ? addDays(rangeStart, dir * 7) : monthStart(date, dir)
  const label =
    view === 'den'
      ? formatDayLong(date)
      : view === 'tyden'
        ? `${formatDayShort(rangeStart).replace(/^\S+ /, '')} – ${formatDayShort(addDays(rangeStart, 6)).replace(/^\S+ /, '')}`
        : monthName.format(new Date(`${monthStart(date)}T12:00:00Z`))
  const showsToday = view === 'den' ? date === today : today >= rangeStart && today < addDays(rangeStart, rangeDays)

  // --- Mřížka (Den / Týden) -------------------------------------------------
  const hours = hourRange(data.entries, data.opening)
  const toItem = (e: CalEntry, column: string, p: { top: number; height: number; lane: number; lanes: number }, key: string): GridItem => {
    const start = pragueParts(e.start)
    const when = formatTimeRange(e.start, e.end)
    return {
      key,
      id: e.id,
      kind: e.kind,
      column,
      ...p,
      title: e.title,
      time: when,
      label: [`${KIND_LABEL[e.kind]}: ${e.title}`, e.subtitle, `${formatDayShort(start.date)} ${when}`, multiStaff ? e.staff_name : null]
        .filter(Boolean)
        .join(', '),
      href: hrefFor(e),
      startMinutes: start.minutes,
      // přetáhnout jde jednodenní termín; blokaci celého byznysu jen v detailu
      movable:
        e.kind !== 'request' &&
        start.date === pragueParts(new Date(e.end.getTime() - 1)).date &&
        !(view === 'den' && e.kind === 'block' && e.staff_id === null),
      confirm: e.kind === 'request' ? { day: start.date, minutes: start.minutes } : undefined,
    }
  }

  let columns: GridColumn[] = []
  let items: GridItem[] = []
  if (view === 'tyden') {
    columns = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(rangeStart, i)
      return { key: day, day, label: formatDayShort(day), today: day === today }
    })
    items = layoutWeek(data.entries, rangeStart, hours).map((p) =>
      toItem(p.item, columns[p.dayIndex].key, p, `${p.item.kind}-${p.item.id}-${p.dayIndex}`),
    )
  } else if (view === 'den') {
    const requests = data.entries.filter((e) => e.kind === 'request')
    const staffCols: GridColumn[] =
      data.staff.length > 0
        ? data.staff.map((s) => ({ key: s.id, day: date, staffId: s.id, label: s.name, today: false }))
        : [{ key: 'vse', day: date, label: business.name }]
    columns = [...(requests.length ? [{ key: 'poptavky', day: date, label: 'Nové poptávky', requests: true }] : []), ...staffCols]
    const place = (list: CalEntry[], col: string) =>
      layoutWeek(list, date, hours)
        .filter((p) => p.dayIndex === 0)
        .map((p) => toItem(p.item, col, p, `${p.item.kind}-${p.item.id}-${col}`))
    if (requests.length) items.push(...place(requests, 'poptavky'))
    for (const col of staffCols) {
      // blokace celého byznysu patří do každého sloupce
      const list = data.entries.filter(
        (e) => e.kind !== 'request' && (col.staffId === undefined || e.staff_id === col.staffId || (e.kind === 'block' && e.staff_id === null)),
      )
      items.push(...place(list, col.key))
    }
  }

  const agendaDays = view === 'den' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AccentHeading accent="na svém místě.">Každý termín</AccentHeading>
        <div className="flex flex-wrap gap-2">
          {canBook && (
            <Link href={link({ detail: 'nova-blokace' })} scroll={false} className={buttonVariants({ variant: 'outline' })}>
              Blokace
            </Link>
          )}
          {newBookingBase && (
            <Link href={newBookingBase} scroll={false} className={buttonVariants()}>
              <Plus aria-hidden size={18} strokeWidth={1.5} />
              Nová rezervace
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav aria-label="Pohled" className="flex gap-1 rounded-full bg-navy-50 p-1 dark:bg-navy-900">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={link({ pohled: v.key === 'tyden' ? null : v.key, detail: null })}
              aria-current={v.key === view ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                v.key === view ? 'bg-navy-700 text-white' : 'text-navy-900 hover:bg-navy-100 dark:text-navy-100 dark:hover:bg-navy-800',
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link
            href={link({ datum: step(-1), detail: null })}
            aria-label="Předchozí"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink"
          >
            <ChevronLeft aria-hidden size={20} strokeWidth={1.5} />
          </Link>
          <Link
            href={link({ datum: step(1), detail: null })}
            aria-label="Další"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink"
          >
            <ChevronRight aria-hidden size={20} strokeWidth={1.5} />
          </Link>
        </div>
        <h2 className="font-num text-[15px] text-ink first-letter:uppercase">{label}</h2>
        {!showsToday && (
          <Link
            href={link({ datum: null, detail: null })}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-navy-700 hover:bg-accent dark:text-navy-200"
          >
            Dnes
          </Link>
        )}
      </div>

      {view === 'mesic' ? (
        <MonthGrid
          gridStart={rangeStart}
          month={monthStart(date).slice(0, 7)}
          today={today}
          entries={data.entries}
          dayHref={(day) => link({ pohled: 'den', datum: day, detail: null })}
        />
      ) : (
        <>
          <section className="hidden min-w-0 rounded-panel border bg-surface p-4 sm:p-5 md:block">
            <TimeGrid slug={business.slug} columns={columns} items={items} hours={hours} newBookingHref={newBookingBase} />
          </section>
          <CalendarAgenda className="md:hidden" entries={data.entries} days={agendaDays} today={today} hrefFor={hrefFor} showStaff={multiStaff} />
        </>
      )}

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </div>
  )
}
