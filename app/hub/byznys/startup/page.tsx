import Link from 'next/link'
import { ArrowLeft, Plus, Rocket } from 'lucide-react'
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/hub/byznys"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            Business
          </Link>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Startup projekty</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tvoje osobní projekty, nápady a produkty</p>
        </div>
        <Link
          href="/hub/byznys/startup/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus size={15} strokeWidth={1.5} />
          Nový projekt
        </Link>
      </div>

      {/* Dashboard */}
      {projects.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Celkem projektů</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{projects.length}</p>
          </div>
          <div className="bg-white border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Spuštěno</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{launched}</p>
          </div>
          <div className="bg-white border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Průměrný postup</p>
            <p className="text-2xl font-bold text-brand-600 tabular-nums">{avgProgress} %</p>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <Rocket size={24} strokeWidth={1.5} className="text-slate-400" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-1.5">Zatím žádné projekty</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Přidej svůj první startup projekt — sleduj fázi, finance a nápady na jednom místě.
          </p>
          <Link
            href="/hub/byznys/startup/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-sm"
          >
            <Plus size={15} strokeWidth={1.5} />
            Přidat projekt
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <StartupProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
