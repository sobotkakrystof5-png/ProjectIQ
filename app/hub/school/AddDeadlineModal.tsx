'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { SUBJECTS } from './subjects'
import { addDeadline } from './actions'

const TYPES = [
  { id: 'klassenarbeit' as const, label: 'Klassenarbeit', short: 'KA' },
  { id: 'homework' as const,      label: 'Hausaufgabe',   short: 'Úkol' },
  { id: 'presentation' as const,  label: 'Präsentation',  short: 'Referát' },
  { id: 'other' as const,         label: 'Sonstiges',     short: 'Jiné' },
]

export function AddDeadlineModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [type, setType] = useState<'klassenarbeit' | 'homework' | 'presentation' | 'other'>('homework')
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!title.trim() || !dueDate) return
    startTransition(async () => {
      await addDeadline({
        title: title.trim(),
        subject: subject || null,
        dueDate,
        type,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Přidat termín</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Typ
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  title={t.label}
                  className={`py-2 text-xs font-medium rounded-xl border transition-colors ${
                    type === t.id
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-border text-muted-foreground hover:bg-slate-50'
                  }`}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Název
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="z.B. KA Mathematik – Gleichungen…"
              autoFocus
              className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Předmět (nepovinné)
            </label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            >
              <option value="">— bez předmětu —</option>
              {SUBJECTS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Termín
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-slate-50 transition-colors"
          >
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !dueDate || pending}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Ukládám…' : 'Přidat'}
          </button>
        </div>
      </div>
    </div>
  )
}
