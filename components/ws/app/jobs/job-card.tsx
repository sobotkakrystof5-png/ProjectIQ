'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/ws/utils'

export type BoardStage = { id: string; name: string; type: string }
export type BoardJob = {
  id: string
  stageId: string | null
  title: string
  customer: string | null
  when: string | null
  price: string | null
  href: string
  /** Otevřená zakázka, jejíž termín už proběhl a nový není (filtr Po termínu). */
  overdue: boolean
}

export const TYPE_DOT: Record<string, string> = {
  new: 'bg-signal',
  in_progress: 'bg-navy-500',
  done: 'bg-navy-700',
  paid: 'bg-navy-900 dark:bg-navy-200',
  cancelled: 'bg-navy-200 dark:bg-navy-700',
}

export type CommonProps = { slug: string; stages: BoardStage[]; jobs: BoardJob[]; invoices?: boolean }

/** Stav zakázky jako štítek (v seznamu je jediná informace o stavu na kartě). */
export function StageBadge({ stage }: { stage: BoardStage }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-900 dark:bg-navy-800 dark:text-navy-50">
      <span aria-hidden className={cn('h-2 w-2 rounded-[3px]', TYPE_DOT[stage.type] ?? 'bg-navy-300')} />
      {stage.name}
    </span>
  )
}

/**
 * Kompaktní karta zakázky: zákazník, název, cena, příští termín a stav.
 * Celá karta je odkaz do pravého panelu, výběr stavu a „Vystavit fakturu“
 * jsou nad ním. Výběr stavu je i klávesnicová a dotyková náhrada tažení.
 */
export function JobCard({
  slug,
  job,
  stage,
  stages,
  invoices,
  pending,
  showStage,
  onMove,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  slug: string
  job: BoardJob
  stage: BoardStage
  stages: BoardStage[]
  invoices: boolean
  pending: boolean
  showStage: boolean
  onMove: (stageId: string) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  const done = stage.type === 'done' || stage.type === 'paid'
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'relative flex flex-col gap-2 rounded-chip border bg-surface p-3',
        draggable && 'cursor-grab active:cursor-grabbing',
        pending && 'opacity-90',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={job.href}
          scroll={false}
          className="min-w-0 text-[15px] font-semibold leading-snug text-ink after:absolute after:inset-0 after:rounded-chip focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {job.customer ?? job.title}
        </Link>
        {job.price && <span className="shrink-0 font-num text-sm text-ink">{job.price}</span>}
      </div>
      {job.customer && <p className="-mt-1.5 truncate text-sm text-quiet">{job.title}</p>}
      {(job.when || job.overdue || showStage) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {showStage && <StageBadge stage={stage} />}
          {job.when && (
            <span className="inline-flex items-center gap-1.5 font-num text-xs text-quiet">
              <CalendarClock aria-hidden size={14} strokeWidth={1.5} />
              {job.when}
            </span>
          )}
          {job.overdue && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger">
              <AlertTriangle aria-hidden size={14} strokeWidth={1.5} />
              Po termínu
            </span>
          )}
        </div>
      )}
      <label className="relative z-10 flex items-center gap-2 text-xs text-quiet">
        <span className="sr-only">Přesunout do stavu</span>
        <select
          value={stage.id}
          disabled={pending}
          onChange={(e) => onMove(e.target.value)}
          className="h-11 w-full rounded-full border border-input bg-surface px-3.5 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {invoices && done && (
        <Link
          href={`/w/${slug}/faktury?detail=nova-faktura&zakazka=${job.id}`}
          className="relative z-10 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-navy-700 hover:underline dark:text-navy-200"
        >
          <FilePlus2 aria-hidden size={16} strokeWidth={1.5} />
          Vystavit fakturu
        </Link>
      )}
    </article>
  )
}

/** Stav zakázky po optimistické změně (než dorazí čerstvá data). */
export function useLocalStages(jobs: BoardJob[], stages: BoardStage[]) {
  const [local, setLocal] = useState<Record<string, string>>({})
  useEffect(() => setLocal({}), [jobs])
  const stageOf = (j: BoardJob) => local[j.id] ?? j.stageId ?? stages[0]?.id
  return {
    local,
    stageOf,
    optimistic: (jobId: string, stageId: string) => ({
      set: () => setLocal((l) => ({ ...l, [jobId]: stageId })),
      clear: () =>
        setLocal((l) => {
          const next = { ...l }
          delete next[jobId]
          return next
        }),
    }),
  }
}

