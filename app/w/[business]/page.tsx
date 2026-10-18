import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { TodayFocus } from '@/components/ws/app/today/focus'
import { IncomingList } from '@/components/ws/app/today/incoming-list'
import { PullToRefresh } from '@/components/ws/app/today/pull-to-refresh'
import { TodayBoard } from '@/components/ws/app/today/today-board'
import { TodayAgenda } from '@/components/ws/app/today/today-agenda'
import { TodayWelcome } from '@/components/ws/app/today/welcome'
import { WeekCalendar } from '@/components/ws/app/today/week-calendar'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith, parseDetail } from '@/lib/ws/detail-param'
import { WS_FEATURES } from '@/lib/ws/features'
import { navHref } from '@/lib/ws/nav'
import { orderPageUrl } from '@/lib/ws/app-origin'
import { plural } from '@/lib/ws/plural'
import { getEnabledModules, getTodayData, type CalendarEntry } from '@/lib/ws/today'
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
 * Dnes (S09, RD04): nahoře jedna hlavní věc („Teď na řadě“), pod ní týdenní
 * kalendář a zbylé poptávky. Karta zákazníka je v pravém panelu.
 * Stav v URL: `?tyden=` (pondělí týdne), `?detail=` (pravý panel).
 * Starý odkaz `?zakaznik=<id>` panel otevře (přesměruje na `?detail=zakaznik:<id>`).
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
  const link = (patch: Record<string, string | null>) =>
    hrefWith(pathname, searchParams, patch)

  const wanted = first(searchParams.tyden)
  const weekStart = isIsoDate(wanted) ? weekStartOf(wanted) : weekStartOf(today)
  const selectedParam = first(searchParams.zakaznik)
  if (selectedParam !== undefined) {
    const id = UUID_RE.test(selectedParam) ? selectedParam.toLowerCase() : null
    const open = !parseDetail(searchParams.detail) && id
    redirect(link({ zakaznik: null, ...(open ? { detail: `zakaznik:${id}` } : {}) }))
  }

  const modules = await getEnabledModules(ctx, business)
  const data = await getTodayData(ctx, business, {
    weekStart,
    now,
    invoices: modules.has('invoices'),
  })
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
      <PageShell width="wide">
        <Heading today={today} />
        <TodayWelcome
          welcome={welcome}
          orderUrl={await orderPageUrl(business.slug)}
          businessSlug={business.slug}
          hasService={data.services.length > 0}
          hasHours={data.opening !== null}
        />
        {detail}
      </PageShell>
    )
  }

  const todayVisits = data.calendar.filter(
    (e) => e.kind === 'visit' && pragueParts(e.start).date === today,
  ).length
  const openRef = parseDetail(searchParams.detail)
  const selectedId =
    openRef?.kind === 'poptavka' || openRef?.kind === 'termin' ? openRef.id : null
  const detailLink = (e: CalendarEntry) =>
    e.kind === 'request'
      ? link({ detail: `poptavka:${e.id}` })
      : link({ detail: `termin:${e.id}` })

  // První poptávka je nahoře jako hlavní věc, v seznamu vedle by byla podruhé.
  const focusRequestId = data.focus.kind === 'request' ? data.focus.request.id : null
  const restItems = data.incoming.filter((r) => r.id !== focusRequestId)
  const restTotal = data.incomingTotal - (focusRequestId ? 1 : 0)
  const actions = {
    slug: business.slug,
    calendar: modules.has('calendar'),
    jobs: modules.has('jobs'),
  }

  return (
    <PullToRefresh>
      <PageShell width="wide">
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
          focus={
            <TodayFocus
              focus={data.focus}
              today={today}
              now={now}
              actions={actions}
              hrefs={{
                request: (id) => link({ detail: `poptavka:${id}` }),
                visit: (id) => link({ detail: `termin:${id}` }),
                invoices: navHref(business.slug, 'faktury'),
              }}
              orderUrl={
                data.focus.kind === 'none' && WS_FEATURES.orderLink
                  ? await orderPageUrl(business.slug)
                  : undefined
              }
            />
          }
          incoming={
            restTotal > 0 ? (
              <IncomingList
                label={focusRequestId ? 'Další poptávky' : 'Příchozí'}
                items={restItems}
                total={restTotal}
                today={today}
                now={now}
                hrefFor={(id) => link({ detail: `poptavka:${id}` })}
                allHref={navHref(business.slug, 'poptavky')}
                actions={actions}
              />
            ) : null
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
                  // Termín i poptávka otevřou detail v pravém panelu, i s kartou zákazníka.
                  entry: detailLink,
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
        />

        {detail}
      </PageShell>
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
  return <PageHeader title="Dnes," accent={formatDayLong(today)} subtitle={children} />
}
