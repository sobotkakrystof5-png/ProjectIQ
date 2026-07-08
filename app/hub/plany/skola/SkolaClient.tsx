'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, Plus, Pencil, Trash2, AlertCircle, Loader2, CheckCircle2, PauseCircle, Calendar } from 'lucide-react'
import {
  createSchoolGoal, updateSchoolGoal, deleteSchoolGoal, setGoalActions,
  type SchoolGoal, type SchoolGoalAction, type SchoolGoalPayload, type SchoolGoalStatus,
} from './skola-actions'
import { GoalStepsChecklist } from '../GoalStepsChecklist'
import { cn, formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<SchoolGoalStatus, string> = {
  aktivni: 'Aktivní',
  splneno: 'Splněno',
  pozastaveno: 'Pozastaveno',
}

const STATUS_STYLES: Record<SchoolGoalStatus, string> = {
  aktivni: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  splneno: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  pozastaveno: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}

const ACCENT = {
  ring: 'focus:ring-violet-500/20 focus:border-violet-500',
  button: 'bg-violet-600 hover:bg-violet-700',
  checkbox: 'bg-violet-600 border-violet-600',
}

const emptyForm = (): SchoolGoalPayload => ({ title: '', vision: '', approach: '', status: 'aktivni', target_date: null })

interface Props {
  goals: SchoolGoal[]
  actionsByGoal: Record<string, SchoolGoalAction[]>
}

export function SkolaClient({ goals, actionsByGoal }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SchoolGoalStatus | 'all'>('all')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SchoolGoalPayload>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stats = useMemo(() => {
    const counts: Record<SchoolGoalStatus, number> = { aktivni: 0, splneno: 0, pozastaveno: 0 }
    for (const g of goals) counts[g.status]++
    return counts
  }, [goals])

  const filtered = goals.filter((g) => statusFilter === 'all' || g.status === statusFilter)

  function openCreateForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(goal: SchoolGoal) {
    setEditingId(goal.id)
    setForm({
      title: goal.title,
      vision: goal.vision ?? '',
      approach: goal.approach ?? '',
      status: goal.status,
      target_date: goal.target_date,
    })
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim()) {
      setFormError('Zadej název cíle')
      return
    }
    setIsSubmitting(true)
    const result = editingId ? await updateSchoolGoal(editingId, form) : await createSchoolGoal(form)
    setIsSubmitting(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    closeForm()
    router.refresh()
  }

  async function handleDelete(id: string) {
    setIsPending(id)
    await deleteSchoolGoal(id)
    setIsPending(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-violet-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <GraduationCap size={13} strokeWidth={1.5} className="text-violet-600" />
            <span className="text-xs text-muted-foreground">Aktivní</span>
          </div>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.aktivni}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={13} strokeWidth={1.5} className="text-emerald-600" />
            <span className="text-xs text-muted-foreground">Splněno</span>
          </div>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.splneno}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <PauseCircle size={13} strokeWidth={1.5} className="text-slate-500" />
            <span className="text-xs text-muted-foreground">Pozastaveno</span>
          </div>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.pozastaveno}</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} strokeWidth={1.5} className="text-violet-600" />
            <h2 className="text-base font-semibold text-foreground">Cíle ve studiu</h2>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat cíl
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === 'all' ? 'bg-violet-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-violet-50 hover:text-violet-700')}
          >
            Vše
          </button>
          {(Object.keys(STATUS_LABELS) as SchoolGoalStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === s ? 'bg-violet-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-violet-50 hover:text-violet-700')}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="např. Dokončit bakalářský titul"
                required
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Vize — proč to chci</label>
              <textarea
                value={form.vision}
                onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))}
                rows={2}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Přístup — jak toho chci dosáhnout</label>
              <textarea
                value={form.approach}
                onChange={(e) => setForm((f) => ({ ...f, approach: e.target.value }))}
                rows={2}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SchoolGoalStatus }))}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                >
                  {(Object.keys(STATUS_LABELS) as SchoolGoalStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Termín</label>
                <input
                  type="date"
                  value={form.target_date ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value || null }))}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                />
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle size={12} strokeWidth={2} />
                {formError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeForm} className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                Zrušit
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn('flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2', ACCENT.button)}
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {editingId ? 'Uložit změny' : 'Přidat cíl'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {goals.length === 0 ? 'Zatím žádné cíle. Přidej první studijní cíl.' : 'Žádné cíle neodpovídají vybranému filtru.'}
            </p>
          ) : (
            filtered.map((goal) => (
              <div key={goal.id} className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                      <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_STYLES[goal.status])}>
                        {STATUS_LABELS[goal.status]}
                      </span>
                    </div>
                    {goal.vision && <p className="text-xs text-muted-foreground mb-1">{goal.vision}</p>}
                    {goal.approach && <p className="text-xs text-muted-foreground/80 mb-1">{goal.approach}</p>}
                    {goal.target_date && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar size={10} strokeWidth={1.5} />
                        {formatDate(goal.target_date)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEditForm(goal)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      disabled={isPending === goal.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <GoalStepsChecklist
                  steps={(actionsByGoal[goal.id] ?? []).map((a) => ({ id: a.id, content: a.content, position: a.position, done: a.done }))}
                  onSave={(steps) => setGoalActions(goal.id, steps)}
                  accent={ACCENT}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
