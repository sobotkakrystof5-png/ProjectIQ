import { Layers, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getPlanProjects, getPlanProjectActions } from './projekty-plan-actions'
import { ProjektyClient } from './ProjektyClient'

export default async function ProjektyPlanyPage() {
  const projects = await getPlanProjects()
  const actionsByProject = Object.fromEntries(
    await Promise.all(projects.map(async (p) => [p.id, await getPlanProjectActions(p.id)] as const))
  )

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/hub/plany"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Plány
        </Link>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
            <Layers size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Validace nových nápadů</h1>
        </div>
        <p className="text-sm text-muted-foreground">Než nápad spustím, ověřím si, jestli dává smysl — funnel krok 1</p>
      </div>

      <ProjektyClient projects={projects} actionsByProject={actionsByProject} />
    </div>
  )
}
