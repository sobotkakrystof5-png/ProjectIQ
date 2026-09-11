'use client'

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { BLOCK_COLOR_PALETTE, type BlockTemplate } from '@/lib/types'

export function BlockLibraryPicker({
  templates,
  isPending,
  onAddFromTemplate,
  onAddCustom,
}: {
  templates: BlockTemplate[]
  isPending: boolean
  onAddFromTemplate: (templateId: string) => void
  onAddCustom: (title: string, color: string) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(BLOCK_COLOR_PALETTE[0])

  const submitCustom = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onAddCustom(trimmed, color)
    setTitle('')
    setCustomOpen(false)
  }

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => onAddFromTemplate(template.id)}
              disabled={isPending}
              className="flex items-center gap-2 text-left border border-border rounded-lg px-3 py-2 hover:border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-40"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: template.color ?? '#94a3b8' }}
              />
              <span className="text-sm text-foreground truncate">{template.name}</span>
            </button>
          ))}
        </div>
      )}

      {customOpen ? (
        <div className="space-y-2 bg-slate-50 border border-border rounded-lg p-3">
          <input
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            placeholder="Název bloku…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {BLOCK_COLOR_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check size={11} strokeWidth={2.5} className="text-white" />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submitCustom}
              disabled={isPending || !title.trim()}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              Přidat
            </button>
            <button
              onClick={() => { setCustomOpen(false); setTitle('') }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors"
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
        >
          <Plus size={12} strokeWidth={1.5} />
          Vlastní blok bez šablony
        </button>
      )}
    </div>
  )
}
