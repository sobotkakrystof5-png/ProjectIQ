'use client'

import { useState, useTransition } from 'react'
import { Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { addProjectNote, deleteProjectNote } from '@/app/project-notes-actions'
import { formatDateTime } from '@/lib/utils'
import { ProgressBar } from '@/components/ProgressBar'
import type { ProjectNote } from '@/lib/types'

const DEFAULT_AUTHOR = 'Kryštof Sobotka'

export function ProjectNotesPanel({
  projectId,
  initialNotes,
  currentProgress,
}: {
  projectId: string
  initialNotes: ProjectNote[]
  currentProgress: number
}) {
  const [notes, setNotes] = useState<ProjectNote[]>(initialNotes)
  const [author, setAuthor] = useState(DEFAULT_AUTHOR)
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  const sorted = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const handleSubmit = () => {
    const trimmedAuthor = author.trim()
    const trimmedContent = content.trim()
    if (!trimmedAuthor || !trimmedContent) return

    startTransition(async () => {
      try {
        const created = await addProjectNote(projectId, trimmedAuthor, trimmedContent)
        setNotes(prev => [
          {
            id: created.id,
            project_id: projectId,
            author: trimmedAuthor,
            content: trimmedContent,
            progress_snapshot: created.progress_snapshot,
            created_at: created.created_at,
          },
          ...prev,
        ])
        setContent('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nepodařilo se uložit poznámku.')
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteProjectNote(id, projectId)
      setNotes(prev => prev.filter(n => n.id !== id))
    })
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-50 border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:w-56 shrink-0">
            <User size={13} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              className="w-full text-sm border border-border rounded-md pl-8 pr-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              placeholder="Kdo zapisuje"
              value={author}
              onChange={e => setAuthor(e.target.value)}
            />
          </div>
          <textarea
            className="flex-1 text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white"
            placeholder="Co se řešilo na schůzce / hovoru s klientem… (Ctrl/Cmd+Enter pro rychlé uložení)"
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Uloží se se stavem zakázky:</span>
            <span className="font-semibold text-brand-700 tabular-nums">{currentProgress}%</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isPending || !content.trim() || !author.trim()}
            className="shrink-0 text-xs font-medium px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Uložit poznámku
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">Zatím žádné poznámky ze schůzek či hovorů.</p>
      ) : (
        <div className="columns-1 lg:columns-2 gap-4">
          {sorted.map(note => (
            <div
              key={note.id}
              className="break-inside-avoid mb-4 border border-border rounded-xl p-4 bg-white group/note"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
                  <User size={12} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{note.author}</span>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={isPending}
                  className="opacity-0 group-hover/note:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity disabled:opacity-40 shrink-0"
                  title="Smazat poznámku"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mb-3">{note.content}</p>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
                <span className="text-[11px] text-muted-foreground">{formatDateTime(note.created_at)}</span>
                {note.progress_snapshot !== null && (
                  <ProgressBar value={note.progress_snapshot} className="w-24" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
