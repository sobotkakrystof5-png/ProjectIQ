import Link from 'next/link'
import { Calendar, CreditCard, BadgeCheck, Globe } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { ShareButton } from './ShareButton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { BUSINESSES, projectPath, type Business } from '@/lib/business'
import type { Project, ProjectStatus } from '@/lib/types'

interface ProjectCardProps {
  project: Project
  business?: Business
}

export function ProjectCard({ project, business = 'vizeon' }: ProjectCardProps) {
  const cfg = BUSINESSES[business]
  const fromWeb = project.source === cfg.source
  const isAlteno = business === 'alteno'

  return (
    <Link
      href={projectPath(business, project.id)}
      className={cn(
        'group block bg-white border border-border rounded-xl p-5 hover:shadow-md transition-all duration-200',
        isAlteno ? 'hover:border-amber-200' : 'hover:border-brand-200',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className={cn(
            'font-semibold text-foreground truncate transition-colors',
            isAlteno ? 'group-hover:text-amber-800' : 'group-hover:text-brand-800',
          )}>
            {project.client_name}
          </h3>
          {project.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {fromWeb && (
            <div className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              isAlteno
                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                : 'bg-blue-50 text-blue-700 border border-blue-100'
            )} title={`Poptávka z ${cfg.domain}`}>
              <Globe size={11} strokeWidth={1.5} />
              <span>{cfg.name}</span>
            </div>
          )}
          <ShareButton token={project.public_token} variant="icon" />
          <StatusBadge status={project.status as ProjectStatus} />
        </div>
      </div>

      {project.focus && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{project.focus}</p>
      )}

      <ProgressBar value={project.progress} className="mb-4" />

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {project.price !== null && (
          <div className="flex items-center gap-1">
            <CreditCard size={12} strokeWidth={1.5} />
            <span className={project.paid ? 'text-emerald-600 font-medium' : ''}>
              {formatCurrency(project.price)}
            </span>
            {project.paid && <BadgeCheck size={12} strokeWidth={1.5} className="text-emerald-500" />}
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
