'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import {
  addChangelogEntry,
  deleteChangelogEntry,
} from '@/app/hub/byznys/startup/startup-actions'
import {
  CHANGE_TYPE_LABELS,
  CHANGE_TYPE_STYLES,
  type StartupChangelogEntry,
  type ChangeType,
} from '@/lib/types'

const CHANGE_TYPES = Object.entries(CHANGE_TYPE_LABELS) as [ChangeType, string][]

interface Props {
  projectId: string
  initialEntries: StartupChangelogEntry[]
}

export function StartupChangelog({ projectId, initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [type, setType] = useState<ChangeType>('development')
  const [description, setDescription] = useState('')
  const [progressFrom, setProgressFrom] = useState('')
  const [progressTo, setProgressTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const progressDiff = progressFrom && progressTo
    ? parseInt(progressTo) - parseInt(progressFrom)
    : null

  const handleAdd = async () => {
    if (!description.trim()) { toast.error('Popis změny je povinný'); return }

    setSubmitting(true)
    const result = await addChangelogEntry(projectId, {
      change_date: date,
      change_type: type,
      description: description.trim(),
      progress_from: progressFrom ? parseInt(progressFrom) : null,
      progress_to: progressTo ? parseInt(progressTo) : null,
    })
    setSubmitting(false)

    if (result.error) { toast.error(result.error); return }
    if (result.entry) setEntries(prev => [result.entry!, ...prev])

    setDescription('')
    setProgressFrom('')
    setProgressTo('')
    setShowForm(false)
    toast.success('Změna zaznamenána')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deleteChangelogEntry(id, projectId)
    setDeletingId(null)
    if (result.error) { toast.error(result.error); return }
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Add button / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Zaznamenat změnu
        </button>
      ) : (
        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Nový záznam</span>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Zrušit
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Typ změny</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as ChangeType)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              >
                {CHANGE_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Popis změny</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Co konkrétně bylo uděláno?"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          {/* Progress change */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Posun v postupu projektu (volitelné)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={progressFrom}
                onChange={e => setProgressFrom(e.target.value)}
                placeholder="Bylo %"
                min={0}
                max={100}
                className="w-24 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              />
              <ArrowRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
              <input
                type="number"
                value={progressTo}
                onChange={e => setProgressTo(e.target.value)}
                placeholder="Nyní %"
                min={0}
                max={100}
                className="w-24 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              />
              {progressDiff !== null && (
                <span className={`text-sm font-semibold ${progressDiff > 0 ? 'text-emerald-600' : progressDiff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {progressDiff > 0 ? '+' : ''}{progressDiff} %
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !description.trim()}
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Ukládá se…' : 'Uložit záznam'}
          </button>
        </div>
      )}

      {/* Timeline */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Zatím žádné záznamy. Začni dokumentovat změny projektu.</p>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-4 pl-6">
            {entries.map(entry => {
              const diff = entry.progress_from !== null && entry.progress_to !== null
                ? entry.progress_to - entry.progress_from
                : null

              return (
                <div key={entry.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-2 w-3.5 h-3.5 rounded-full border-2 border-white bg-brand-400 shadow-sm" />

                  <div className="bg-white border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${CHANGE_TYPE_STYLES[entry.change_type as ChangeType]}`}>
                          {CHANGE_TYPE_LABELS[entry.change_type as ChangeType] ?? entry.change_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.change_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        {diff !== null && (
                          <span className={`text-xs font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {entry.progress_from} % → {entry.progress_to} %
                            {' '}
                            <span className="text-muted-foreground font-normal">
                              ({diff > 0 ? '+' : ''}{diff} %)
                            </span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{entry.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
