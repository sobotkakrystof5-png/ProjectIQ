import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { EmptyState } from '@/components/ws/brand'
import { getStartupProjects } from './startup-actions'
import { StartupProjectCard } from '@/components/StartupProjectCard'

export default async function StartupPage() {
  const projects = await getStartupProjects()

  const launched = projects.filter(p =>
    ['launch', 'growth', 'monetization', 'active'].includes(p.phase)
  ).length
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
    : 0

  return (
    <PageShell>
      <PageHeader
        title="Startup projekty"
        subtitle="Vlastní nápady a produkty."
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/startup/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nový projekt
          </Link>
        }
      />

      {projects.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Celkem projektů', value: String(projects.length) },
            { label: 'Spuštěno', value: String(launched) },
            { label: 'Průměrný postup', value: `${avgProgress} %` },
          ].map((tile) => (
            <div key={tile.label} className="rounded-box border border-navy-100 bg-surface p-4">
              <p className="mb-1 text-xs text-quiet">{tile.label}</p>
              <p className="font-num text-2xl font-semibold text-ink">{tile.value}</p>
            </div>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="Zatím žádné projekty"
          description="Přidejte první projekt — fáze, finance a nápady budou na jednom místě."
          action={
            <Link
              href="/dashboard/startup/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
            >
              <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
              Přidat projekt
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <StartupProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
