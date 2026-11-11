import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { CompletedRowActions, NewCompletedButton } from '@/components/admin/completed/completed-dialog'
import PerformanceOverview from '@/components/PerformanceOverview'
import { Money } from '@/components/ws/brand'
import { COMPLETED_SORT, loadCompletedScreen } from '@/lib/admin/completed'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { formatDate } from '@/lib/utils'
import type { CompletedProject, ProjectType } from '@/lib/types'

// Dokončené zakázky (AD07): řazení a stránkování jsou v adrese, data chodí
// po stránkách z databáze. Dřív se tahaly všechny řádky a filtrovalo se
// v prohlížeči.

const PATH = '/dashboard/dokoncene'

/** Náročnost 1–10 je škála, ne stav: roste jí tmavost, ne odstín (AD05). */
function difficultyClass(value: number): string {
  const level = Math.min(10, Math.max(1, Math.round(value)))
  if (level <= 3) return 'bg-navy-50 text-navy-700'
  if (level <= 6) return 'bg-navy-100 text-navy-900'
  if (level <= 8) return 'bg-navy-300 text-navy-950'
  return 'bg-navy-700 text-white'
}

const dash = <span className="text-quiet/50">—</span>

function hours(value: number | null): React.ReactNode {
  return value != null ? <span className="font-num">{Number(value).toLocaleString('cs-CZ')} h</span> : dash
}

const COLUMNS: AdminColumn<CompletedProject>[] = [
  { key: 'nazev', header: 'Název', sortable: true, mobile: 'title', cell: (p) => p.title },
  { key: 'klient', header: 'Klient', sortable: true, cell: (p) => p.client_name ?? dash },
  { key: 'firma', header: 'Firma', cell: (p) => p.company ?? dash },
  {
    key: 'datum',
    header: 'Datum',
    sortable: true,
    cell: (p) => <span className="font-num">{formatDate(p.completed_at)}</span>,
  },
  {
    key: 'castka',
    header: 'Částka',
    sortable: true,
    align: 'right',
    cell: (p) => <Money amount={Number(p.amount)} className="font-semibold" />,
  },
  {
    key: 'zaloha',
    header: 'Záloha',
    sortable: true,
    align: 'right',
    mobile: 'hidden',
    cell: (p) =>
      p.deposit_amount != null && Number(p.deposit_amount) > 0 ? <Money amount={Number(p.deposit_amount)} /> : dash,
  },
  {
    key: 'narocnost',
    header: 'Náročnost',
    sortable: true,
    mobile: 'badge',
    cell: (p) => (
      <span
        title={`Náročnost ${p.difficulty} z 10`}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-num text-xs font-bold ${difficultyClass(p.difficulty)}`}
      >
        {p.difficulty}
      </span>
    ),
  },
  { key: 'cas', header: 'Čas', sortable: true, align: 'right', cell: (p) => hours(p.time_invested) },
  {
    key: 'odhad',
    header: 'Odhad',
    sortable: true,
    align: 'right',
    mobile: 'hidden',
    cell: (p) => hours(p.estimated_hours),
  },
  {
    key: 'poznamka',
    header: 'Poznámka',
    className: 'max-w-[200px]',
    mobile: 'hidden',
    cell: (p) => <span className="block truncate text-quiet">{p.notes ?? ''}</span>,
  },
  {
    key: 'akce',
    header: '',
    align: 'right',
    className: 'w-24',
    mobile: 'hidden',
    cell: (p) => <CompletedRowActions project={p} />,
  },
]

const TABS: { value: ProjectType; label: string }[] = [
  { value: 'client', label: 'Pro klienty' },
  { value: 'personal', label: 'Osobní projekty' },
]

export default async function DokoncenePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const type: ProjectType = searchParams.typ === 'personal' ? 'personal' : 'client'

  const params = parseTableParams(searchParams, {
    allowed: COMPLETED_SORT,
    defaultSort: 'datum',
    pageSize: 50,
    tiebreak: 'created_at',
  })
  const { rows, total, counts, stats, surveys } = await loadCompletedScreen(type, params)
  const links = tableLinks(PATH, searchParams)

  return (
    <PageShell width="table" className="gap-8">
      <PageHeader
        title="Dokončené"
        subtitle="Hotové zakázky a osobní projekty. Částky se promítají do příjmů."
        subtitleFont="sans"
        action={<NewCompletedButton type={type} />}
      />

      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(p) => p.id}
        sort={{ params, links }}
        page={{ params, total, links }}
        toolbar={
          <PillNav
            label="Druh zakázky"
            items={TABS.map((tab) => ({
              key: tab.value,
              label: tab.label,
              // Přepnutí druhu vrací stránkování na začátek, řazení zůstává.
              href: tableHref(PATH, searchParams, { typ: tab.value === 'client' ? null : tab.value, page: null }),
              active: type === tab.value,
              count: counts[tab.value],
            }))}
          />
        }
        empty={{
          title: type === 'client' ? 'Zatím žádná dokončená zakázka' : 'Zatím žádný osobní projekt',
          description:
            type === 'client'
              ? 'Až něco odevzdáte, přidejte to sem. Uvidíte výdělek, odhad proti skutečnosti i hodnocení klienta.'
              : 'Sem patří vlastní aplikace, systémy a automatizace. Uvidíte, kolik času vám zabraly.',
          action: <NewCompletedButton type={type} />,
        }}
      />

      {stats.length > 0 && (
        <div className="border-t border-navy-100 pt-8">
          <PerformanceOverview projects={stats} surveys={surveys} />
        </div>
      )}
    </PageShell>
  )
}
