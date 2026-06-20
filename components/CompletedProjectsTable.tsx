'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronDown } from 'lucide-react'
import {
  createCompletedProject,
  updateCompletedProject,
  deleteCompletedProject,
  type CompletedProjectPayload,
} from '@/app/completed-actions'
import type { CompletedProject, ProjectType } from '@/lib/types'

const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-emerald-100 text-emerald-700',
  3: 'bg-emerald-100 text-emerald-700',
  4: 'bg-amber-100 text-amber-700',
  5: 'bg-amber-100 text-amber-700',
  6: 'bg-amber-100 text-amber-700',
  7: 'bg-orange-100 text-orange-700',
  8: 'bg-orange-100 text-orange-700',
  9: 'bg-red-100 text-red-700',
  10: 'bg-red-100 text-red-700',
}

function difficultyColor(d: number) {
  return DIFFICULTY_COLORS[Math.min(10, Math.max(1, Math.round(d)))] ?? 'bg-slate-100 text-slate-600'
}

const EMPTY_FORM = (type: ProjectType): CompletedProjectPayload => ({
  title: '',
  client_name: null,
  company: null,
  completed_at: new Date().toISOString().slice(0, 10),
  amount: 0,
  difficulty: 5,
  time_invested: null,
  notes: null,
  project_type: type,
})

function ProjectForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: CompletedProjectPayload
  onSave: (data: CompletedProjectPayload) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<CompletedProjectPayload>(initial)
  const set = (field: keyof CompletedProjectPayload, value: string | number | null) =>
    setForm(prev => ({ ...prev, [field]: value === '' ? null : value }))

  return (
    <tr className="bg-brand-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Název zakázky *"
          value={form.title}
          onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Klient"
          value={form.client_name ?? ''}
          onChange={e => set('client_name', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Firma"
          value={form.company ?? ''}
          onChange={e => set('company', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.completed_at}
          onChange={e => set('completed_at', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Kč"
          value={form.amount || ''}
          onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <select
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
            value={form.difficulty}
            onChange={e => setForm(prev => ({ ...prev, difficulty: Number(e.target.value) }))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          step="0.5"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="hod."
          value={form.time_invested ?? ''}
          onChange={e => set('time_invested', e.target.value ? Number(e.target.value) : null)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Poznámka"
          value={form.notes ?? ''}
          onChange={e => set('notes', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            disabled={!form.title.trim() || isPending}
            onClick={() => form.title.trim() && onSave(form)}
            className="p-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function ProjectRow({
  project,
  onEdit,
  onDelete,
  isPending,
}: {
  project: CompletedProject
  onEdit: () => void
  onDelete: () => void
  isPending: boolean
}) {
  return (
    <tr className="border-t border-border hover:bg-slate-50/60 transition-colors group">
      <td className="px-3 py-2.5">
        <span className="text-sm font-medium text-foreground">{project.title}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground">{project.client_name ?? <span className="text-muted-foreground/40">—</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground">{project.company ?? <span className="text-muted-foreground/40">—</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground">
          {new Date(project.completed_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm font-semibold text-emerald-700">
          {Number(project.amount).toLocaleString('cs-CZ')} Kč
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${difficultyColor(project.difficulty)}`}>
          {project.difficulty}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {project.time_invested != null ? (
          <span className="text-sm text-foreground">{Number(project.time_invested).toLocaleString('cs-CZ')} h</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 max-w-[180px]">
        <span className="text-sm text-muted-foreground truncate block">{project.notes ?? ''}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function CompletedProjectsTable({ initialProjects }: { initialProjects: CompletedProject[] }) {
  const [projects, setProjects] = useState<CompletedProject[]>(initialProjects)
  const [tab, setTab] = useState<ProjectType>('client')
  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = projects.filter(p => p.project_type === tab)

  const handleCreate = (data: CompletedProjectPayload) => {
    startTransition(async () => {
      await createCompletedProject(data)
      setProjects(prev => [{
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date(),
      } as CompletedProject, ...prev])
      setAddingNew(false)
    })
  }

  const handleUpdate = (id: string, data: CompletedProjectPayload) => {
    startTransition(async () => {
      await updateCompletedProject(id, data)
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
      setEditingId(null)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Opravdu smazat tuto zakázku?')) return
    startTransition(async () => {
      await deleteCompletedProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
    })
  }

  const clientCount = projects.filter(p => p.project_type === 'client').length
  const personalCount = projects.filter(p => p.project_type === 'personal').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dokončené zakázky</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projects.length} {projects.length === 1 ? 'zakázka' : projects.length < 5 ? 'zakázky' : 'zakázek'} celkem
          </p>
        </div>
        <button
          onClick={() => { setAddingNew(true); setEditingId(null) }}
          disabled={addingNew}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={14} />
          Přidat zakázku
        </button>
      </div>

      <div className="flex gap-1 mb-3">
        <button
          onClick={() => { setTab('client'); setAddingNew(false); setEditingId(null) }}
          className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
            tab === 'client'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-brand-800 hover:bg-brand-50'
          }`}
        >
          Zakázky pro klienty
          {clientCount > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === 'client' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {clientCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab('personal'); setAddingNew(false); setEditingId(null) }}
          className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
            tab === 'personal'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-brand-800 hover:bg-brand-50'
          }`}
        >
          Osobní projekty
          {personalCount > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === 'personal' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {personalCount}
            </span>
          )}
        </button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Název</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Klient</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Firma</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Částka</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Náročnost</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Čas</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Poznámka</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <ProjectForm
                  initial={EMPTY_FORM(tab)}
                  onSave={handleCreate}
                  onCancel={() => setAddingNew(false)}
                  isPending={isPending}
                />
              )}
              {filtered.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {tab === 'client'
                      ? 'Zatím žádné klientské zakázky. Přidej svoji první dokončenou zakázku.'
                      : 'Zatím žádné osobní projekty. Přidej aplikace, systémy nebo automatizace, které jsi vytvořil.'}
                  </td>
                </tr>
              )}
              {filtered.map(project =>
                editingId === project.id ? (
                  <ProjectForm
                    key={project.id}
                    initial={{
                      title: project.title,
                      client_name: project.client_name,
                      company: project.company,
                      completed_at: new Date(project.completed_at).toISOString().slice(0, 10),
                      amount: Number(project.amount),
                      difficulty: project.difficulty,
                      time_invested: project.time_invested != null ? Number(project.time_invested) : null,
                      notes: project.notes,
                      project_type: project.project_type,
                    }}
                    onSave={(data) => handleUpdate(project.id, data)}
                    onCancel={() => setEditingId(null)}
                    isPending={isPending}
                  />
                ) : (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onEdit={() => { setEditingId(project.id); setAddingNew(false) }}
                    onDelete={() => handleDelete(project.id)}
                    isPending={isPending}
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
