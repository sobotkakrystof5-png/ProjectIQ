'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GoalStep {
  id: string
  content: string
  position: number
  done: boolean
}

interface AccentClasses {
  ring: string
  button: string
  checkbox: string
}

interface Props {
  steps: GoalStep[]
  onSave: (steps: { content: string; done: boolean }[]) => Promise<{ error?: string }>
  accent: AccentClasses
}

function toRows(steps: GoalStep[]): { content: string; done: boolean }[] {
  const sorted = [...steps].sort((a, b) => a.position - b.position).map((s) => ({ content: s.content, done: s.done }))
  while (sorted.length < 5) sorted.push({ content: '', done: false })
  return sorted.slice(0, 5)
}

export function GoalStepsChecklist({ steps, onSave, accent }: Props) {
  const [rows, setRows] = useState(() => toRows(steps))
  const [editing, setEditing] = useState(steps.length === 0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(next: { content: string; done: boolean }[]) {
    setError(null)
    const result = await onSave(next)
    if (result.error) setError(result.error)
    return !result.error
  }

  async function toggleDone(index: number) {
    if (!rows[index].content.trim()) return
    const next = rows.map((r, i) => (i === index ? { ...r, done: !r.done } : r))
    setRows(next)
    setIsSaving(true)
    await persist(next)
    setIsSaving(false)
  }

  async function handleSaveText() {
    setIsSaving(true)
    const ok = await persist(rows)
    setIsSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Akční kroky</span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={10} strokeWidth={1.5} />
            Upravit
          </button>
        )}
      </div>

      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleDone(i)}
            disabled={!rows[i].content.trim() || isSaving}
            className={cn(
              'shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors disabled:opacity-30',
              rows[i].done ? accent.checkbox : 'border-border bg-white'
            )}
          >
            {rows[i].done && <Check size={11} strokeWidth={2.5} className="text-white" />}
          </button>
          {editing ? (
            <input
              type="text"
              value={rows[i].content}
              onChange={(e) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, content: e.target.value } : row)))}
              placeholder={`Krok ${i + 1}`}
              className={cn('flex-1 text-xs border border-border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2', accent.ring)}
            />
          ) : (
            <span className={cn('flex-1 text-xs', rows[i].done ? 'text-muted-foreground line-through' : rows[i].content ? 'text-foreground' : 'text-muted-foreground/50 italic')}>
              {rows[i].content || `Krok ${i + 1} — nevyplněno`}
            </span>
          )}
        </div>
      ))}

      {error && <p className="text-[10px] text-red-600">{error}</p>}

      {editing && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setRows(toRows(steps))
              setEditing(steps.length === 0)
              setError(null)
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSaveText}
            disabled={isSaving}
            className={cn('flex items-center gap-1 text-[10px] font-medium text-white rounded-md px-2 py-1 transition-colors disabled:opacity-60', accent.button)}
          >
            {isSaving && <Loader2 size={10} className="animate-spin" />}
            Uložit kroky
          </button>
        </div>
      )}
    </div>
  )
}
