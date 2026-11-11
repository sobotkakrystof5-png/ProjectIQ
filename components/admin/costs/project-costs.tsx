import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { CostRowActions, NewCostButton } from '@/components/admin/costs/cost-dialog'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ws/brand'
import { COST_TYPE_LABELS, type Cost } from '@/lib/types'

/**
 * Náklady jedné zakázky — panel na detailu (AD07).
 *
 * Proti obrazovce Náklady je to krátký seznam bez řazení a stránkování:
 * nákladů na jedné zakázce bývá pár a filtr by tu byl k ničemu. Formulář
 * i mazání jsou stejné (`cost-dialog`).
 */
export function ProjectCosts({ costs, projectId }: { costs: Cost[]; projectId: string }) {
  const total = costs.reduce((sum, cost) => sum + Number(cost.amount), 0)

  const columns: AdminColumn<Cost>[] = [
    { key: 'nazev', header: 'Název', mobile: 'title', cell: (cost) => cost.name },
    {
      key: 'castka',
      header: 'Částka',
      align: 'right',
      cell: (cost) => <Money amount={Number(cost.amount)} className="font-semibold" />,
    },
    {
      key: 'typ',
      header: 'Jak často',
      mobile: 'badge',
      cell: (cost) => <Badge variant="neutral">{COST_TYPE_LABELS[cost.cost_type]}</Badge>,
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

  return (
    <DataTable
      rows={costs}
      columns={columns}
      rowKey={(cost) => cost.id}
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <NewCostButton projectId={projectId} variant="outline" />
          {costs.length > 0 && (
            <p className="text-sm text-quiet">
              Celkem <Money amount={total} className="font-semibold text-ink" />
            </p>
          )}
        </div>
      }
      empty={{
        title: 'Zatím žádné náklady',
        description: 'Přidejte, co vás na téhle zakázce stálo peníze. Promítne se to do cash flow ve Financích.',
        action: <NewCostButton projectId={projectId} variant="outline" />,
      }}
    />
  )
}
