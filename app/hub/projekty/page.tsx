import Link from 'next/link'
import { Plus, Layers } from 'lucide-react'
import { getPersonalProjects } from './projekty-actions'
import { PersonalProjectCard } from '@/components/PersonalProjectCard'

export default async function ProjektyPage() {
  const projects = await getPersonalProjects()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Projekty</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tvoje osobní projekty ve vývoji</p>
        </div>
        <Link
          href="/hub/projekty/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus size={15} strokeWidth={1.5} />
          Nový projekt
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <Layers size={24} strokeWidth={1.5} className="text-slate-400" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-1.5">Zatím žádné projekty</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Přidej svůj první osobní projekt — sleduj fázi, tech stack a nápady na jednom místě.
          </p>
          <Link
            href="/hub/projekty/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-sm"
          >
            <Plus size={15} strokeWidth={1.5} />
            Přidat projekt
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <PersonalProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
