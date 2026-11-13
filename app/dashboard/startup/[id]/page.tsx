import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  getStartupProject,
  getStartupImprovements,
  getStartupChangelog,
} from '../startup-actions'
import { StartupProjectEditor } from '@/components/StartupProjectEditor'
import { WaitlistPanel } from '@/components/admin/startup/waitlist-panel'
import { AiAssistantsSection } from '@/components/AiAssistantsSection'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StartupDetailPage(props: Props) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams])
  const [project, improvements, changelog] = await Promise.all([
    getStartupProject(params.id),
    getStartupImprovements(params.id),
    getStartupChangelog(params.id),
  ])

  if (!project) notFound()

  // Waitlist se vykreslí na serveru a do klientského editoru jde jako hotový
  // kus stránky — jinak by se celá tabulka musela poslat do prohlížeče (AD07).
  const waitlist = project.waitlist_db_url ? (
    <WaitlistPanel
      projectId={project.id}
      dbUrl={project.waitlist_db_url}
      basePath={`/dashboard/startup/${project.id}`}
      searchParams={searchParams}
    />
  ) : undefined

  return (
    <PageShell>
      <div>
        <Link
          href="/dashboard/startup"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Startup projekty
        </Link>
        <PageHeader title={project.name} subtitle={project.segment} subtitleFont="sans" className="mt-4" />
      </div>

      <StartupProjectEditor
        project={project}
        improvements={improvements}
        changelog={changelog}
        waitlist={waitlist}
      />

      {/* Data projektu si asistent načte na serveru podle odkazu (AD14). */}
      <AiAssistantsSection projectId={project.id} projectName={project.name} />
    </PageShell>
  )
}
