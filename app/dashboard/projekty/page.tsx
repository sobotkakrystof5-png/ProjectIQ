import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { EmptyState } from '@/components/ws/brand'
import { getPersonalProjects } from './projekty-actions'
import { PersonalProjectCard } from '@/components/PersonalProjectCard'

export default async function ProjektyPage() {
  const projects = await getPersonalProjects()

  return (
    <PageShell>
      <PageHeader
        title="Projekty"
        subtitle="Osobní projekty ve vývoji."
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/projekty/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nový projekt
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="Zatím žádné projekty"
          description="Přidejte první projekt — fáze, technologie a nápady budou na jednom místě."
          action={
            <Link
              href="/dashboard/projekty/new"
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
            <PersonalProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
