'use client'

import { useState, useTransition } from 'react'
import { Check, Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  createBlockTemplate,
  deleteBlockTemplate,
  updateBlockTemplate,
} from '@/app/block-templates-actions'
import { BLOCK_COLOR_PALETTE, type BlockTemplate } from '@/lib/types'

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {BLOCK_COLOR_PALETTE.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 ring-1 ring-black/5"
          style={{ backgroundColor: color }}
          title={color}
        >
          {value === color && <Check size={11} strokeWidth={2.5} className="text-white" />}
        </button>
      ))}
    </div>
  )
}

function TemplateCard({ template, onDelete }: { template: BlockTemplate; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [color, setColor] = useState(template.color ?? BLOCK_COLOR_PALETTE[0])
  const [isPending, startTransition] = useTransition()

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        await updateBlockTemplate(template.id, { name: trimmed, description, color })
        setEditing(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se uložit šablonu.')
      }
    })
  }

  const cancel = () => {
    setName(template.name)
    setDescription(template.description ?? '')
    setColor(template.color ?? BLOCK_COLOR_PALETTE[0])
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="border border-border rounded-xl p-4 space-y-2.5 bg-white">
        <input
          className="w-full text-sm font-medium border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Název bloku (např. Hero)"
        />
        <input
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Volitelný popis"
        />
        <ColorSwatchPicker value={color} onChange={setColor} />
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={isPending || !name.trim()}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            <Check size={12} strokeWidth={1.5} /> Uložit
          </button>
          <button
            onClick={cancel}
            disabled={isPending}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors"
          >
            <X size={12} strokeWidth={1.5} /> Zrušit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-white group/card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: template.color ?? '#94a3b8' }}
          />
          <h3 className="text-sm font-medium text-foreground truncate">{template.name}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors"
            title="Upravit"
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Smazat šablonu"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {template.description && (
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{template.description}</p>
      )}
    </div>
  )
}

export function BlockTemplateLibrary({ initialTemplates }: { initialTemplates: BlockTemplate[] }) {
  const [templates, setTemplates] = useState<BlockTemplate[]>(initialTemplates)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(BLOCK_COLOR_PALETTE[0])
  const [isPending, startTransition] = useTransition()

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        const created = await createBlockTemplate(trimmed, description, color)
        setTemplates(prev => [...prev, created])
        setName('')
        setDescription('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se vytvořit šablonu.')
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteBlockTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5 bg-slate-50 border border-border rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            placeholder="Název nového bloku (např. Ceník)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            placeholder="Volitelný popis"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <ColorSwatchPicker value={color} onChange={setColor} />
        <button
          onClick={handleCreate}
          disabled={isPending || !name.trim()}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} strokeWidth={1.5} />
          Nová šablona bloku
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Layers size={28} strokeWidth={1.5} className="text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground/70">Zatím žádné bloky. Vytvoř první výše.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map(template => (
            <TemplateCard key={template.id} template={template} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
