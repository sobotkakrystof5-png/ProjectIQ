import Link from 'next/link'
import { EmptyState, NewRequestBlock, SectionLabel } from '@/components/ws/brand'
import type { IncomingRequest } from '@/lib/ws/today'
import { formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'
import { RequestActions } from '../booking/request-actions'

const JUST_ARRIVED_MS = 15 * 60_000 // tečka „právě dorazilo“

/**
 * Příchozí: nové poptávky, nejnovější nahoře. Klik otevře poptávku v pravém
 * panelu, tlačítko „Potvrdit termín“ ji potvrdí rovnou (S10).
 */
export function IncomingList({
  items,
  total,
  today,
  now,
  hrefFor,
  allHref,
  actions,
  label = 'Příchozí',
  className,
}: {
  items: IncomingRequest[]
  total: number
  today: string
  now: Date
  hrefFor: (id: string) => string
  allHref: string
  /** Potvrzení jedním klikem; bez něj je karta jen odkaz na detail. */
  actions?: { slug: string; calendar: boolean; jobs: boolean }
  /** Nadpis sekce; na Dnes „Další poptávky“, když první je nahoře jako hlavní věc. */
  label?: string
  className?: string
}) {
  return (
    <section aria-labelledby="prichozi" className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="prichozi">
          <SectionLabel>{label}</SectionLabel>
        </h2>
        {total > 0 && <span className="font-num text-xs text-quiet">{total}</span>}
      </div>

      {items.length === 0 ? (
        <EmptyState
          size="compact"
          title="Žádná nová poptávka"
          description="Až přijde z webu, ukáže se tady a v kalendáři."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((r) => (
            <li key={r.id}>
              <IncomingCard item={r} today={today} now={now} href={hrefFor(r.id)} actions={actions} />
            </li>
          ))}
        </ul>
      )}

      {total > items.length && (
        <Link
          href={allHref}
          className="inline-flex min-h-11 items-center text-[15px] font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200"
        >
          Všechny poptávky ({total})
        </Link>
      )}
    </section>
  )
}

/** Karta nové poptávky: odkaz na detail přes celou kartu, tlačítko potvrzení nad ním. */
export function IncomingCard({
  item: r,
  today,
  now,
  href,
  actions,
}: {
  item: Pick<IncomingRequest, 'id' | 'customer_name' | 'service_name' | 'wanted_start' | 'wanted_end' | 'created_at'>
  today: string
  now: Date
  href: string
  actions?: { slug: string; calendar: boolean; jobs: boolean }
}) {
  const wanted = r.wanted_start ? pragueParts(r.wanted_start) : null
  return (
    // Odkaz leží pod kartou přes celou plochu; karta propouští kliknutí
    // (pointer-events-none), jen tlačítko potvrzení je klikací samo.
    <div className="group relative">
      <Link
        href={href}
        scroll={false}
        aria-label={`Otevřít poptávku: ${r.customer_name}`}
        className="absolute inset-0 rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <NewRequestBlock
        start={r.wanted_start ?? undefined}
        end={r.wanted_end ?? undefined}
        day={wanted ? formatRelativeDay(wanted.date, today) : undefined}
        customer={r.customer_name}
        service={r.service_name ?? undefined}
        appear={now.getTime() - new Date(r.created_at).getTime() < JUST_ARRIVED_MS}
        className="pointer-events-none relative transition-colors duration-200 ease-zq group-hover:bg-signal-bg/70"
      >
        {actions && (wanted || !actions.calendar || actions.jobs) && (
          <RequestActions
            variant="compact"
            className="pointer-events-auto"
            slug={actions.slug}
            requestId={r.id}
            wanted={wanted ? { day: wanted.date, minutes: wanted.minutes } : null}
            calendar={actions.calendar}
            jobs={actions.jobs}
            staff={[]}
            today={today}
          />
        )}
      </NewRequestBlock>
    </div>
  )
}
