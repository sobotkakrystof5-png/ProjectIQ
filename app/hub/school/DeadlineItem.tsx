'use client'

import { useState, useTransition } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { toggleDeadlineDone } from './actions'

const TYPE_BADGE: Record<string, string> = {
  test:         'bg-red-50 text-red-700 border border-red-200',
  homework:     'bg-blue-50 text-blue-700 border border-blue-200',
  presentation: 'bg-violet-50 text-violet-700 border border-violet-200',
}
const TYPE_LABEL: Record<string, string> = {
  test: 'Písemka', homework: 'Úkol', presentation: 'Referát',
}

type Props = {
  id: string
  title: string
  subject: string | null
  type: 'test' | 'homework' | 'presentation'
  done: boolean
  dueLabel: string
  dueCls: string
}

export function DeadlineItem({ id, title, subject, type, done: initialDone, dueLabel, dueCls }: Props) {
  const [done, setDone] = useState(initialDone)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !done
    setDone(next)
    startTransition(() => toggleDeadlineDone(id, next))
  }

  return (
    <div
      className={`bg-white border border-border rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity ${done ? 'opacity-50' : ''} ${pending ? 'cursor-wait' : ''}`}
    >
      <button
        onClick={toggle}
        disabled={pending}
        className="shrink-0 text-muted-foreground hover:text-violet-600 transition-colors"
        aria-label={done ? 'Označit jako nesplněné' : 'Označit jako splněné'}
      >
        {done
          ? <CheckSquare size={16} strokeWidth={1.5} />
          : <Square size={16} strokeWidth={1.5} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {title}
        </p>
        {subject && (
          <p className="text-xs text-muted-foreground mt-0.5">{subject}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[type] ?? ''}`}>
          {TYPE_LABEL[type] ?? type}
        </span>
        <span className={`text-xs ${dueCls}`}>{dueLabel}</span>
      </div>
    </div>
  )
}
