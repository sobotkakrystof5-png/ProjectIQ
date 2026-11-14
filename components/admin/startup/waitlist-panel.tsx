import { CheckCircle2, Clock } from 'lucide-react'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { TableSearch } from '@/components/admin/table-search'
import { WaitlistActions } from '@/components/admin/startup/waitlist-actions'
import { Badge } from '@/components/ui/badge'
import { Toolbar } from '@/components/ws/app/toolbar'
import { loadWaitlist, WAITLIST_SORT } from '@/lib/admin/waitlist'
import { parseTableParams, tableLinks, type SearchParamsLike } from '@/lib/admin-table'
import type { WaitlistEntry } from '@/lib/types'

/**
 * Waitlist jednoho startupového projektu (AD07). Serverová tabulka
 * s hledáním, řazením a stránkováním v adrese; klientské jsou jen akce.
 */

const LOCALE_LABELS: Record<string, string> = { cs: 'čeština', sk: 'slovenština', en: 'angličtina', de: 'němčina' }

const COLUMNS: AdminColumn<WaitlistEntry>[] = [
  {
    key: 'jmeno',
    header: 'Jméno',
    sortable: true,
    mobile: 'title',
    cell: (entry) => entry.name ?? <span className="text-quiet">—</span>,
  },
  { key: 'email', header: 'E-mail', sortable: true, cell: (entry) => <span className="break-all">{entry.email}</span> },
  {
    key: 'jazyk',
    header: 'Jazyk',
    sortable: true,
    mobile: 'hidden',
    cell: (entry) => <span className="text-quiet">{LOCALE_LABELS[entry.locale] ?? entry.locale}</span>,
  },
  {
    key: 'zapsan',
    header: 'Zapsán',
    sortable: true,
    cell: (entry) => <span className="font-num">{new Date(entry.created_at).toLocaleDateString('cs-CZ')}</span>,
  },
  {
    key: 'stav',
    header: 'Stav',
    sortable: true,
    mobile: 'badge',
    // „Čeká na e-mail" je to jediné, co volá po akci — proto signální tón (R-091).
    cell: (entry) =>
      entry.launch_notified ? (
        <Badge variant="strong">
          <CheckCircle2 size={10} strokeWidth={1.5} aria-hidden />
          E-mail odešel
        </Badge>
      ) : (
        <Badge variant="signal">
          <Clock size={10} strokeWidth={1.5} aria-hidden />
          Čeká
        </Badge>
      ),
  },
]

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-box border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-quiet">{label}</p>
      <p className="mt-0.5 font-num text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-quiet">{hint}</p>}
    </div>
  )
}

export async function WaitlistPanel({
  projectId,
  dbUrl,
  basePath,
  searchParams,
}: {
  projectId: string
  /** Čte ho jen server; do prohlížeče se connection string neposílá. */
  dbUrl: string
  basePath: string
  searchParams: SearchParamsLike
}) {
  const params = parseTableParams(searchParams, {
    allowed: WAITLIST_SORT,
    defaultSort: 'zapsan',
    pageSize: 50,
    prefix: 'w',
    tiebreak: 'created_at',
  })
  const query = (() => {
    const value = searchParams?.wq
    return (Array.isArray(value) ? value[0] : value) ?? ''
  })()

  const screen = await loadWaitlist(dbUrl, params, query)
  const links = tableLinks(basePath, searchParams, { prefix: 'w' })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Celkem" value={screen.total} />
        <Tile label="Čeká na e-mail" value={screen.pending} hint={screen.pending > 0 ? 'ještě nic nedostali' : undefined} />
        <Tile label="E-mail odešel" value={screen.notified} />
      </div>

      <WaitlistActions projectId={projectId} pending={screen.pending} />

      <DataTable
        rows={screen.rows}
        columns={COLUMNS}
        rowKey={(entry) => String(entry.id)}
        sort={{ params, links }}
        page={{ params, total: screen.matched, links }}
        toolbar={
          <Toolbar className="w-full">
            <TableSearch
              action={basePath}
              searchParams={searchParams}
              name="wq"
              placeholder="Hledat jméno nebo e-mail…"
            />
          </Toolbar>
        }
        empty={{
          title: screen.total === 0 ? 'Zatím nikdo na čekačce' : 'Nic neodpovídá hledání',
          description:
            screen.total === 0
              ? 'Až se někdo zapíše na webu produktu, objeví se tady i s datem a jazykem.'
              : 'Zkuste hledat jinak, třeba jen část e-mailu.',
        }}
      />
    </div>
  )
}
