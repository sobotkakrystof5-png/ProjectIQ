import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  getPersonalProject,
  getPersonalProjectImprovements,
  getPersonalProjectChangelog,
} from '../projekty-actions'
import { PersonalProjectEditor } from '@/components/PersonalProjectEditor'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PersonalProjectDetailPage(props: Props) {
  const params = await props.params
  const [project, improvements, changelog] = await Promise.all([
    getPersonalProject(params.id),
    getPersonalProjectImprovements(params.id),
    getPersonalProjectChangelog(params.id),
  ])

  if (!project) notFound()

  return (
    <PageShell>
      <div>
        <Link
          href="/dashboard/projekty"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Projekty
        </Link>
        <PageHeader title={project.name} subtitle={project.segment} subtitleFont="sans" className="mt-4" />
      </div>

      <PersonalProjectEditor
        project={project}
        improvements={improvements}
        changelog={changelog}
      />
    </PageShell>
  )
}
