import { LeadCard } from '@/components/LeadCard'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { loadPendingLeads } from '@/lib/web-leads'
import { WEB_LEAD_ORIGINS, toLeadOrigin, type LeadOrigin } from '@/lib/lead-origins'

// Jeden inbox poptávek ze všech webů (AD02, R-088). Dřív to byly dvě obrazovky
// — /dashboard/vizeon a /alteno/rezervace — a každá měla vlastní dotaz.

interface PageProps {
  searchParams: Promise<{ zdroj?: string }>
}

function originHref(zdroj: LeadOrigin | 'vse'): string {
  return zdroj === 'vse' ? '/dashboard/poptavky' : `/dashboard/poptavky?zdroj=${zdroj}`
}

export default async function LeadsPage(props: PageProps) {
  const { zdroj } = await props.searchParams
  const leads = await loadPendingLeads()
  const known = WEB_LEAD_ORIGINS.map((o) => o.key)
  const filter = known.includes(zdroj as LeadOrigin) ? (zdroj as LeadOrigin) : 'vse'
  const shown = filter === 'vse' ? leads : leads.filter((l) => toLeadOrigin(l.lead_origin) === filter)

  const countFor = (key: LeadOrigin) => leads.filter((l) => toLeadOrigin(l.lead_origin) === key).length

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
          { key: 'vse', label: 'Všechny', href: originHref('vse'), active: filter === 'vse', count: leads.length },
          ...WEB_LEAD_ORIGINS.map((o) => ({
            key: o.key,
            label: o.domain ?? o.name,
            href: originHref(o.key),
            active: filter === o.key,
            count: countFor(o.key),
          })),
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          title={filter === 'vse' ? 'Žádné čekající poptávky' : 'Z tohohle webu teď nic nečeká'}
          description="Nové poptávky z webů se tady objeví samy."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
