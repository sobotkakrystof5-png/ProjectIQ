import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { sql } from '@/lib/db'
import { getBlockTemplates } from '@/app/block-templates-actions'
import { getProjectBlocks } from '@/app/project-blocks-actions'
import { ProjectBlockList } from '@/components/ProjectBlockList'
import { toBusiness, projectPath } from '@/lib/business'
import type { Project } from '@/lib/types'

interface PageProps {
  params: { id: string }
}

export default async function ProjectTemplatePage({ params }: PageProps) {
  const rows = await sql`SELECT * FROM projects WHERE id = ${params.id} LIMIT 1`
  if (!rows.length) notFound()
  const project = rows[0] as Project & { business?: string }
  if (toBusiness(project.business) !== 'vizeon') redirect(`${projectPath('vizeon', params.id)}/sablona`)

  const [templates, blocks] = await Promise.all([
    getBlockTemplates(),
    getProjectBlocks(params.id),
  ])

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href={`/dashboard/${params.id}`}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-800 hover:bg-brand-50 transition-colors"
        >
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Šablona webu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{project.client_name}</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <ProjectBlockList projectId={project.id} initialBlocks={blocks} templates={templates} />
      </div>
    </div>
  )
}
