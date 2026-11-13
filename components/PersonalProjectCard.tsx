import Link from 'next/link'
import { ArrowUpRight, TrendingUp, Github } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STARTUP_PHASE_TONE, toneVariant } from '@/lib/admin-status'
import { STARTUP_PHASES, type PersonalProject } from '@/lib/types'

interface Props {
  project: PersonalProject
}

export function PersonalProjectCard({ project }: Props) {
  const phase = STARTUP_PHASES.find(p => p.value === project.phase) ?? STARTUP_PHASES[0]

  return (
    <Link
      href={`/dashboard/projekty/${project.id}`}
      className="group bg-surface border border-navy-100 rounded-box p-5 hover:shadow-md hover:border-navy-200 transition-all flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <Badge variant={toneVariant(STARTUP_PHASE_TONE[phase.value])}>{phase.label}</Badge>
        <ArrowUpRight
          size={15}
          strokeWidth={1.5}
          className="text-quiet/40 group-hover:text-navy-600 transition-colors shrink-0"
        />
      </div>

      {/* Name + Segment */}
      <h2 className="font-semibold text-ink text-[15px] mb-0.5 line-clamp-1">{project.name}</h2>
      <p className="text-xs text-quiet mb-3">{project.segment}</p>

      {/* Problem preview */}
      <p className="text-sm text-quiet line-clamp-2 flex-1 mb-4">{project.problem}</p>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-quiet">Postup</span>
          <span className="text-xs font-semibold text-ink tabular-nums">{project.progress} %</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full brand-gradient rounded-full transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-navy-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-quiet">
            {project.monetization ? (
              <span className="inline-flex items-center gap-1 text-ink">
                <TrendingUp size={11} strokeWidth={1.5} />
                Monetizace
              </span>
            ) : (
              'Bez monetizace'
            )}
          </span>
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1 text-quiet hover:text-ink transition-colors"
              title="GitHub repozitář"
            >
              <Github size={13} strokeWidth={1.5} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {project.tech_stack && (
            <span className="text-[10px] text-quiet truncate">{project.tech_stack}</span>
          )}
          <span className="text-xs font-semibold text-navy-600 group-hover:text-navy-700 transition-colors shrink-0 ml-auto">
            Otevřít →
          </span>
        </div>
      </div>
    </Link>
  )
}
