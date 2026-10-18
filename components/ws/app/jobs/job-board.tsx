'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/ws/utils'
import { JobCard, TYPE_DOT, useLocalStages, type BoardJob, type CommonProps } from './job-card'
import { useMoveJob } from './use-move-job'

export type { BoardJob, BoardStage } from './job-card'

/**
 * Tabule zakázek podle vlastních stavů (S10, rozložení B ve vzhledu Dílků).
 * Přesun mezi stavy: přetažením (myš) nebo výběrem stavu na kartě (telefon,
 * klávesnice). Přesun jde vrátit „Zpět“.
 */
export function JobBoard({ slug, stages, jobs, invoices = false }: CommonProps) {
  const { move, pending } = useMoveJob(slug, stages)
  const dragged = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const { local, stageOf, optimistic } = useLocalStages(jobs, stages)

  const moveJob = (job: BoardJob, stageId: string) => void move(job.id, stageOf(job), stageId, optimistic(job.id, stageId))

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <ol className="flex min-w-max gap-4">
        {stages.map((stage) => {
          const list = jobs.filter((j) => stageOf(j) === stage.id)
          return (
            <li
              key={stage.id}
              className={cn(
                'flex w-[280px] shrink-0 flex-col gap-3 rounded-panel border bg-surface/60 p-3 transition-colors',
                over === stage.id && 'border-navy-500 bg-navy-50 dark:bg-navy-900',
              )}
              onDragOver={(e) => {
                if (!dragged.current) return
                e.preventDefault()
                if (over !== stage.id) setOver(stage.id)
              }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const job = jobs.find((j) => j.id === dragged.current)
                dragged.current = null
                if (job) moveJob(job, stage.id)
              }}
            >
              <h2 className="flex items-center gap-2 px-1 pt-1">
                <span aria-hidden className={cn('h-2 w-2 rounded-[3px]', TYPE_DOT[stage.type] ?? 'bg-navy-300')} />
                <span className="text-[15px] font-semibold text-ink">{stage.name}</span>
                <span className="ml-auto font-num text-xs text-quiet">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-chip border border-dashed px-3 py-6 text-center text-sm text-quiet">Sem přetáhněte zakázku.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {list.map((job) => (
                    <li key={job.id}>
                      <JobCard
                        slug={slug}
                        job={job}
                        stage={stage}
                        stages={stages}
                        invoices={invoices}
                        pending={pending && Boolean(local[job.id])}
                        showStage={false}
                        onMove={(id) => moveJob(job, id)}
                        draggable
                        onDragStart={(e) => {
                          dragged.current = job.id
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', job.title)
                        }}
                        onDragEnd={() => {
                          dragged.current = null
                          setOver(null)
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

