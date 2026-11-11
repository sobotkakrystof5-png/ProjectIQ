import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { CostRowActions, NewCostButton } from '@/components/admin/costs/cost-dialog'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ws/brand'
import { COST_KIND_FILTERS, COST_SORT, loadCostsScreen, toCostKind, type CostRow } from '@/lib/admin/costs'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { COST_CATEGORY_LABELS, COST_TYPE_LABELS, type CostCategory } from '@/lib/types'

// Náklady (AD07): jeden seznam s filtrem, řazením a stránkováním místo dvou
// ručních tabulek. Součty nahoře počítá databáze a platí pro všechny náklady.

const PATH = '/dashboard/naklady'

const SHORT_CATEGORY: Partial<Record<CostCategory, string>> = {
  client: 'Zakázky',
  personal: 'Osobní',
  all: 'Obecné',
}

const COLUMNS: AdminColumn<CostRow>[] = [
  { key: 'nazev', header: 'Název', sortable: true, mobile: 'title', cell: (cost) => cost.name },
  {
    key: 'castka',
    header: 'Částka',
    sortable: true,
    align: 'right',
    cell: (cost) => <Money amount={Number(cost.amount)} className="font-semibold" />,
  },
  {
    key: 'typ',
    header: 'Jak často',
    sortable: true,
    mobile: 'badge',
    // Druh nákladu je kategorie, ne stav — proto vždy neutrální tón (R-091).
    cell: (cost) => <Badge variant="neutral">{COST_TYPE_LABELS[cost.cost_type]}</Badge>,
  },
  {
    key: 'kategorie',
    header: 'Kam patří',
    sortable: true,
    cell: (cost) => (
      <Badge variant="neutral">
        {SHORT_CATEGORY[cost.category ?? 'all'] ?? COST_CATEGORY_LABELS[cost.category ?? 'all']}
      </Badge>
    ),
  },
  {
    key: 'zakazka',
    header: 'Zakázka',
    sortable: true,
    cell: (cost) =>
      cost.project_id ? (
        <Link href={`/dashboard/${cost.project_id}`} className="text-navy-700 underline-offset-2 hover:underline">
          {cost.project_client_name ?? 'Zakázka'}
        </Link>
      ) : (
        <span className="text-quiet/50">—</span>
      ),
  },
  {
    key: 'popis',
    header: 'Popis',
    className: 'max-w-[220px]',
    mobile: 'hidden',
    cell: (cost) => <span className="block truncate text-quiet">{cost.description ?? ''}</span>,
  },
  {
    key: 'akce',
    header: '',
    align: 'right',
    className: 'w-24',
    mobile: 'hidden',
    cell: (cost) => <CostRowActions cost={cost} />,
  },
]

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-box border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-quiet">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-quiet">{hint}</p>
    </div>
  )
}

export default async function NakladyPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const kind = toCostKind(searchParams.druh)
  const params = parseTableParams(searchParams, {
    allowed: COST_SORT,
    defaultSort: 'castka',
    pageSize: 50,
    tiebreak: 'c.created_at',
  })
  const { rows, total, totals } = await loadCostsScreen(params, kind)
  const links = tableLinks(PATH, searchParams)

  return (
    <PageShell>
      <PageHeader
        title="Náklady"
        subtitle="Fixní a jednorázové výdaje. Promítají se do přehledu ve Financích."
        subtitleFont="sans"
        action={<NewCostButton />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Měsíčně" value={<Money amount={totals.monthly} />} hint="fixní měsíční" />
        <Tile label="Ročně" value={<Money amount={totals.yearly} />} hint="měsíční × 12 + roční" />
        <Tile label="Zakázky" value={<Money amount={totals.client} />} hint="náklady pro klienty" />
        <Tile label="Osobní" value={<Money amount={totals.personal} />} hint="osobní projekty" />
      </div>

      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(cost) => cost.id}
        sort={{ params, links }}
        page={{ params, total, links }}
        toolbar={
          <PillNav
            label="Druh nákladu"
            items={COST_KIND_FILTERS.map((filter) => ({
              key: filter.value,
              label: filter.label,
              href: tableHref(PATH, searchParams, { druh: filter.value === 'vse' ? null : filter.value, page: null }),
              active: kind === filter.value,
              count: totals.counts[filter.value],
            }))}
          />
        }
        empty={{
          title: totals.counts.vse === 0 ? 'Zatím žádné náklady' : 'Tady nic není',
          description:
            totals.counts.vse === 0
              ? 'Přidejte hosting, domény a licence. Uvidíte, kolik vás podnikání stojí měsíčně a ročně.'
              : 'Zkuste jiný druh nákladu.',
          action: totals.counts.vse === 0 ? <NewCostButton /> : undefined,
        }}
      />
    </PageShell>
  )
}
