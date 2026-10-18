import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ConfirmedBlock, EmptyState, SectionLabel } from '@/components/ws/brand'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { plural } from '@/lib/ws/plural'
import type { FocusItem } from '@/lib/ws/today'
import { daysBetween, formatClock, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'
import { CopyOrderLinkButton } from '../copy-order-link'
import { IncomingCard } from './incoming-list'

/**
 * Hlavní věc nahoře na Dnes (RD04): jedna věc, kterou má smysl udělat jako
 * první, a ta jde splnit jedním klikem. Výběr dělá `pickFocus` (lib/ws/today.ts).
 */
export function TodayFocus({
  focus,
  today,
  now,
  hrefs,
  actions,
  orderUrl,
  className,
}: {
  focus: FocusItem
  today: string
  now: Date
  hrefs: { request: (id: string) => string; visit: (id: string) => string; invoices: string }
  /** Potvrzení poptávky jedním klikem; potřebuje vědět, co byznys umí. */
  actions: { slug: string; calendar: boolean; jobs: boolean }
  /** Odkaz na objednání pro prázdný stav; bez něj se nenabízí. */
  orderUrl?: string
  className?: string
}) {
  return (
    <section aria-labelledby="ted" className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 id="ted">
        <SectionLabel>Teď na řadě</SectionLabel>
      </h2>
      <div className="max-w-[720px]">{content()}</div>
    </section>
  )

  function content() {
    switch (focus.kind) {
      case 'request': {
        const r = focus.request
        const arrived = pragueParts(r.created_at)
        return (
          <div className="flex flex-col gap-2.5">
            <IncomingCard item={r} today={today} now={now} href={hrefs.request(r.id)} actions={actions} />
            <p className="text-sm text-quiet">
              Přišla {formatRelativeDay(arrived.date, today)} v <span className="font-num">{formatClock(r.created_at)}</span> a čeká
              na potvrzení.
            </p>
          </div>
        )
      }
      case 'visit': {
        const v = focus.visit
        const day = pragueParts(v.start).date
        return (
          <div className="flex flex-col items-start gap-3">
            <ConfirmedBlock
              className="w-full"
              start={v.start}
              end={v.end}
              customer={v.customer_name}
              service={v.service_name ?? undefined}
            />
            <p className="text-sm text-quiet">
              {day === today && v.start <= now ? 'Právě probíhá.' : 'Nejbližší dnešní termín.'}
            </p>
            <Link href={hrefs.visit(v.id)} scroll={false} className={buttonVariants()}>
              Otevřít termín
            </Link>
          </div>
        )
      }
      case 'invoice': {
        const i = focus.invoice
        const late = daysBetween(i.due_on, today)
        const [, dueMonth, dueDay] = i.due_on.split('-').map(Number)
        const currency = (i.currency === 'EUR' ? 'EUR' : 'CZK') satisfies WsCurrency
        return (
          <div className="flex flex-col items-start gap-3 rounded-chip border border-danger/30 bg-danger/5 p-3">
            <div>
              <p className="font-num text-[11px] font-medium uppercase tracking-[0.08em] text-danger">Po splatnosti</p>
              <p className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">
                Faktura <span className="font-num">{i.number}</span> · {i.customer_name}
              </p>
              <p className="text-sm text-quiet">
                <span className="font-num">{formatMoney(i.amount, { currency })}</span>, splatnost {dueDay}. {dueMonth}., {plural(late, ['den', 'dny', 'dní'])} po termínu.
                {i.total > 1 && ` Dalších po splatnosti: ${i.total - 1}.`}
              </p>
            </div>
            <Link href={hrefs.invoices} className={buttonVariants()}>
              Otevřít faktury
            </Link>
          </div>
        )
      }
      case 'none':
        return (
          <EmptyState
            size="compact"
            title="Teď není co řešit"
            description={
              orderUrl
                ? 'Až přijde poptávka, uvidíte ji tady jako první. Odkaz na objednání můžete dát na web nebo do Instagramu.'
                : 'Až přijde poptávka, uvidíte ji tady jako první.'
            }
            action={orderUrl ? <CopyOrderLinkButton url={orderUrl} variant="outline" /> : undefined}
          />
        )
    }
  }
}
