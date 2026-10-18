'use client'

import { moveJobStage } from '@/app/w/[business]/poptavky/actions'
import { undoToast, useWsAction } from '../booking/use-ws-action'

/**
 * Přesun zakázky do jiného stavu se „Zpět“ (R-044): stejná cesta pro tabuli,
 * seznam i panel. `optimistic` dovolí ukázat změnu hned a při chybě ji vrátit.
 */
export function useMoveJob(slug: string, stages: { id: string; name: string }[]) {
  const { run, pending } = useWsAction()
  const nameOf = (id: string) => stages.find((s) => s.id === id)?.name ?? ''

  const move = (
    jobId: string,
    from: string | null | undefined,
    to: string,
    optimistic?: { set: () => void; clear: () => void },
  ): Promise<boolean> => {
    if (!from || from === to) return Promise.resolve(false)
    optimistic?.set()
    return run(
      () => moveJobStage({ slug, jobId, stageId: to }),
      (r) => {
        const prev = r.prevStageId ?? from
        undoToast(`Přesunuto do: ${nameOf(to)}.`, () => moveJobStage({ slug, jobId, stageId: prev }), {
          done: `Zakázka je zpátky v: ${nameOf(prev)}.`,
        })
      },
    ).then((ok) => {
      if (!ok) optimistic?.clear()
      return ok
    })
  }

  return { move, pending }
}
