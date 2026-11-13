import Link from 'next/link'
import { AlertTriangle, FilePlus2, Paperclip } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav, Toolbar } from '@/components/ws/app/toolbar'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { InvoiceDropZone, NewInvoiceButton } from '@/components/admin/invoices/invoice-drop-zone'
import { TableSearch } from '@/components/admin/table-search'
import { Badge } from '@/components/ui/badge'
import { PaidCell } from '@/components/admin/invoices/mark-paid'
import { invoiceTone, toneVariant } from '@/lib/admin-status'
import {
  INVOICE_SORT,
  INVOICE_STATUS_FILTERS,
  loadInvoiceRegistry,
  toInvoiceStatus,
  type CurrencyTotal,
} from '@/lib/admin/invoices'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { InvoiceRegistryItem } from '@/app/dashboard/finance/invoice-actions'

/**
 * Evidence faktur. Záměrně ukazuje doklady ze všech zdrojů poptávek —
 * fakturuje jedno IČO pod jedním přiznáním, takže rozdělený archiv by
 * znamenal, že by šlo fakturu hledat na špatném místě.
 *
 * Od AD07 filtruje, řadí, stránkuje i sčítá databáze. Součty nahoře platí
 * pro celý filtr, ne jen pro zobrazenou stránku.
 */

const PATH = '/dashboard/faktury'

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

/** Součty po měnách vedle sebe — koruny a eura se nesčítají (R-011). */
function sums(totals: CurrencyTotal[], pick: (t: CurrencyTotal) => number): string {
  const parts = totals.filter((t) => pick(t) !== 0).map((t) => money(pick(t), t.currency))
  return parts.length ? parts.join(' · ') : money(0, totals[0]?.currency ?? 'CZK')
}

function formatDay(value: string | null): React.ReactNode {
  if (!value) return <span className="text-quiet/50">—</span>
  const [y, m, d] = value.split('-').map(Number)
  return <span className="font-num">{new Date(y, m - 1, d).toLocaleDateString('cs-CZ')}</span>
}

function isOverdue(invoice: InvoiceRegistryItem, today: string): boolean {
  return invoice.paid_on === null && invoice.cancelled_at === null && invoice.due_on !== null && invoice.due_on < today
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-box border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-quiet">{label}</p>
      <p className="mt-0.5 font-num text-[17px] font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-quiet">{hint}</p>}
    </div>
  )
}

function columns(today: string): AdminColumn<InvoiceRegistryItem>[] {
  return [
    {
      key: 'cislo',
      header: 'Číslo',
      sortable: true,
      mobile: 'title',
      cell: (invoice) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-num font-semibold">{invoice.invoice_number}</span>
          {invoice.has_pdf && (
            <Paperclip size={13} strokeWidth={1.5} className="text-quiet" aria-label="Má přiložené PDF" />
          )}
        </span>
      ),
    },
    {
      key: 'stav',
      header: 'Stav',
      mobile: 'badge',
      cell: (invoice) => {
        const overdue = isOverdue(invoice, today)
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {/* Stav i tlačítko „Zaplaceno" sdílejí optimistický stav (AD08). */}
            <PaidCell
              invoiceId={invoice.id}
              paidOn={invoice.paid_on}
              overdue={overdue}
              todayIso={today}
              cancelled={invoice.cancelled_at !== null}
            />
            {invoice.duplicate_risk && (
              <Badge
                variant="signal"
                title="Zakázka má v ledgeru i vlastní příjem. Zkontrolujte, že se stejné peníze nezapočítaly dvakrát."
              >
                <AlertTriangle size={10} strokeWidth={1.5} aria-hidden />
                Zkontrolovat příjem
              </Badge>
            )}
          </span>
        )
      },
    },
    {
      key: 'klient',
      header: 'Klient',
      sortable: true,
      cell: (invoice) => {
        const client = invoice.client_name ?? invoice.project_client_name
        return (
          <span className="block min-w-0">
            <span className="block truncate">{client ?? 'Bez zakázky'}</span>
            {invoice.project_description && (
              <span className="block truncate text-xs text-quiet">{invoice.project_description}</span>
            )}
          </span>
        )
      },
    },
    { key: 'vystaveno', header: 'Vystaveno', sortable: true, cell: (invoice) => formatDay(invoice.issued_on) },
    {
      key: 'splatnost',
      header: 'Splatnost',
      sortable: true,
      mobile: 'hidden',
      cell: (invoice) => formatDay(invoice.due_on),
    },
    { key: 'zaplaceno', header: 'Zaplaceno', sortable: true, cell: (invoice) => formatDay(invoice.paid_on) },
    {
      key: 'castka',
      header: 'Částka',
      sortable: true,
      align: 'right',
      cell: (invoice) => (
        <span className="whitespace-nowrap font-num font-semibold tabular-nums">
          {money(invoice.amount, invoice.currency)}
        </span>
      ),
    },
  ]
}

