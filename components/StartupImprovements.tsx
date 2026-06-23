'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import {
  addImprovement,
  updateImprovement,
  deleteImprovement,
} from '@/app/hub/byznys/startup/startup-actions'
import {
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_STATUS_STYLES,
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{counts.idea} nápadů</span>
          <span className="text-border">·</span>
          <span className="text-amber-600">{counts.in_progress} v řešení</span>
          <span className="text-border">·</span>
          <span className="text-emerald-600">{counts.done} hotovo</span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-start gap-3 py-2.5 px-3.5 bg-muted/30 rounded-xl group"
          >
            {/* Status badge (clickable to cycle) */}
            <button
              type="button"
              onClick={() => handleCycleStatus(item)}
              className={`shrink-0 mt-0.5 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-all hover:opacity-80 cursor-pointer ${IMPROVEMENT_STATUS_STYLES[item.status]}`}
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
                  className="flex-1 px-2.5 py-1.5 text-sm border border-brand-400 rounded-lg bg-white focus:outline-none"
                />
                <button type="button" onClick={() => handleSaveEdit(item.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                  <Check size={14} strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <span className={`flex-1 text-sm leading-relaxed ${item.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {item.content}
              </span>
            )}

            {/* Actions */}
            {editingId !== item.id && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartEdit(item)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={loadingId === item.id}
                  className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* Date */}
            {editingId !== item.id && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
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
          className="flex-1 px-3.5 py-2 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Přidat
        </button>
      </div>
    </div>
  )
}
