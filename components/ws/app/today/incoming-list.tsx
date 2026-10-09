import Link from 'next/link'
import { NewRequestBlock, SectionLabel } from '@/components/ws/brand'
import type { IncomingRequest } from '@/lib/ws/today'
import { formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

const JUST_ARRIVED_MS = 15 * 60_000

/** Příchozí: nové poptávky, nejnovější nahoře. Klik otevře poptávku v pravém panelu. */
export function IncomingList({
  items,
  total,
  today,
  now,
  hrefFor,
  allHref,
  className,
}: {
  items: IncomingRequest[]
  total: number
  today: string
  now: Date
  hrefFor: (id: string) => string
  allHref: string
  className?: string
}) {
  return (
    <section aria-labelledby="prichozi" className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="prichozi">
          <SectionLabel>Příchozí</SectionLabel>
        </h2>
        {total > 0 && <span className="font-num text-xs text-quiet">{total}</span>}
      </div>

      {items.length === 0 ? (
        <div className="rounded-box border border-dashed px-4 py-6 text-[15px] text-quiet">
          Žádná nová poptávka. Až přijde z webu, ukáže se tady a v kalendáři.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={hrefFor(r.id)}
                scroll={false}
                className="block rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <NewRequestBlock
                  start={r.wanted_start ?? undefined}
                  end={r.wanted_end ?? undefined}
                  day={r.wanted_start ? formatRelativeDay(pragueParts(r.wanted_start).date, today) : undefined}
                  customer={r.customer_name}
                  service={r.service_name ?? undefined}
                  appear={now.getTime() - new Date(r.created_at).getTime() < JUST_ARRIVED_MS}
                  className="transition-colors duration-200 ease-zq hover:bg-signal-bg/70"
                />
              </Link>
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
