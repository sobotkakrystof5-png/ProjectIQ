import type { Metadata } from 'next'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { CustomerSummary } from '@/components/ws/app/customer-summary'
import { IncomingList } from '@/components/ws/app/today/incoming-list'
import { PullToRefresh } from '@/components/ws/app/today/pull-to-refresh'
import { TodayBoard } from '@/components/ws/app/today/today-board'
import { TodayAgenda } from '@/components/ws/app/today/today-agenda'
import { TodayWelcome } from '@/components/ws/app/today/welcome'
import { WeekCalendar } from '@/components/ws/app/today/week-calendar'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith, parseDetail } from '@/lib/ws/detail-param'
import { navHref } from '@/lib/ws/nav'
import { orderPageUrl } from '@/lib/ws/app-origin'
import { plural } from '@/lib/ws/plural'
import {
  getCustomerCard,
  getEnabledModules,
  getTodayData,
  type CalendarEntry,
} from '@/lib/ws/today'
import {
  formatDayLong,
  isIsoDate,
  pragueParts,
  weekStartOf,
} from '@/lib/ws/time'

export const metadata: Metadata = { title: 'Dnes' }

type SearchParams = Record<string, string | string[] | undefined>

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v

/**
 * Dnes (S09, mockup C/D): Příchozí | týdenní kalendář | karta zákazníka.
 * Stav v URL: `?tyden=` (pondělí týdne), `?zakaznik=` (karta vpravo),
 * `?detail=` (pravý panel). Všechno se vykreslí na serveru.
 */
export default async function TodayPage(props: {
  params: Promise<{ business: string }>
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, '')

  const wanted = first(searchParams.tyden)
  const weekStart = isIsoDate(wanted) ? weekStartOf(wanted) : weekStartOf(today)
  const selectedParam = first(searchParams.zakaznik)
  const selected =
    selectedParam && UUID_RE.test(selectedParam)
      ? selectedParam.toLowerCase()
      : null

  const [data, modules] = await Promise.all([
    getTodayData(ctx, business, { weekStart, now }),
    getEnabledModules(ctx, business),
  ])
  const welcome = first(searchParams.vitejte) === '1'
  const detail = (
    <DetailSlot
      ctx={ctx}
      business={business}
      pathname={pathname}
      searchParams={searchParams}
      today={today}
    />
  )

  if (data.isEmpty) {
    return (
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Heading today={today} />
        <TodayWelcome
          welcome={welcome}
          orderUrl={await orderPageUrl(business.slug)}
        />
        {detail}
      </div>
    )
  }

  const customerId = selected ?? data.suggestedCustomerId
  const card = customerId
    ? await getCustomerCard(ctx, business, customerId, now)
    : null

  const todayVisits = data.calendar.filter(
    (e) => e.kind === 'visit' && pragueParts(e.start).date === today,
  ).length
  const link = (patch: Record<string, string | null>) =>
    hrefWith(pathname, searchParams, patch)
  const openRef = parseDetail(searchParams.detail)
  const selectedId =
    openRef?.kind === 'poptavka' || openRef?.kind === 'termin' ? openRef.id : null
  const detailLink = (e: CalendarEntry) =>
    e.kind === 'request'
      ? link({ detail: `poptavka:${e.id}` })
      : link({ detail: `termin:${e.id}` })

  return (
    <PullToRefresh>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Heading today={today}>
          {plural(data.incomingTotal, [
            'nová poptávka',
            'nové poptávky',
            'nových poptávek',
          ])}
          {' · '}
          {plural(todayVisits, ['termín dnes', 'termíny dnes', 'termínů dnes'])}
        </Heading>

        <TodayBoard
          incoming={
            <IncomingList
              items={data.incoming}
              total={data.incomingTotal}
              today={today}
              now={now}
              hrefFor={(id) => link({ detail: `poptavka:${id}` })}
              allHref={navHref(business.slug, 'poptavky')}
              actions={{
                slug: business.slug,
                calendar: modules.has('calendar'),
                jobs: modules.has('jobs'),
              }}
            />
          }
          calendar={
            <>
              <WeekCalendar
                className="hidden md:block"
                entries={data.calendar}
                weekStart={weekStart}
                today={today}
                opening={data.opening}
                selectedId={selectedId}
                links={{
                  // Termín vybere zákazníka do karty vpravo, poptávka otevře panel.
                  entry: (e) =>
                    e.kind === 'request'
                      ? link({ detail: `poptavka:${e.id}` })
                      : e.kind === 'block'
                        ? link({ detail: `termin:${e.id}` })
                        : e.customer_id
                          ? link({ zakaznik: e.customer_id, detail: null })
                          : link({ detail: `termin:${e.id}` }),
                  week: (start) => link({ tyden: start || null, detail: null }),
                }}
              />
              <TodayAgenda
                className="md:hidden"
                entries={data.calendar}
                today={today}
                hrefFor={detailLink}
              />
            </>
          }
          customer={
            <section
              aria-labelledby="zakaznik"
              className="flex min-w-0 flex-col gap-3"
            >
              <h2 id="zakaznik">
                <SectionLabel>Zákazník</SectionLabel>
              </h2>
              <div className="rounded-panel border bg-surface p-5">
                {card ? (
                  <CustomerSummary
                    card={card}
                    today={today}
                    businessName={business.name}
                    detailHref={link({ detail: `zakaznik:${card.id}` })}
                  />
                ) : (
                  <p className="text-[15px] text-quiet">
                    Klikněte na termín v kalendáři a uvidíte tu kartu zákazníka.
                  </p>
                )}
              </div>
            </section>
          }
        />

        {detail}
      </div>
    </PullToRefresh>
  )
}

function Heading({
  today,
  children,
}: {
  today: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <AccentHeading accent={formatDayLong(today)}>Dnes,</AccentHeading>
      {children && <p className="font-num text-sm text-quiet">{children}</p>}
    </div>
  )
}
