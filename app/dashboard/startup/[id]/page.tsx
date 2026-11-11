import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  getStartupProject,
  getStartupImprovements,
  getStartupChangelog,
  getWaitlistEntries,
} from '../startup-actions'
import { StartupProjectEditor } from '@/components/StartupProjectEditor'
import { AiAssistantsSection } from '@/components/AiAssistantsSection'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StartupDetailPage(props: Props) {
  const params = await props.params
  const [project, improvements, changelog] = await Promise.all([
    getStartupProject(params.id),
    getStartupImprovements(params.id),
    getStartupChangelog(params.id),
  ])

  if (!project) notFound()

  const waitlistEntries = project.waitlist_db_url
    ? await getWaitlistEntries(project.waitlist_db_url)
    : undefined

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
        waitlistEntries={waitlistEntries}
      />

      <AiAssistantsSection
        project={project}
        changelog={changelog}
        improvements={improvements}
      />
    </PageShell>
  )
}
