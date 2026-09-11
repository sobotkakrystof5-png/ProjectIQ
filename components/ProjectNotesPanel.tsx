'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Plus, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { addProjectNote, deleteProjectNote } from '@/app/project-notes-actions'
import { formatDate } from '@/lib/utils'
import type { ProjectNote } from '@/lib/types'

const NEW_SECTION_VALUE = '__new__'

export function ProjectNotesPanel({
  projectId,
  initialNotes,
}: {
  projectId: string
  initialNotes: ProjectNote[]
}) {
  const [notes, setNotes] = useState<ProjectNote[]>(initialNotes)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [selectedSection, setSelectedSection] = useState<string>(NEW_SECTION_VALUE)
  const [newSectionName, setNewSectionName] = useState('')
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  const sections = useMemo(() => {
    const map = new Map<string, ProjectNote[]>()
    for (const note of notes) {
      const list = map.get(note.section)
      if (list) list.push(note)
      else map.set(note.section, [note])
    }
    return Array.from(map.entries())
      .map(([section, sectionNotes]) => ({
        section,
        notes: sectionNotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }))
      .sort((a, b) => new Date(b.notes[0].created_at).getTime() - new Date(a.notes[0].created_at).getTime())
  }, [notes])

  const existingSectionNames = useMemo(
    () => Array.from(new Set(notes.map(n => n.section))).sort((a, b) => a.localeCompare(b)),
    [notes]
  )

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const handleSubmit = () => {
    const section = (selectedSection === NEW_SECTION_VALUE ? newSectionName : selectedSection).trim()
    const trimmedContent = content.trim()
    if (!section || !trimmedContent) return

    startTransition(async () => {
      try {
        const created = await addProjectNote(projectId, section, trimmedContent)
        setNotes(prev => [
          { id: created.id, project_id: projectId, section, content: trimmedContent, created_at: created.created_at },
          ...prev,
        ])
        setContent('')
        if (selectedSection === NEW_SECTION_VALUE) {
          setNewSectionName('')
          setSelectedSection(section)
        }
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
      <div className="space-y-2 bg-slate-50 border border-border rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative sm:w-56 shrink-0">
            <select
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
            >
              <option value={NEW_SECTION_VALUE}>+ Nová sekce</option>
              {existingSectionNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {selectedSection === NEW_SECTION_VALUE && (
            <input
              className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Název nové sekce (např. Na co primárně cílit)"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
            />
          )}
        </div>
        <textarea
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white"
          placeholder="Nová poznámka…"
          rows={2}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          disabled={
            isPending ||
            !content.trim() ||
            (selectedSection === NEW_SECTION_VALUE ? !newSectionName.trim() : false)
          }
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} strokeWidth={1.5} />
          Přidat poznámku
        </button>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">Zatím žádné poznámky. Vytvoř první sekci výše.</p>
      ) : (
        <div className="space-y-3">
          {sections.map(({ section, notes: sectionNotes }) => {
            const collapsed = collapsedSections.has(section)
            return (
              <div key={section} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <StickyNote size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                    {section}
                    <span className="text-xs text-muted-foreground font-normal">({sectionNotes.length})</span>
                  </span>
                  {collapsed
                    ? <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                    : <ChevronDown size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                  }
                </button>
                {!collapsed && (
                  <ul className="px-4 py-3 space-y-3">
                    {sectionNotes.map((note, i) => (
                      <li key={note.id} className="relative flex gap-3 group/note">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                          {i < sectionNotes.length - 1 && <div className="w-px flex-1 bg-brand-100 mt-1" />}
                        </div>
                        <div className="pb-3 flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                            <button
                              onClick={() => handleDelete(note.id)}
                              disabled={isPending}
                              className="opacity-0 group-hover/note:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity disabled:opacity-40"
                              title="Smazat poznámku"
                            >
                              <Trash2 size={11} strokeWidth={1.5} />
                            </button>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