export default async function FakturyPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const status = toInvoiceStatus(searchParams.stav)
  const rawYear = Number.parseInt(Array.isArray(searchParams.rok) ? searchParams.rok[0] : (searchParams.rok ?? ''), 10)
  const year = Number.isFinite(rawYear) && rawYear > 1990 && rawYear < 2200 ? rawYear : null
  const query = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? ''

  const params = parseTableParams(searchParams, {
    allowed: INVOICE_SORT,
    defaultSort: 'vystaveno',
    pageSize: 50,
    tiebreak: 'i.created_at',
  })
  const screen = await loadInvoiceRegistry(params, { year, status, query })
  const links = tableLinks(PATH, searchParams)
  // Pražský den, ne UTC: `toISOString()` je mezi 23:00 a půlnocí o den vedle
  // a tohle datum se od AD08 zapisuje jako datum zaplacení faktury.
  const today = getPragueTodayISO()
  const overdue = screen.totals.reduce((sum, t) => sum + t.overdueCount, 0)
  const outstandingCount = screen.totals.reduce((sum, t) => sum + t.outstandingCount, 0)
  const paidCount = screen.totals.reduce((sum, t) => sum + t.paidCount, 0)
  const filtered = year !== null || status !== 'vse' || query.trim() !== ''

  return (
    <PageShell width="wide">
      <PageHeader
        title="Faktury"
        subtitle="Evidence všech faktur. Klikněte na fakturu pro údaje a PDF."
        subtitleFont="sans"
        action={
          <>
            {/* Hlavní akce je od AD12 vystavení; nahrání cizího PDF zůstává vedle (a dál jde i přetažením). */}
            <Link
              href="/dashboard/faktury/nova"
              className="inline-flex h-11 items-center gap-2 rounded-chip bg-navy-700 px-5 text-[15px] font-medium text-white transition-colors hover:bg-navy-800"
            >
              <FilePlus2 size={16} strokeWidth={1.75} />
              Vystavit fakturu
            </Link>
            <NewInvoiceButton projects={screen.projects} />
          </>
        }
      />

      <InvoiceDropZone projects={screen.projects}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Faktur"
              value={String(screen.total)}
              hint={filtered ? `z ${screen.grandTotal} v evidenci` : undefined}
            />
            <Tile label="Vyfakturováno" value={sums(screen.totals, (t) => t.total)} />
            <Tile label="Zaplaceno" value={sums(screen.totals, (t) => t.paid)} hint={`${paidCount} faktur`} />
            <Tile
              label="Nezaplaceno"
              value={sums(screen.totals, (t) => t.outstanding)}
              hint={overdue > 0 ? `${overdue} po splatnosti` : `${outstandingCount} pohledávek`}
            />
          </div>

          <DataTable
            rows={screen.rows}
            columns={columns(today)}
            rowKey={(invoice) => invoice.id}
            href={(invoice) => `/dashboard/faktury/${invoice.id}`}
            sort={{ params, links }}
            page={{ params, total: screen.total, links }}
            toolbar={
              <Toolbar className="w-full">
                <TableSearch
                  action={PATH}
                  searchParams={searchParams}
                  placeholder="Hledat podle čísla, klienta, zakázky, IČO…"
                />
                <PillNav
                  label="Stav faktury"
                  variant="segmented"
                  items={INVOICE_STATUS_FILTERS.map((filter) => ({
                    key: filter.value,
                    label: filter.label,
                    href: tableHref(PATH, searchParams, {
                      stav: filter.value === 'vse' ? null : filter.value,
                      page: null,
                    }),
                    active: status === filter.value,
                  }))}
                />
                {screen.years.length > 1 && (
                  <PillNav
                    label="Rok vystavení"
                    items={[
                      {
                        key: 'vse',
                        label: 'Všechny roky',
                        href: tableHref(PATH, searchParams, { rok: null, page: null }),
                        active: year === null,
                      },
                      ...screen.years.map((value) => ({
                        key: String(value),
                        label: String(value),
                        href: tableHref(PATH, searchParams, { rok: value, page: null }),
                        active: year === value,
                      })),
                    ]}
                  />
                )}
              </Toolbar>
            }
            empty={{
              title: screen.grandTotal === 0 ? 'Zatím žádná faktura' : 'Nic neodpovídá filtru',
              description:
                screen.grandTotal === 0
                  ? 'Přetáhněte sem PDF odkudkoli — přečte ho AI a předvyplní pole. Nebo fakturu zadejte ručně.'
                  : 'Zkuste jiný rok, stav nebo hledaný výraz.',
              action: screen.grandTotal === 0 ? <NewInvoiceButton projects={screen.projects} /> : undefined,
            }}
          />
        </div>
      </InvoiceDropZone>
    </PageShell>
  )
}
