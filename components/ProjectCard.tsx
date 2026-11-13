import Link from 'next/link'
import { Calendar, CreditCard, BadgeCheck, Globe } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { ShareButton } from './ShareButton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import type { Project, ProjectStatus } from '@/lib/types'

interface ProjectCardProps {
  /** `lead_origin` je štítek „odkud poptávka přišla" (AD02, R-088). */
  project: Project & { lead_origin?: string | null }
}

export function ProjectCard({ project }: ProjectCardProps) {
  const origin = LEAD_ORIGINS[toLeadOrigin(project.lead_origin)]
  const fromWeb = project.source !== null && project.source !== 'manual'

  return (
    <Link
      href={projectPath(project.id)}
      className="group block bg-surface border border-navy-100 rounded-chip p-5 hover:border-navy-200 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink truncate transition-colors group-hover:text-navy-800">
            {project.client_name}
          </h3>
          {project.description && (
            <p className="text-sm text-quiet truncate mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {fromWeb && origin.domain && (
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-navy-50 text-navy-700 border border-navy-100"
              title={`Poptávka z ${origin.domain}`}
            >
              <Globe size={11} strokeWidth={1.5} />
              <span>{origin.name}</span>
            </div>
          )}
          <ShareButton token={project.public_token} variant="icon" />
          <StatusBadge status={project.status as ProjectStatus} />
        </div>
      </div>

      {project.focus && (
        <p className="text-xs text-quiet mb-3 line-clamp-2 leading-relaxed">{project.focus}</p>
      )}

      <ProgressBar value={project.progress} className="mb-4" />

      <div className="flex items-center gap-4 text-xs text-quiet">
        {project.price !== null && (
          <div className="flex items-center gap-1">
            <CreditCard size={12} strokeWidth={1.5} />
            <span className={project.paid ? 'font-medium text-ink' : ''}>
              {formatCurrency(project.price)}
            </span>
            {project.paid && <BadgeCheck size={12} strokeWidth={1.5} className="text-navy-700" />}
          </div>
        )}
        {project.deadline && (
          <div className="flex items-center gap-1">
            <Calendar size={12} strokeWidth={1.5} />
            <span>{formatDate(project.deadline)}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
