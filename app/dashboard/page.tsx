import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import Link from 'next/link'
import { ArrowRight, CalendarClock, FileWarning, MessageSquarePlus, PauseCircle, ClipboardCheck, Wallet } from 'lucide-react'
import { loadTodayScreen } from '@/lib/admin-today-queries'
import { isTodayEmpty, pickFocus, daysBetween, type MonthMoney } from '@/lib/admin-today'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { BASE_CURRENCY, foreignLabel, formatMoney } from '@/lib/money-currency'
import { Card } from '@/components/admin/card'
import { EmptyState, SectionLabel } from '@/components/ws/brand'

// Dnes (KP02): co je teď potřeba udělat. Jedna hlavní věc nahoře, zbytek pod ní.
// Seznam všech zakázek je na /dashboard/zakazky. Vpravo peníze za tenhle měsíc
// (AD03) — čísla ze stejných dotazů jako Finance › Podnikání.

export const dynamic = 'force-dynamic'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <SectionLabel as="h2" className="mb-3 flex items-center gap-2">
        <span className="text-navy-500">{icon}</span>
        {title}
      </SectionLabel>
      {children}
    </Card>
  )
}

const rowClass = 'flex min-h-[44px] items-center justify-between gap-3 rounded-chip px-3 py-2 text-sm hover:bg-navy-50'

const formatCZK = (amount: number): string => formatMoney(amount, BASE_CURRENCY)

const invoicesLabel = (count: number): string =>
  count === 1 ? '1 faktura' : count >= 2 && count <= 4 ? `${count} faktury` : `${count} faktur`

