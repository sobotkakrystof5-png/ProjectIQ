import type { Metadata } from 'next'
import Link from 'next/link'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { IncomingCard } from '@/components/ws/app/today/incoming-list'
import { AccentHeading, EmptyState } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'
import { getRequestsList, type RequestListItem, type RequestTab } from '@/lib/ws/calendar'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith } from '@/lib/ws/detail-param'
import { WS_FEATURES } from '@/lib/ws/features'
import { navHref } from '@/lib/ws/nav'
import { formatClock, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { getEnabledModules } from '@/lib/ws/today'
import { cn } from '@/lib/ws/utils'

export const metadata: Metadata = { title: 'Poptávky' }

type SearchParams = Record<string, string | string[] | undefined>

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'nove', label: 'Nové' },
  { key: 'potvrzene', label: 'Potvrzené' },
  { key: 'vyrizene', label: 'Vyřízené' },
]

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Potvrzeno',
  rescheduled: 'Jiný čas',
  declined: 'Odmítnuto',
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * Poptávky (S10, mockup C + rozložení detailu A): Nové / Potvrzené /
 * Vyřízené, detail v pravém panelu (`?detail=poptavka:<id>`).
 */
export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: { business: string }
  searchParams: SearchParams
}) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, 'poptavky')
  const tabParam = first(searchParams.stav)
  const tab: RequestTab = TABS.some((t) => t.key === tabParam) ? (tabParam as RequestTab) : 'nove'

  const [{ items, counts }, modules] = await Promise.all([
    getRequestsList(ctx, business, tab, now),
    getEnabledModules(ctx, business),
  ])
  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)
  const calendar = modules.has('calendar')
  const canBook = WS_FEATURES.newBooking && calendar

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AccentHeading accent="na jednom místě.">Poptávky</AccentHeading>
      </div>

      <nav aria-label="Stav poptávek" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <Link
              key={t.key}
              href={link({ stav: t.key === 'nove' ? null : t.key, detail: null })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors',
                active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100 dark:bg-navy-900 dark:text-navy-100',
              )}
            >
              {t.label}
              <span className={cn('font-num text-xs', active ? 'text-navy-200' : 'text-quiet')}>{counts[t.key]}</span>
            </Link>
          )
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          title={EMPTY[tab].title}
          description={EMPTY[tab].description}
          action={
            tab === 'nove' && canBook ? (
              <Link href={link({ detail: 'nova-rezervace' })} scroll={false} className={buttonVariants({ variant: 'outline' })}>
                Zapsat rezervaci
              </Link>
            ) : undefined
          }
        />
      ) : tab === 'nove' ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <li key={r.id}>
              <IncomingCard
                item={r}
                today={today}
                now={now}
                href={link({ detail: `poptavka:${r.id}` })}
                actions={{ slug: business.slug, calendar, jobs: modules.has('jobs') }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y rounded-panel border bg-surface">
          {items.map((r) => (
            <li key={r.id}>
              <HandledRow item={r} today={today} href={link({ detail: `poptavka:${r.id}` })} />
            </li>
          ))}
        </ul>
      )}

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </div>
  )
}

const EMPTY: Record<RequestTab, { title: string; description: string }> = {
  nove: {
    title: 'Žádná nová poptávka',
    description: 'Až přijde z webu, ukáže se tady i v kalendáři. Poptávku z telefonu zapíšete jako rezervaci.',
  },
  potvrzene: {
    title: 'Zatím nic potvrzeného',
    description: 'Potvrzené poptávky s termínem, který ještě nebyl, najdete tady.',
  },
  vyrizene: {
    title: 'Zatím nic vyřízeného',
    description: 'Tady budou odmítnuté poptávky a ty, jejichž termín už proběhl.',
  },
}

function HandledRow({ item: r, today, href }: { item: RequestListItem; today: string; href: string }) {
  const when = r.appointment_start ?? r.wanted_start
  const p = when ? pragueParts(when) : null
  return (
    <Link
      href={href}
      scroll={false}
      className="flex min-h-[64px] items-center gap-4 px-4 py-3 transition-colors hover:bg-navy-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-navy-900/60 sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{r.customer_name}</span>
        {r.service_name && <span className="block truncate text-sm text-quiet">{r.service_name}</span>}
      </span>
      {p && (
        <span className="hidden shrink-0 font-num text-sm text-ink sm:block">
          {formatRelativeDay(p.date, today)} {formatClock(when!)}
        </span>
      )}
      <span
        className={cn(
          'shrink-0 rounded-full px-3 py-1 font-num text-[11px] uppercase tracking-[0.06em]',
          r.status === 'declined' ? 'bg-danger/10 text-danger' : 'bg-navy-100 text-navy-900 dark:bg-navy-800 dark:text-navy-50',
        )}
      >
        {STATUS_LABEL[r.status] ?? 'Vyřízeno'}
      </span>
    </Link>
  )
}
