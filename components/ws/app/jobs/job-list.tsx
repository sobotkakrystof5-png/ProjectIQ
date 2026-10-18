'use client'

import { cn } from '@/lib/ws/utils'
import { JobCard, TYPE_DOT, useLocalStages, type CommonProps } from './job-card'
import { useMoveJob } from './use-move-job'

/**
 * Seznam zakázek po stavech (RD06): stejná data jako tabule, ale pod sebou,
 * bez vodorovného posunu. Na telefonu výchozí. Prázdné stavy se nezobrazují;
 * zakázky ve stavu jsou seřazené jako v tabuli.
 */
export function JobList({ slug, stages, jobs, invoices = false }: CommonProps) {
  const { move, pending } = useMoveJob(slug, stages)
  const { local, stageOf, optimistic } = useLocalStages(jobs, stages)

  return (
    <div className="flex flex-col gap-6">
      {stages.map((stage) => {
        const list = jobs.filter((j) => stageOf(j) === stage.id)
        if (list.length === 0) return null
        return (
          <section key={stage.id} aria-label={stage.name} className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 px-1">
              <span aria-hidden className={cn('h-2 w-2 rounded-[3px]', TYPE_DOT[stage.type] ?? 'bg-navy-300')} />
              <span className="text-[15px] font-semibold text-ink">{stage.name}</span>
              <span className="font-num text-xs text-quiet">{list.length}</span>
            </h2>
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((job) => (
                <li key={job.id} className="min-w-0">
                  <JobCard
                    slug={slug}
                    job={job}
                    stage={stage}
                    stages={stages}
                    invoices={invoices}
                    pending={pending && Boolean(local[job.id])}
                    showStage
                    onMove={(id) => void move(job.id, stageOf(job), id, optimistic(job.id, id))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
