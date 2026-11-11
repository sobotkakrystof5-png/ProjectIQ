import { LeadCard } from '@/components/LeadCard'
import { Pagination } from '@/components/admin/pagination'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { loadPendingLeads } from '@/lib/web-leads'
import { WEB_LEAD_ORIGINS, type LeadOrigin } from '@/lib/lead-origins'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'

// Jeden inbox poptávek ze všech webů (AD02, R-088). Dřív to byly dvě obrazovky
// — /dashboard/vizeon a /alteno/rezervace — a každá měla vlastní dotaz.
// Od AD07 filtruje a stránkuje databáze (`?zdroj=`, `?page=`).

const PATH = '/dashboard/poptavky'

export default async function LeadsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const raw = Array.isArray(searchParams.zdroj) ? searchParams.zdroj[0] : searchParams.zdroj
  const known = WEB_LEAD_ORIGINS.map((o) => o.key)
  const filter: LeadOrigin | 'vse' = known.includes(raw as LeadOrigin) ? (raw as LeadOrigin) : 'vse'

  // Jediné rozumné řazení inboxu je „nejnovější nahoře"; z adresy se bere
  // jen stránka, ale projde stejnou kontrolou jako u tabulek.
  const params = parseTableParams(searchParams, {
    allowed: { nove: { sql: 'p.created_at', dir: 'desc' } },
    defaultSort: 'nove',
    pageSize: 25,
  })
  const { rows, total, counts, all } = await loadPendingLeads(params, filter)
  const links = tableLinks(PATH, searchParams)

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Poptávky"
        subtitle="Poptávky z webů, které čekají na potvrzení. Po potvrzení se z nich stane zakázka."
        subtitleFont="sans"
      />

      <PillNav
        label="Zdroj poptávky"
        items={[
          {
            key: 'vse',
            label: 'Všechny',
            href: tableHref(PATH, searchParams, { zdroj: null, page: null }),
            active: filter === 'vse',
            count: all,
          },
          ...WEB_LEAD_ORIGINS.map((o) => ({
            key: o.key,
            label: o.domain ?? o.name,
            href: tableHref(PATH, searchParams, { zdroj: o.key, page: null }),
            active: filter === o.key,
            count: counts[o.key] ?? 0,
          })),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filter === 'vse' ? 'Žádné čekající poptávky' : 'Z tohohle webu teď nic nečeká'}
          description="Nové poptávky z webů se tady objeví samy."
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {rows.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
          <Pagination params={params} total={total} links={links} />
        </>
      )}
    </PageShell>
  )
}
