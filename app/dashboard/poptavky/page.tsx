import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { LeadCard } from '@/components/LeadCard'
import { loadPendingLeads } from '@/lib/web-leads'
import { WEB_LEAD_ORIGINS, toLeadOrigin, type LeadOrigin } from '@/lib/lead-origins'
import { cn } from '@/lib/utils'

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Poptávky</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Poptávky z webů čekající na potvrzení — po potvrzení se přesunou do zakázek
        </p>
      </div>

      <div role="group" aria-label="Zdroj poptávky" className="flex flex-wrap gap-1.5">
        {[{ key: 'vse' as const, label: 'Všechny', count: leads.length },
          ...WEB_LEAD_ORIGINS.map((o) => ({ key: o.key, label: o.domain ?? o.name, count: countFor(o.key) }))]
          .map((chip) => (
            <Link
              key={chip.key}
              href={originHref(chip.key)}
              aria-current={filter === chip.key ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
                filter === chip.key ? 'bg-navy-700 text-white' : 'bg-surface text-quiet ring-1 ring-navy-100 hover:text-ink',
              )}
            >
              {chip.label}
              <span className={cn('text-xs', filter === chip.key ? 'text-white/70' : 'text-quiet')}>{chip.count}</span>
            </Link>
          ))}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
            <Inbox size={24} strokeWidth={1.5} className="text-brand-400" aria-hidden="true" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {filter === 'vse' ? 'Žádné čekající poptávky' : 'Z tohohle webu teď nic nečeká'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nové poptávky z webů se tady objeví samy.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}
