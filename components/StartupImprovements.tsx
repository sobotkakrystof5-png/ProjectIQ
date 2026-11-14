'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { badgeVariants } from '@/components/ui/badge'
import { IMPROVEMENT_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import {
  addImprovement,
  updateImprovement,
  deleteImprovement,
} from '@/app/dashboard/startup/startup-actions'
import {
  IMPROVEMENT_STATUS_LABELS,
  type StartupImprovement,
  type ImprovementStatus,
} from '@/lib/types'

const STATUS_ORDER: ImprovementStatus[] = ['idea', 'in_progress', 'done']

function nextStatus(current: ImprovementStatus): ImprovementStatus {
  const idx = STATUS_ORDER.indexOf(current)
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
}

interface Props {
  projectId: string
  initialItems: StartupImprovement[]
}

export function StartupImprovements({ projectId, initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newText.trim()) return
    setAdding(true)
    const result = await addImprovement(projectId, newText)
    setAdding(false)
    if (result.error) { toast.error(result.error); return }
    if (result.item) setItems(prev => [...prev, result.item!])
    setNewText('')
  }

  const handleCycleStatus = async (item: StartupImprovement) => {
    const newStatus = nextStatus(item.status)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    const result = await updateImprovement(item.id, projectId, { status: newStatus })
    if (result.error) {
      toast.error(result.error)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
    }
  }

  const handleStartEdit = (item: StartupImprovement) => {
    setEditingId(item.id)
    setEditText(item.content)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return
    setItems(prev => prev.map(i => i.id === id ? { ...i, content: editText.trim() } : i))
    const result = await updateImprovement(id, projectId, { content: editText.trim() })
    if (result.error) toast.error(result.error)
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    setLoadingId(id)
    const result = await deleteImprovement(id, projectId)
    setLoadingId(null)
    if (result.error) { toast.error(result.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const counts = {
    idea: items.filter(i => i.status === 'idea').length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    done: items.filter(i => i.status === 'done').length,
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-quiet">
          <span>{counts.idea} nápadů</span>
          <span className="text-navy-200">·</span>
          <span>{counts.in_progress} v řešení</span>
          <span className="text-navy-200">·</span>
          <span className="text-ink">{counts.done} hotovo</span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-start gap-3 py-2.5 px-3.5 bg-muted/30 rounded-chip group"
          >
            {/* Status badge (clickable to cycle) */}
            <button
              type="button"
              onClick={() => handleCycleStatus(item)}
              className={cn('mt-0.5 shrink-0 cursor-pointer transition-opacity hover:opacity-80', badgeVariants({ variant: toneVariant(IMPROVEMENT_STATUS_TONE[item.status]) }))}
              title="Kliknutím změnit stav"
            >
              {IMPROVEMENT_STATUS_LABELS[item.status]}
            </button>

            {/* Content or edit input */}
            {editingId === item.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 text-sm border border-navy-400 rounded-chip bg-surface focus:outline-none"
                />
                <button type="button" onClick={() => handleSaveEdit(item.id)} className="rounded-chip p-1 text-navy-700 hover:bg-navy-50">
                  <Check size={14} strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="p-1 text-quiet hover:bg-muted rounded">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <span className={`flex-1 text-sm leading-relaxed ${item.status === 'done' ? 'text-quiet line-through' : 'text-ink'}`}>
                {item.content}
              </span>
            )}

            {/* Actions */}
            {editingId !== item.id && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartEdit(item)}
                  className="p-1.5 text-quiet hover:text-ink hover:bg-muted rounded-chip transition-colors"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={loadingId === item.id}
                  className="p-1.5 text-quiet hover:text-danger hover:bg-danger/5 rounded-chip transition-colors"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* Date */}
            {editingId !== item.id && (
              <span className="text-[10px] text-quiet shrink-0 mt-0.5">
                {new Date(item.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Přidat nápad na zlepšení…"
          className="flex-1 px-3.5 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-navy-600 text-white text-sm font-medium rounded-chip hover:bg-navy-700 disabled:opacity-40 transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Přidat
        </button>
      </div>
    </div>
  )
}
