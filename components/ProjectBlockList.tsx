'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ChevronDown, ChevronUp, GripVertical, Layers, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  addCustomProjectBlock,
  addProjectBlockFromTemplate,
  removeProjectBlock,
  reorderProjectBlocks,
  updateProjectBlock,
} from '@/app/project-blocks-actions'
import { BLOCK_COLOR_PALETTE, type BlockTemplate, type ProjectBlock } from '@/lib/types'
import { BlockLibraryPicker } from '@/components/BlockLibraryPicker'

function BlockCard({
  block,
  isFirst,
  isLast,
  isPending,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
}: {
  block: ProjectBlock
  isFirst: boolean
  isLast: boolean
  isPending: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (data: { title?: string; color?: string; content?: string }) => void
  onDelete: () => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(block.title)
  const [content, setContent] = useState(block.content ?? '')

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const saveTitle = () => {
    const trimmed = title.trim()
    if (!trimmed || trimmed === block.title) { setTitle(block.title); setEditingTitle(false); return }
    onUpdate({ title: trimmed })
    setEditingTitle(false)
  }

  const saveContent = () => {
    if (content.trim() === (block.content ?? '')) return
    onUpdate({ content })
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border border-border rounded-xl overflow-hidden bg-white ${isDragging ? 'opacity-50 relative z-10' : ''}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-brand-700 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          title="Přetáhnout pro změnu pořadí"
        >
          <GripVertical size={14} strokeWidth={1.5} />
        </button>

        <div className="flex flex-col shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst || isPending}
            className="text-muted-foreground hover:text-brand-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            title="Posunout nahoru"
          >
            <ChevronUp size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast || isPending}
            className="text-muted-foreground hover:text-brand-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            title="Posunout dolů"
          >
            <ChevronDown size={13} strokeWidth={1.5} />
          </button>
        </div>

        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: block.color ?? '#94a3b8' }}
        />

        {editingTitle ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              className="flex-1 min-w-0 text-sm font-medium border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveTitle()}
              autoFocus
            />
            <button onClick={saveTitle} className="text-muted-foreground hover:text-brand-700 shrink-0">
              <Check size={13} strokeWidth={1.5} />
            </button>
            <button onClick={() => { setTitle(block.title); setEditingTitle(false) }} className="text-muted-foreground hover:text-red-600 shrink-0">
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground flex-1 min-w-0 text-left group/title"
          >
            <span className="truncate">{block.title}</span>
            <Pencil size={11} strokeWidth={1.5} className="text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
          </button>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {BLOCK_COLOR_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => onUpdate({ color: c })}
              className="w-3.5 h-3.5 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>

        <button
          onClick={onDelete}
          disabled={isPending}
          className="text-muted-foreground hover:text-red-600 disabled:opacity-40 transition-colors shrink-0"
          title="Smazat blok"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-4 py-3">
        <textarea
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          placeholder="Návrh textu pro tento blok…"
          rows={3}
          value={content}
          onChange={e => setContent(e.target.value)}
          onBlur={saveContent}
        />
      </div>
    </div>
  )
}

export function ProjectBlockList({
  projectId,
  initialBlocks,
  templates,
}: {
  projectId: string
  initialBlocks: ProjectBlock[]
  templates: BlockTemplate[]
}) {
  const [blocks, setBlocks] = useState<ProjectBlock[]>(initialBlocks)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const persistOrder = (next: ProjectBlock[]) => {
    setBlocks(next)
    startTransition(async () => {
      await reorderProjectBlocks(projectId, next.map(b => b.id))
    })
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const next = [...blocks]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    persistOrder(next)
  }

  const moveDown = (index: number) => {
    if (index === blocks.length - 1) return
    const next = [...blocks]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    persistOrder(next)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex(b => b.id === active.id)
    const newIndex = blocks.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    persistOrder(arrayMove(blocks, oldIndex, newIndex))
  }

  const handleAddFromTemplate = (templateId: string) => {
    startTransition(async () => {
      try {
        const created = await addProjectBlockFromTemplate(projectId, templateId)
        setBlocks(prev => [...prev, created])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se přidat blok.')
      }
    })
  }

  const handleAddCustom = (title: string, color: string) => {
    startTransition(async () => {
      try {
        const created = await addCustomProjectBlock(projectId, title, color)
        setBlocks(prev => [...prev, created])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se přidat blok.')
      }
    })
  }

  const handleUpdate = (id: string, data: { title?: string; color?: string; content?: string }) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...data } : b)))
    startTransition(async () => {
      try {
        await updateProjectBlock(id, projectId, data)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se uložit blok.')
      }
    })
  }

  const handleDelete = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
    startTransition(async () => {
      await removeProjectBlock(id, projectId)
    })
  }

  return (
    <div className="space-y-5">
      <BlockLibraryPicker
        templates={templates}
        isPending={isPending}
        onAddFromTemplate={handleAddFromTemplate}
        onAddCustom={handleAddCustom}
      />

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Layers size={28} strokeWidth={1.5} className="text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground/70">Zatím žádné bloky. Přidej první ze šablony nebo od ruky.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {blocks.map((block, i) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  isFirst={i === 0}
                  isLast={i === blocks.length - 1}
                  isPending={isPending}
                  onMoveUp={() => moveUp(i)}
                  onMoveDown={() => moveDown(i)}
                  onUpdate={data => handleUpdate(block.id, data)}
                  onDelete={() => handleDelete(block.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
