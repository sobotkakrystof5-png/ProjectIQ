import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { Pagination } from '@/components/admin/pagination'
import LeadsTable from '@/components/LeadsTable'
import ProjectCalculator from '@/components/ProjectCalculator'
import { LEAD_SORT, loadCallsScreen } from '@/lib/admin/leads'
import { flipDir, parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'

// Hovory (AD07): řazení, stránka i pohled jsou v adrese, takže přežijí
// reload i tlačítko Zpět. Poznámky se k řádku tahají jen jako náhled,
// celé až po rozbalení kontaktu.

const PATH = '/dashboard/calls'

export default async function CallsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const focusLead = Array.isArray(searchParams.lead) ? searchParams.lead[0] : searchParams.lead
  const waiting = searchParams.pohled === 'cekani'

  const params = parseTableParams(searchParams, {
    allowed: LEAD_SORT,
    defaultSort: 'pridano',
    pageSize: 50,
    tiebreak: 'l.created_at',
  })
  const screen = await loadCallsScreen(params, waiting)
  const links = tableLinks(PATH, searchParams)

  // Funkce se do klientské komponenty poslat nedá, proto se odkazy na řazení
  // spočítají tady: kliknutí na seřazený sloupec otočí směr, jinak se použije
  // výchozí směr sloupce.
  const sortLinks = Object.fromEntries(
    Object.entries(LEAD_SORT).map(([key, column]) => [
      key,
      links.sortHref(key, params.sortKey === key ? flipDir(params.dir) : (column.dir ?? 'desc')),
    ]),
  )

  return (
    <PageShell width="table" className="gap-10">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Hovory"
          subtitle={
            screen.overdue > 0
              ? `${screen.overdue} ${screen.overdue === 1 ? 'kontakt má' : 'kontaktů má'} příští akci po termínu.`
              : 'Kontakty, se kterými jednáte. Po dohodě z nich jedním klikem uděláte zakázku.'
          }
          subtitleFont="sans"
        />

        <PillNav
          label="Pohled"
          variant="segmented"
          items={[
            {
              key: 'hovory',
              label: 'Hovory',
              href: tableHref(PATH, searchParams, { pohled: null, page: null }),
              active: !waiting,
              count: screen.active,
            },
            {
              key: 'cekani',
              label: 'Čekání na odpověď',
              href: tableHref(PATH, searchParams, { pohled: 'cekani', page: null }),
              active: waiting,
              count: screen.waiting,
            },
          ]}
        />

        <LeadsTable
          // Po změně řazení nebo stránky se vykreslí nové řádky, ne ty
          // zapamatované z předchozí stránky.
          key={`${params.sortKey}-${params.dir}-${params.page}-${waiting ? 'cekani' : 'hovory'}`}
          initialLeads={screen.rows}
          waiting={waiting}
          sortKey={params.sortKey}
          dir={params.dir}
          sortLinks={sortLinks}
          focusLeadId={focusLead}
        />

        <Pagination params={params} total={screen.total} links={links} />
      </div>

      <div className="border-t border-navy-100 pt-10">
        <ProjectCalculator />
      </div>
    </PageShell>
  )
}
