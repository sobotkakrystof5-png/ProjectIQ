'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { moveJobStage } from '@/app/w/[business]/poptavky/actions'
import { cn } from '@/lib/ws/utils'
import { undoToast, useWsAction } from '../booking/use-ws-action'

export type BoardStage = { id: string; name: string; type: string }
export type BoardJob = {
  id: string
  stageId: string | null
  title: string
  customer: string | null
  when: string | null
  price: string | null
  href: string
}

const TYPE_DOT: Record<string, string> = {
  new: 'bg-signal',
  in_progress: 'bg-navy-500',
  done: 'bg-navy-700',
  paid: 'bg-navy-900 dark:bg-navy-200',
  cancelled: 'bg-navy-200 dark:bg-navy-700',
}

/**
 * Tabule zakázek podle vlastních stavů (S10, rozložení B ve vzhledu Dílků).
 * Jen zobrazení a přesun mezi stavy: přetažením (myš) nebo výběrem stavu na
 * kartě (telefon, klávesnice). Přesun jde vrátit „Zpět“.
 */
export function JobBoard({ slug, stages, jobs, invoices = false }: { slug: string; stages: BoardStage[]; jobs: BoardJob[]; invoices?: boolean }) {
  const { run, pending } = useWsAction()
  const dragged = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [local, setLocal] = useState<Record<string, string>>({})
  useEffect(() => setLocal({}), [jobs])

  const stageOf = (j: BoardJob) => local[j.id] ?? j.stageId ?? stages[0]?.id
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? ''

  const move = (job: BoardJob, stageId: string) => {
    const from = stageOf(job)
    if (!from || from === stageId) return
    setLocal((l) => ({ ...l, [job.id]: stageId }))
    void run(
      () => moveJobStage({ slug, jobId: job.id, stageId }),
      (r) => {
        const prev = r.prevStageId ?? from
        undoToast(`Přesunuto do: ${stageName(stageId)}.`, () => moveJobStage({ slug, jobId: job.id, stageId: prev }), {
          done: `Zakázka je zpátky v: ${stageName(prev)}.`,
        })
      },
    ).then((ok) => {
      if (!ok) setLocal((l) => {
        const next = { ...l }
        delete next[job.id]
        return next
      })
    })
  }

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
                if (job) move(job, stage.id)
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
                      <article
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
                        className={cn(
                          'relative flex cursor-grab flex-col gap-2 rounded-chip border bg-surface p-3 shadow-sm shadow-navy-950/5 active:cursor-grabbing',
                          pending && local[job.id] && 'opacity-70',
                        )}
                      >
                        <Link
                          href={job.href}
                          scroll={false}
                          className="text-[15px] font-semibold leading-snug text-ink after:absolute after:inset-0 after:rounded-chip focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        >
                          {job.customer ?? job.title}
                        </Link>
                        {job.customer && <p className="-mt-1.5 text-sm text-quiet">{job.title}</p>}
                        {(job.when || job.price) && (
                          <p className="flex flex-wrap gap-x-3 font-num text-xs text-quiet">
                            {job.when && <span>{job.when}</span>}
                            {job.price && <span>{job.price}</span>}
                          </p>
                        )}
                        <label className="relative z-10 flex items-center gap-2 text-xs text-quiet">
                          <span className="sr-only">Přesunout do stavu</span>
                          <select
                            value={stage.id}
                            disabled={pending}
                            onChange={(e) => move(job, e.target.value)}
                            className="h-9 w-full rounded-full border border-input bg-surface px-3 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          >
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {invoices && (stage.type === 'done' || stage.type === 'paid') && <Link href={'/w/' + slug + '/faktury?detail=nova-faktura&zakazka=' + job.id} className="relative z-10 inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 dark:text-navy-200">Vystavit fakturu</Link>}
                      </article>
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