/** Peníze za tenhle měsíc. Informace, ne akce — proto bez tlačítka. */
function MonthMoneyPanel({ money, now }: { money: MonthMoney; now: Date }) {
  const monthName = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(now)
  return (
    <Card className="p-5 lg:self-start">
      <SectionLabel as="h2" className="flex items-center gap-2">
        <span className="text-navy-500">
          <Wallet size={16} strokeWidth={1.5} aria-hidden="true" />
        </span>
        Jak se daří tenhle měsíc
      </SectionLabel>
      <p className="mt-0.5 text-xs text-quiet">{monthName}</p>

      <p className="mt-4 font-num text-2xl font-semibold leading-none text-ink">{formatCZK(money.income)}</p>
      <p className="mt-1.5 text-xs text-quiet">
        přišlo na účet, z toho přiznaných{' '}
        <span className="font-num text-ink">{formatCZK(money.declaredIncome)}</span>
      </p>
      {money.foreignIncome.length > 0 && (
        <p className="mt-1 text-xs text-quiet">
          Mimo součet <span className="font-num text-ink">{foreignLabel(money.foreignIncome)}</span> — jiná měna se
          ke korunám nepřičítá.
        </p>
      )}

      <dl className="mt-4 space-y-2 border-t border-navy-100 pt-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-quiet">Nezaplacené faktury</dt>
          <dd className="text-right">
            {money.unpaidInvoices.length === 0 ? (
              <span className="text-quiet">Všechno zaplacené</span>
            ) : (
              money.unpaidInvoices.map((line) => (
                <span key={line.currency} className="block">
                  <span className="font-num text-ink">{formatMoney(line.amount, line.currency)}</span>
                  <span className="block text-xs text-quiet">
                    {invoicesLabel(line.count)}
                    {line.overdue > 0 && <span className="text-danger"> · {line.overdue} po splatnosti</span>}
                  </span>
                </span>
              ))
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-quiet">Daň a odvody za {money.year}</dt>
          <dd className="font-num text-ink">{formatCZK(money.levies)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-quiet">Měsíčně odkládat</dt>
          <dd className="font-num text-ink">{formatCZK(money.monthlyReserve)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-quiet">
        Odhad z přiznaných příjmů za celý rok ({formatCZK(money.yearDeclaredIncome)}).
        {!money.ratesMatchYear && ` Sazby jsou za rok ${money.ratesYear}.`}
      </p>

      <Link
        href="/dashboard/finance?tab=podnikani"
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-navy-700 hover:text-navy-900"
      >
        Otevřít Finance a daně
        <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </Card>
  )
}

export default async function TodayPage() {
  // Jedno kolo do databáze: věci k vyřízení i peníze jedou v jedné dávce.
  const { data, money } = await loadTodayScreen()
  const now = new Date()
  const focus = pickFocus(data, now)
  const empty = isTodayEmpty(data)

  return (
    <PageShell width="wide">
      <PageHeader title="Dnes" subtitle={formatDate(now.toISOString())} />

      {focus ? (
        <Link
          href={focus.href}
          className="group block rounded-panel bg-navy-800 p-6 text-white transition-colors hover:bg-navy-900"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-200">Nejdřív tohle</p>
          <p className="mt-2 text-xl font-semibold leading-snug">{focus.title}</p>
          <p className="mt-1 text-sm text-navy-200">{focus.detail}</p>
          <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-chip bg-signal px-4 text-sm font-semibold text-signal-ink">
            {focus.cta}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
        </Link>
      ) : (
        <EmptyState
          title="Všechno je vyřízené"
          description="Žádný požadavek, hlášení ani faktura po splatnosti nečeká."
          action={
            <Link
              href="/dashboard/zakazky"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-navy-50"
            >
              Projít zakázky
            </Link>
          }
        />
      )}

      <div className={cn('grid gap-4', !empty && 'lg:grid-cols-3')}>
        {!empty && (
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
            {data.requests.length > 0 && (
              <Section title="Požadavky klientů" icon={<MessageSquarePlus size={16} strokeWidth={1.5} aria-hidden="true" />}>
                <ul>
                  {data.requests.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link href={r.href} className={rowClass}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{r.clientName}</span>
                          {r.summary && <span className="block truncate text-xs text-quiet">{r.summary}</span>}
                        </span>
                        <span className="shrink-0 font-num text-xs text-quiet">{formatDate(r.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.drafts.length > 0 && (
              <Section title="Hlášení ke schválení" icon={<ClipboardCheck size={16} strokeWidth={1.5} aria-hidden="true" />}>
                <ul>
                  {data.drafts.slice(0, 5).map((d) => (
                    <li key={d.projectId}>
                      <Link href={d.href} className={rowClass}>
                        <span className="truncate font-medium text-ink">{d.clientName}</span>
                        <span className="shrink-0 text-xs text-quiet">
                          <span className="font-num">{d.count}×</span>{' '}
                          {d.sensitive > 0 ? `(${d.sensitive} k úpravě)` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.overdueInvoices.length > 0 && (
              <Section title="Faktury po splatnosti" icon={<FileWarning size={16} strokeWidth={1.5} aria-hidden="true" />}>
                <ul>
                  {data.overdueInvoices.slice(0, 5).map((i) => (
                    <li key={i.id}>
                      <Link href="/dashboard/faktury" className={rowClass}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{i.number}</span>
                          <span className="block truncate text-xs text-quiet">
                            {i.clientName ?? 'Bez jména'} · {daysBetween(i.dueOn, now)} dní po splatnosti
                          </span>
                        </span>
                        <span className="shrink-0 font-num text-xs text-ink">{formatMoney(i.amount, i.currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.upcoming.length > 0 && (
              <Section title="Nejbližší schůzky a hovory" icon={<CalendarClock size={16} strokeWidth={1.5} aria-hidden="true" />}>
                <ul>
                  {data.upcoming.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      <Link href={e.href} className={rowClass}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{e.label}</span>
                          {e.detail && <span className="block truncate text-xs text-quiet">{e.detail}</span>}
                        </span>
                        <span className="shrink-0 font-num text-xs text-quiet">{formatDateTime(e.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.stale.length > 0 && (
              <Section title="Zakázky bez pohybu" icon={<PauseCircle size={16} strokeWidth={1.5} aria-hidden="true" />}>
                <ul>
                  {data.stale.map((s) => (
                    <li key={s.id}>
                      <Link href={s.href} className={rowClass}>
                        <span className="truncate font-medium text-ink">{s.clientName}</span>
                        <span className="shrink-0 text-xs text-quiet"><span className="font-num">{daysBetween(s.updatedAt, now)}</span> dní</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}

        <MonthMoneyPanel money={money} now={now} />
      </div>
    </PageShell>
  )
}
