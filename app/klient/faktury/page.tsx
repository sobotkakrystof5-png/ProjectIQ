import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'
import { requireClient } from '@/lib/portal/context'
import { listClientThreads } from '@/lib/portal/chat'
import { loadClientOverview } from '@/lib/portal/overview'
import type { PortalInvoice } from '@/lib/portal/money'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { InvoiceRow } from '@/components/portal/project-money'
import { formatMoney } from '@/lib/portal/format'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Faktury' }

// Faktury přes všechny zakázky klienta (KP15, KP16). Nahoře kolik zbývá
// a kolik je zaplaceno (jen koruny, stejný výpočet jako admin, R-125), pod
// tím jeden seznam: nejdřív to, co čeká na zaplacení. `?zakazka=` zúží na
// jednu zakázku (odkaz z panelu O zakázce).

const ORDER: Record<PortalInvoice['state'], number> = { overdue: 0, open: 1, paid: 2, cancelled: 3 }

function byUrgency(a: PortalInvoice, b: PortalInvoice): number {
  if (ORDER[a.state] !== ORDER[b.state]) return ORDER[a.state] - ORDER[b.state]
  if (a.state === 'open' || a.state === 'overdue') return (a.dueOn ?? '').localeCompare(b.dueOn ?? '')
  return b.issuedOn.localeCompare(a.issuedOn)
}

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-11 max-w-full items-center truncate rounded-full border px-4 text-sm',
    active ? 'border-navy-700 bg-navy-700 font-semibold text-white' : 'border-navy-100 bg-surface text-ink hover:border-navy-300',
  )

export default async function KlientFakturyPage({ searchParams }: { searchParams: Promise<{ zakazka?: string }> }) {
  const ctx = await requireClient()
  const threads = await listClientThreads(ctx.clientId).catch(() => [])
  const overview = await loadClientOverview(ctx.clientId, ctx.memberId, threads)
  const withMoney = overview.projects.filter((p) => p.money || p.invoices.length > 0)
  const wanted = z.string().uuid().safeParse((await searchParams).zakazka)
  const filter = wanted.success && withMoney.some((p) => p.project.id === wanted.data) ? wanted.data : null
  const shown = filter ? withMoney.filter((p) => p.project.id === filter) : withMoney
  const many = withMoney.length > 1

  const remaining = shown.reduce((sum, p) => sum + (p.money?.remaining ?? 0), 0)
  const paid = shown.reduce((sum, p) => sum + (p.money?.paid ?? 0), 0)
  const hasTotals = shown.some((p) => p.money)
  const invoices = shown
    .flatMap((p) => p.invoices.map((invoice) => ({ invoice, projectName: p.project.name })))
    .sort((a, b) => byUrgency(a.invoice, b.invoice))
  const otherCurrency = invoices.some((x) => x.invoice.currency !== 'CZK')

  return (
    <ClientShell ctx={ctx} section="faktury" threads={threads}>
      <ClientPageHeader title="Faktury" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {withMoney.length === 0 ? (
            <p className="mt-6 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">
              Zatím tu žádná faktura není. Jakmile nějakou vystavím, najdete ji tady i s QR kódem k zaplacení.
            </p>
          ) : (
            <>
              {many && (
                <nav aria-label="Zakázky" className="mt-6 flex flex-wrap gap-2">
                  <Link href="/klient/faktury" aria-current={filter === null ? 'page' : undefined} className={chip(filter === null)}>
                    Všechny zakázky
                  </Link>
                  {withMoney.map((p) => (
                    <Link
                      key={p.project.id}
                      href={`/klient/faktury?zakazka=${p.project.id}`}
                      aria-current={filter === p.project.id ? 'page' : undefined}
                      className={chip(filter === p.project.id)}
                    >
                      {p.project.name}
                    </Link>
                  ))}
                </nav>
              )}

              {hasTotals && (
                <section aria-label="Souhrn" className="mt-6 rounded-box border border-navy-100 bg-surface p-5">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-sm text-quiet">Zbývá doplatit</dt>
                      <dd className="font-num text-2xl font-semibold text-ink">{formatMoney(remaining)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-sm text-quiet">Zaplaceno</dt>
                      <dd className="font-num text-2xl font-semibold text-ink">{formatMoney(paid)}</dd>
                    </div>
                  </dl>
                  {many && !filter && shown.filter((p) => p.money).length > 1 && (
                    <ul className="mt-4 space-y-1 border-t border-navy-100 pt-3 text-sm">
                      {shown.filter((p) => p.money).map((p) => (
                        <li key={p.project.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate text-ink">{p.project.name}</span>
                          <span className="shrink-0 font-num text-quiet">
                            {p.money!.remaining === 0 ? 'zaplaceno' : `zbývá ${formatMoney(p.money!.remaining)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {remaining === 0 && <p className="mt-3 text-sm text-quiet">Všechno je zaplacené. Děkuji.</p>}
                  {otherCurrency && <p className="mt-3 text-xs text-quiet">Faktury v jiné měně než v korunách se do součtu nepočítají.</p>}
                </section>
              )}

              {invoices.length > 0 ? (
                <ul className="mt-6 space-y-3">
                  {invoices.map((x) => (
                    <InvoiceRow key={x.invoice.id} invoice={x.invoice} projectName={many ? x.projectName : undefined} />
                  ))}
                </ul>
              ) : (
                <p className="mt-6 text-sm text-quiet">Faktury tu najdete, jakmile je vystavím.</p>
              )}
            </>
          )}
        </div>
      </div>
    </ClientShell>
  )
}
