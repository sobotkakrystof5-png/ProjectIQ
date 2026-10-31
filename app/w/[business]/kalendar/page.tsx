import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { IncomingList } from '@/components/ws/app/today/incoming-list'
import { CalendarActions } from '@/components/ws/app/calendar/calendar-actions'
import { CalendarAgenda } from '@/components/ws/app/calendar/agenda'
import { DateJump } from '@/components/ws/app/calendar/date-jump'
import { MonthGrid } from '@/components/ws/app/calendar/month-grid'
import { StaffFilter } from '@/components/ws/app/calendar/staff-filter'
import { SwipeDays } from '@/components/ws/app/calendar/swipe-days'
import { TimeGrid, type GridColumn, type GridItem } from '@/components/ws/app/calendar/time-grid'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { HelpLink } from '@/components/ws/app/help-link'
import { PillNav, Toolbar } from '@/components/ws/app/toolbar'
import { getCalendarData, type CalEntry } from '@/lib/ws/calendar'
import { closedSegments, freeGaps, gapSegments, hourRange, layoutWeek, openRangesFor, type MinuteRange } from '@/lib/ws/calendar-layout'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith } from '@/lib/ws/detail-param'
import { WS_FEATURES } from '@/lib/ws/features'
import { navHref, navItemForSegment } from '@/lib/ws/nav'
import { staffAccent } from '@/lib/ws/staff-colors'
import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatTimeRange,
  isIsoDate,
  pragueParts,
  pragueToUtc,
  weekdayOf,
  weekStartOf,
} from '@/lib/ws/time'
import { getEnabledModules, getIncoming } from '@/lib/ws/today'
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
 * Redesign (R-057): mřížka je hlavní plocha, vpravo pruh Příchozí se všemi
 * čekajícími poptávkami (i mimo zobrazený týden); pod 1280 px je pod kalendářem.
 * RD05: jedna lišta (pohled, šipky, skok na datum, Dnes, pracovník), rychlé
 * zadání rezervace přímo v mřížce, barvy pracovníků, stínování mimo otevírací
 * dobu a velké volné mezery, přejetí mezi dny na telefonu.
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
  // Bez volby v URL: telefon začíná dnem (S18), počítač a tablet týdnem.
  const phone = /iPhone|Android.+Mobile|Mobi/i.test((await headers()).get('user-agent') ?? '')
  const view: View =
    viewParam === 'den' || viewParam === 'tyden' || viewParam === 'mesic' ? viewParam : phone ? 'den' : 'tyden'
  const dateParam = first(searchParams.datum)
  const date = isIsoDate(dateParam) ? dateParam : today

  const rangeStart = view === 'den' ? date : view === 'tyden' ? weekStartOf(date) : weekStartOf(monthStart(date))
  const rangeDays = view === 'den' ? 1 : view === 'tyden' ? 7 : 42
  const [data, incoming] = await Promise.all([
    getCalendarData(ctx, business, {
      from: pragueToUtc(rangeStart, 0),
      to: pragueToUtc(addDays(rangeStart, rangeDays), 0),
    }),
    getIncoming(ctx, business),
  ])

  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)
  const hrefFor = (e: CalEntry) => link({ detail: e.kind === 'request' ? `poptavka:${e.id}` : `termin:${e.id}` })
  const canBook = WS_FEATURES.newBooking
  const newBookingBase = canBook ? hrefWith(pathname, searchParams, { detail: 'nova-rezervace', den: null, cas: null, pracovnik: null }) : null
  const multiStaff = data.staff.length > 1

  // Filtr „kdo“: jen pracovník z tohoto byznysu (cizí hodnota z adresy se ignoruje).
  const kdoParam = first(searchParams.kdo)
  const staffFilter = multiStaff && kdoParam && data.staff.some((s) => s.id === kdoParam) ? kdoParam : null
  const entries = staffFilter
    ? data.entries.filter((e) => e.kind === 'request' || e.staff_id === staffFilter || (e.kind === 'block' && e.staff_id === null))
    : data.entries
  const accentOf = (staffId: string | null): string | undefined => {
    if (!multiStaff || !staffId) return undefined
    const i = data.staff.findIndex((s) => s.id === staffId)
    return i < 0 ? undefined : staffAccent(data.staff[i].color, i)
  }

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
    // přetáhnout jde jednodenní termín; blokaci celého byznysu jen v detailu
    const movable =
      e.kind !== 'request' &&
      start.date === pragueParts(new Date(e.end.getTime() - 1)).date &&
      !(view === 'den' && e.kind === 'block' && e.staff_id === null)
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
      durationMin: Math.round((e.end.getTime() - e.start.getTime()) / 60_000),
      movable,
      resizable: movable,
      confirm: e.kind === 'request' ? { day: start.date, minutes: start.minutes } : undefined,
      accent: e.kind === 'visit' ? accentOf(e.staff_id) : undefined,
    }
  }

  // Minuty dne, do kterých už dnešek uplynul (co je před nimi, není „volné“).
  const nowMinutes = pragueParts(now).minutes
  const settingsHref = navHref(business.slug, 'nastaveni') + '/oteviraci-doba'
  const openFor = (day: string, staffId: string | null) => openRangesFor(data.openingRows, weekdayOf(day), staffId)

  let columns: GridColumn[] = []
  let items: GridItem[] = []
  if (view === 'tyden') {
    columns = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(rangeStart, i)
      return { key: day, day, label: formatDayShort(day), today: day === today, closed: closedSegments(openFor(day, staffFilter), hours) }
    })
    items = layoutWeek(entries, rangeStart, hours).map((p) =>
      toItem(p.item, columns[p.dayIndex].key, p, `${p.item.kind}-${p.item.id}-${p.dayIndex}`),
    )
  } else if (view === 'den') {
    const requests = entries.filter((e) => e.kind === 'request')
    const shown = staffFilter ? data.staff.filter((s) => s.id === staffFilter) : data.staff
    const minutesOf = (e: CalEntry): MinuteRange => {
      const s = pragueParts(e.start)
      const en = pragueParts(e.end)
      return { from: s.date < date ? 0 : s.minutes, to: en.date > date ? 24 * 60 : en.minutes }
    }
    const notBefore = date === today ? nowMinutes : date < today ? 24 * 60 : 0
    const listFor = (staffId: string | undefined) =>
      // blokace celého byznysu patří do každého sloupce
      entries.filter(
        (e) => e.kind !== 'request' && (staffId === undefined || e.staff_id === staffId || (e.kind === 'block' && e.staff_id === null)),
      )
    const makeColumn = (staffId: string | undefined, base: Omit<GridColumn, 'closed' | 'gaps'>): GridColumn => {
      const open = openFor(date, staffId ?? null)
      const list = listFor(staffId)
      const gaps =
        open && list.some((e) => e.kind === 'visit')
          ? gapSegments(freeGaps(open, list.map(minutesOf), 60, notBefore), hours)
          : undefined
      return { ...base, closed: closedSegments(open, hours), gaps }
    }
    const staffCols: GridColumn[] =
      data.staff.length > 0
        ? shown.map((s) => {
            const i = data.staff.findIndex((x) => x.id === s.id)
            return makeColumn(s.id, { key: s.id, day: date, staffId: s.id, label: s.name, today: false, accent: accentOf(s.id) ?? (multiStaff ? staffAccent(s.color, i) : undefined) })
          })
        : [makeColumn(undefined, { key: 'vse', day: date, label: business.name })]
    columns = [...(requests.length ? [{ key: 'poptavky', day: date, label: 'Nové poptávky', requests: true }] : []), ...staffCols]
    const place = (list: CalEntry[], col: string) =>
      layoutWeek(list, date, hours)
        .filter((p) => p.dayIndex === 0)
        .map((p) => toItem(p.item, col, p, `${p.item.kind}-${p.item.id}-${col}`))
    if (requests.length) items.push(...place(requests, 'poptavky'))
    for (const col of staffCols) items.push(...place(listFor(col.staffId ?? undefined), col.key))
  }

  // Telefon v aktuálním týdnu: od dneška do konce týdne (R-040), minulé dny vynechá.
  const agendaDays = view === 'den' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)).filter((d) => view !== 'tyden' || !showsToday || d >= today)
  const flatParams = Object.fromEntries(
    Object.entries(searchParams).flatMap(([k, v]) => {
      const one = first(v)
      return one === undefined ? [] : [[k, one]]
    }),
  )
  const findHref = canBook ? link({ detail: 'najit-cas' }) : null

  return (
    <PageShell width="wide">
      <PageHeader
        title="Každý termín"
        accent="na svém místě."
        action={<CalendarActions bookHref={newBookingBase} findHref={findHref} blockHref={canBook ? link({ detail: 'nova-blokace' }) : null} />}
        help={<HelpLink slug={business.slug} topic="poptavky-a-kalendar" guide="rezervace-v-kalendari" />}
      />

      <div data-detail-grid className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Toolbar>
            <PillNav
              label="Pohled"
              variant="segmented"
              items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: link({ pohled: v.key, detail: null }), active: v.key === view }))}
            />
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
            <DateJump label={label} date={date} pathname={pathname} params={flatParams} />
            {!showsToday && (
              <Link
                href={link({ datum: null, detail: null })}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-navy-700 hover:bg-accent dark:text-navy-200"
              >
                Dnes
              </Link>
            )}
          </Toolbar>

          {multiStaff && view !== 'mesic' && (
            <StaffFilter
              items={[
                { key: 'vsichni', label: 'Všichni', href: link({ kdo: null, detail: null }), active: staffFilter === null },
                ...data.staff.map((s, i) => ({
                  key: s.id,
                  label: s.name,
                  href: link({ kdo: s.id, detail: null }),
                  active: staffFilter === s.id,
                  accent: staffAccent(s.color, i),
                })),
              ]}
            />
          )}

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
                <TimeGrid
                  slug={business.slug}
                  columns={columns}
                  items={items}
                  hours={hours}
                  newBookingHref={newBookingBase}
                  services={data.services}
                  staff={data.staff.map((s) => ({ id: s.id, name: s.name }))}
                  canCreateGroupSessions={ctx.role === 'owner'}
                  today={today}
                  settingsHref={settingsHref}
                />
              </section>
              <SwipeDays prevHref={link({ datum: step(-1), detail: null })} nextHref={link({ datum: step(1), detail: null })} className="md:hidden">
                <CalendarAgenda
                  entries={entries}
                  days={agendaDays}
                  today={today}
                  hrefFor={hrefFor}
                  showStaff={multiStaff}
                  addHref={canBook ? (day) => hrefWith(pathname, searchParams, { detail: 'nova-rezervace', den: day, cas: null, pracovnik: null }) : null}
                  findHref={findHref}
                  accentFor={(e) => accentOf(e.staff_id)}
                />
              </SwipeDays>
            </>
          )}
        </div>

        <div data-detail-hide className={cn('min-w-0', incoming.total === 0 && 'hidden xl:block')}>
          <IncomingList
            items={incoming.items}
            total={incoming.total}
            today={today}
            now={now}
            hrefFor={(id) => link({ detail: `poptavka:${id}` })}
            allHref={navHref(business.slug, 'poptavky')}
            actions={{ slug: business.slug, calendar: true, jobs: modules.has('jobs') }}
          />
        </div>
      </div>

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </PageShell>
  )
}
