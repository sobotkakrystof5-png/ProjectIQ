import type { Metadata } from 'next'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { formatPhone } from '@/components/ws/app/customer-summary'
import { OutreachPanel } from '@/components/ws/customers/outreach-panel'
import { SegmentBadge } from '@/components/ws/customers/segment-badge'
import { EmptyState, Money } from '@/components/ws/brand'
import { Input } from '@/components/ui/input'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getCustomersList, nextStepFor, SEGMENT_FILTERS, type CustomerListItem, type NextStep } from '@/lib/ws/customers'
import { hrefWith } from '@/lib/ws/detail-param'
import { navHref } from '@/lib/ws/nav'
import { getDrafts, getOutreachSuggestions } from '@/lib/ws/outreach'
import { formatClock, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { SEGMENT_LABELS, type SegmentKey } from '@/lib/ws/today'
import { cn } from '@/lib/ws/utils'

export const metadata: Metadata = { title: 'Zákazníci' }

type SearchParams = Record<string, string | string[] | undefined>

/** Skupina v URL česky (`?skupina=spici`), v DB anglicky. */
const SEGMENT_SLUGS: Record<SegmentKey, string> = {
  new: 'novi',
  regular: 'stali',
  one_time: 'jednorazovi',
  dormant: 'spici',
  ended: 'ukonceni',
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * Zákazníci (S12, mockup C2): tabulka se skupinami, razítky a útratou,
 * filtry podle skupin, hledání a vpravo panel „Komu napsat“. Detail
 * zákazníka v pravém panelu (`?detail=zakaznik:<id>`).
 */
export default async function CustomersPage(
  props: {
    params: Promise<{ business: string }>
    searchParams: Promise<SearchParams>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, 'zakaznici')
  const segmentParam = first(searchParams.skupina)
  const segment = (Object.keys(SEGMENT_SLUGS) as SegmentKey[]).find((k) => SEGMENT_SLUGS[k] === segmentParam) ?? null
  const query = (first(searchParams.hledat) ?? '').slice(0, 80)

  const [list, suggestions, drafts] = await Promise.all([
    getCustomersList(ctx, business, { segment, query, now }),
    getOutreachSuggestions(ctx, business, now),
    getDrafts(ctx, business),
  ])
  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)
  const filtered = Boolean(segment || query)

  return (
    <PageShell>
      <PageHeader title="Zákazníci" accent="se vracejí." />

      <div data-detail-grid className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PillNav
            label="Skupiny zákazníků"
            items={[
              { key: 'all', label: 'Všichni', href: link({ skupina: null, detail: null }), active: !segment, count: list.counts.all },
              ...SEGMENT_FILTERS.map((key) => ({
                key,
                label: SEGMENT_LABELS[key],
                href: link({ skupina: SEGMENT_SLUGS[key], detail: null }),
                active: segment === key,
                count: list.counts[key],
              })),
            ]}
          />

          <form action={pathname} className="relative" role="search">
            {segment && <input type="hidden" name="skupina" value={SEGMENT_SLUGS[segment]} />}
            <Search aria-hidden size={18} strokeWidth={1.5} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-quiet" />
            <label htmlFor="hledat-zakaznika" className="sr-only">
              Hledat zákazníka
            </label>
            <Input
              id="hledat-zakaznika"
              name="hledat"
              type="search"
              defaultValue={query}
              maxLength={80}
              placeholder="Jméno, telefon nebo e-mail"
              className="pl-10"
            />
          </form>

          {list.items.length === 0 ? (
            filtered ? (
              <EmptyState
                title="Nikoho takového nemáme"
                description="Zkuste jiné jméno nebo telefon, případně zrušte filtr."
                action={
                  <Link href={pathname} className="text-[15px] font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
                    Zobrazit všechny
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="Zatím tu nikdo není"
                description="Zákazník se tu objeví s první poptávkou nebo rezervací. Odkaz na objednání dejte na web nebo do Instagramu."
              />
            )
          ) : (
            <>
              <CustomerTable items={list.items} today={today} hrefFor={(id) => link({ detail: `zakaznik:${id}` })} />
              {list.truncated && (
                <p className="text-sm text-quiet">Ukazujeme prvních 300 zákazníků. Další najdete hledáním nebo filtrem.</p>
              )}
            </>
          )}
        </div>

        {/* Při otevřeném detailu na širokém displeji se schová (R-057, app/ws-tokens.css). */}
        <div data-detail-hide className="min-w-0">
          <OutreachPanel
            slug={business.slug}
            suggestions={suggestions}
            drafts={drafts}
            hrefFor={(customerId, kind) => link({ detail: `zprava:${customerId}:${kind}` })}
          />
        </div>
      </div>

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </PageShell>
  )
}

function stepText(step: NextStep, today: string): string {
  if (!step) return '—'
  switch (step.kind) {
    case 'reward':
      return 'Odměna připravena'
    case 'booked': {
      const p = pragueParts(step.at)
      return `Termín ${formatRelativeDay(p.date, today)} v ${formatClock(step.at)}`
    }
    case 'winback':
      return 'Pozvat zpět'
    case 'almost':
      return 'Příště plná karta'
    case 'second_visit':
      return 'Pozvat znovu'
    case 'first_visit':
      return 'Čeká na první návštěvu'
  }
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1.5fr)_128px_72px_104px_96px_minmax(0,1.2fr)] gap-3'

function CustomerTable({ items, today, hrefFor }: { items: CustomerListItem[]; today: string; hrefFor: (id: string) => string }) {
  const lastText = (d: Date | null) => (d ? formatRelativeDay(pragueParts(d).date, today) : '—')
  return (
    <div className="overflow-hidden rounded-panel border bg-surface">
      {/* Počítač: řádky v mřížce (celý řádek je odkaz na detail) */}
      <div className="hidden md:block">
        <div
          aria-hidden
          className={cn(ROW_GRID, 'border-b px-5 py-3 font-num text-[11px] uppercase tracking-[0.08em] text-quiet')}
        >
          <span>Jméno</span>
          <span>Skupina</span>
          <span>Razítka</span>
          <span>Naposledy</span>
          <span className="text-right">Útrata</span>
          <span>Další krok</span>
        </div>
        <ul className="divide-y">
          {items.map((c) => {
            const step = nextStepFor(c)
            return (
              <li key={c.id}>
                <Link
                  href={hrefFor(c.id)}
                  scroll={false}
                  className={cn(
                    ROW_GRID,
                    'min-h-[60px] items-center px-5 py-3 transition-colors hover:bg-navy-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-navy-900/60',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{c.name}</span>
                    {(c.phone || c.email) && (
                      <span className="block truncate font-num text-xs text-quiet">{c.phone ? formatPhone(c.phone) : c.email}</span>
                    )}
                  </span>
                  <span>
                    <SegmentBadge segment={c.segment} />
                  </span>
                  <span className="font-num text-sm">
                    {c.card ? (
                      <span className={cn(c.card.full && 'font-semibold text-navy-700 dark:text-navy-200')}>
                        {c.card.stamps}/{c.card.needed}
                      </span>
                    ) : (
                      <span className="text-quiet">—</span>
                    )}
                  </span>
                  <span className="font-num text-sm text-ink">{lastText(c.lastVisit)}</span>
                  <span className="text-right text-sm">{c.spend > 0 ? <Money amount={c.spend} /> : <span className="text-quiet">—</span>}</span>
                  <span className={cn('truncate text-sm', step?.kind === 'reward' ? 'font-semibold text-navy-700 dark:text-navy-200' : 'text-quiet')}>
                    {stepText(step, today)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Telefon: seznam */}
      <ul className="divide-y md:hidden">
        {items.map((c) => {
          const step = nextStepFor(c)
          return (
            <li key={c.id}>
              <Link href={hrefFor(c.id)} scroll={false} className="flex min-h-[64px] flex-col gap-1.5 px-4 py-3 hover:bg-navy-50/60">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                  <SegmentBadge segment={c.segment} className="shrink-0" />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-quiet">
                  <span className="font-num">{lastText(c.lastVisit)}</span>
                  {c.card && (
                    <span className="font-num">
                      {c.card.stamps}/{c.card.needed}
                    </span>
                  )}
                  {c.spend > 0 && <Money amount={c.spend} />}
                  {step && <span className={cn(step.kind === 'reward' && 'font-semibold text-navy-700')}>{stepText(step, today)}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
