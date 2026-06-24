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
  params: { id: string }
}

export default async function PersonalProjectDetailPage({ params }: Props) {
  const [project, improvements, changelog] = await Promise.all([
    getPersonalProject(params.id),
    getPersonalProjectImprovements(params.id),
    getPersonalProjectChangelog(params.id),
  ])

  if (!project) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/hub/projekty"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Projekty
        </Link>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{project.segment}</p>
      </div>

      <PersonalProjectEditor
        project={project}
        improvements={improvements}
        changelog={changelog}
      />
    </div>
  )
}
