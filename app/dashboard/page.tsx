import Link from 'next/link'
import { ArrowRight, CalendarClock, FileWarning, MessageSquarePlus, PauseCircle, ClipboardCheck } from 'lucide-react'
import { loadTodayData } from '@/lib/admin-today-queries'
import { isTodayEmpty, pickFocus, daysBetween } from '@/lib/admin-today'
import { formatDate, formatDateTime } from '@/lib/utils'

// Dnes (KP02): co je teď potřeba udělat. Jedna hlavní věc nahoře, zbytek pod ní.
// Seznam všech zakázek je na /dashboard/zakazky.

export const dynamic = 'force-dynamic'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-box border border-navy-100 bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-navy-500">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

const rowClass = 'flex min-h-[44px] items-center justify-between gap-3 rounded-chip px-3 py-2 text-sm hover:bg-navy-50'

export default async function TodayPage() {
  const data = await loadTodayData()
  const now = new Date()
  const focus = pickFocus(data, now)

  return (
    <div className="space-y-6 font-ws">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dnes</h1>
        <p className="mt-0.5 text-sm text-quiet">{formatDate(now.toISOString())}</p>
      </header>

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
        <div className="rounded-panel border border-navy-100 bg-surface p-6">
          <p className="text-lg font-semibold text-ink">Všechno je vyřízené.</p>
          <p className="mt-1 text-sm text-quiet">Žádný požadavek, hlášení ani faktura po splatnosti nečeká.</p>
          <Link
            href="/dashboard/zakazky"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300"
          >
            Projít zakázky
          </Link>
        </div>
      )}

      {!isTodayEmpty(data) && (
        <div className="grid gap-4 lg:grid-cols-2">
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
                      <span className="shrink-0 text-xs text-quiet">{formatDate(r.createdAt)}</span>
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
                        {d.count}× {d.sensitive > 0 ? `(${d.sensitive} k úpravě)` : ''}
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
                      <span className="shrink-0 text-xs text-quiet">{formatDateTime(e.at)}</span>
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
                      <span className="shrink-0 text-xs text-quiet">{daysBetween(s.updatedAt, now)} dní</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
