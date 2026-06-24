import Link from 'next/link'
import { ArrowUpRight, TrendingUp, Github } from 'lucide-react'
import { STARTUP_PHASES, type PersonalProject } from '@/lib/types'

interface Props {
  project: PersonalProject
}

export function PersonalProjectCard({ project }: Props) {
  const phase = STARTUP_PHASES.find(p => p.value === project.phase) ?? STARTUP_PHASES[0]

  return (
    <Link
      href={`/hub/projekty/${project.id}`}
      className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-brand-200 transition-all flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${phase.color}`}>
          {phase.emoji} {phase.label}
        </span>
        <ArrowUpRight
          size={15}
          strokeWidth={1.5}
          className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors shrink-0"
        />
      </div>

      {/* Name + Segment */}
      <h2 className="font-semibold text-foreground text-[15px] mb-0.5 line-clamp-1">{project.name}</h2>
      <p className="text-xs text-muted-foreground mb-3">{project.segment}</p>

      {/* Problem preview */}
      <p className="text-sm text-muted-foreground line-clamp-2 flex-1 mb-4">{project.problem}</p>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Postup</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">{project.progress} %</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full brand-gradient rounded-full transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {project.monetization ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
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
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="GitHub repozitář"
            >
              <Github size={13} strokeWidth={1.5} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {project.tech_stack && (
            <span className="text-[10px] text-muted-foreground truncate">{project.tech_stack}</span>
          )}
          <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors shrink-0 ml-auto">
            Otevřít →
          </span>
        </div>
      </div>
    </Link>
  )
}
