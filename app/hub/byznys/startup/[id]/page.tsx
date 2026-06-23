import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  getStartupProject,
  getStartupImprovements,
  getStartupChangelog,
} from '../startup-actions'
import { StartupProjectEditor } from '@/components/StartupProjectEditor'

interface Props {
  params: { id: string }
}

export default async function StartupDetailPage({ params }: Props) {
  const [project, improvements, changelog] = await Promise.all([
    getStartupProject(params.id),
    getStartupImprovements(params.id),
    getStartupChangelog(params.id),
  ])

  if (!project) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/hub/byznys/startup"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Startup projekty
        </Link>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{project.segment}</p>
      </div>

      <StartupProjectEditor
        project={project}
        improvements={improvements}
        changelog={changelog}
      />
    </div>
  )
}
