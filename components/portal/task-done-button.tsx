'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { setTaskDone } from '@/app/klient/projekt/[id]/actions'

// „Mám hotovo" u úkolu etapy (KP12). Po označení jde jedním klikem vrátit.

export function TaskDoneButton({ projectId, taskId, done, label }: { projectId: string; taskId: string; done: boolean; label: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () =>
    start(async () => {
      setError(null)
      const res = await setTaskDone(projectId, { taskId, done: !done })
      if (!res.success) setError(res.error ?? 'Něco se nepovedlo. Zkuste to prosím znovu.')
    })

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={done ? `Vrátit úkol: ${label}` : `Mám hotovo: ${label}`}
        className={
          done
            ? 'inline-flex min-h-11 items-center gap-1.5 rounded-chip px-3 text-sm text-quiet hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
            : 'inline-flex min-h-11 items-center gap-1.5 rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
        }
      >
        {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
        {done ? 'Vrátit' : 'Mám hotovo'}
      </button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  )
}
