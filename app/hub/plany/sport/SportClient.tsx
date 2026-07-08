'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dumbbell, Plus, Pencil, Trash2, AlertCircle, Loader2, CheckCircle2, PauseCircle, Calendar, TrendingUp } from 'lucide-react'
import {
  createHealthGoal, updateHealthGoal, deleteHealthGoal, setGoalActions, addHealthGoalLog,
  type HealthGoal, type HealthGoalAction, type HealthGoalLog, type HealthGoalPayload, type HealthGoalStatus,
} from './sport-goals-actions'
import { GoalStepsChecklist } from '../GoalStepsChecklist'
import { Sparkline } from '../Sparkline'
import { cn, formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<HealthGoalStatus, string> = {
  aktivni: 'Aktivní',
  splneno: 'Splněno',
  pozastaveno: 'Pozastaveno',
}

const STATUS_STYLES: Record<HealthGoalStatus, string> = {
  aktivni: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  splneno: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  pozastaveno: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}

const ACCENT = {
  ring: 'focus:ring-rose-500/20 focus:border-rose-500',
  button: 'bg-rose-600 hover:bg-rose-700',
  checkbox: 'bg-rose-600 border-rose-600',
}

const emptyForm = (): HealthGoalPayload => ({
  title: '', description: '', target_value: null, current_value: null, unit: '', status: 'aktivni', target_date: null,
})

interface Props {
  goals: HealthGoal[]
  actionsByGoal: Record<string, HealthGoalAction[]>
  logsByGoal: Record<string, HealthGoalLog[]>
}

export function SportClient({ goals, actionsByGoal, logsByGoal }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<HealthGoalStatus | 'all'>('all')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HealthGoalPayload>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [logGoalId, setLogGoalId] = useState<string | null>(null)
  const [logValue, setLogValue] = useState('')
  const [logNote, setLogNote] = useState('')
  const [isLogging, setIsLogging] = useState(false)

  const stats = useMemo(() => {
    const counts: Record<HealthGoalStatus, number> = { aktivni: 0, splneno: 0, pozastaveno: 0 }
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

  function openEditForm(goal: HealthGoal) {
    setEditingId(goal.id)
    setForm({
      title: goal.title,
      description: goal.description ?? '',
      target_value: goal.target_value,
      current_value: goal.current_value,
      unit: goal.unit ?? '',
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
    const result = editingId ? await updateHealthGoal(editingId, form) : await createHealthGoal(form)
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
    await deleteHealthGoal(id)
    setIsPending(null)
    router.refresh()
  }

  function openLogForm(goalId: string) {
    setLogGoalId(goalId)
    setLogValue('')
    setLogNote('')
  }

  async function handleAddLog(goalId: string) {
    const value = Number(logValue.replace(',', '.'))
    if (!logValue || Number.isNaN(value)) return
    setIsLogging(true)
    await addHealthGoalLog(goalId, { value, note: logNote.trim() || undefined })
    setIsLogging(false)
    setLogGoalId(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-rose-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Dumbbell size={13} strokeWidth={1.5} className="text-rose-600" />
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
            <Dumbbell size={16} strokeWidth={1.5} className="text-rose-600" />
            <h2 className="text-base font-semibold text-foreground">Zdravotní a sportovní cíle</h2>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat cíl
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === 'all' ? 'bg-rose-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-700')}
          >
            Vše
          </button>
          {(Object.keys(STATUS_LABELS) as HealthGoalStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === s ? 'bg-rose-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-700')}
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
                placeholder="např. Zhubnout, Spát déle, Suplementace"
                required
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Popis</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Cílová hodnota</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.target_value ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value ? Number(e.target.value) : null }))}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Aktuální hodnota</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.current_value ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value ? Number(e.target.value) : null }))}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Jednotka</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="kg, h, ..."
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as HealthGoalStatus }))}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                >
                  {(Object.keys(STATUS_LABELS) as HealthGoalStatus[]).map((s) => (
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
              {goals.length === 0 ? 'Zatím žádné cíle. Přidej první sportovní nebo zdravotní cíl.' : 'Žádné cíle neodpovídají vybranému filtru.'}
            </p>
          ) : (
            filtered.map((goal) => {
              const logs = logsByGoal[goal.id] ?? []
              return (
                <div key={goal.id} className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                        <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_STYLES[goal.status])}>
                          {STATUS_LABELS[goal.status]}
                        </span>
                      </div>
                      {goal.description && <p className="text-xs text-muted-foreground mb-1">{goal.description}</p>}
                      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                        {goal.current_value != null && (
                          <span>Aktuálně: <span className="font-medium text-foreground">{goal.current_value}{goal.unit ? ` ${goal.unit}` : ''}</span></span>
                        )}
                        {goal.target_value != null && (
                          <span>Cíl: <span className="font-medium text-foreground">{goal.target_value}{goal.unit ? ` ${goal.unit}` : ''}</span></span>
                        )}
                        {goal.target_date && (
                          <span className="flex items-center gap-1">
                            <Calendar size={10} strokeWidth={1.5} />
                            {formatDate(goal.target_date)}
                          </span>
                        )}
                      </div>
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

                  {logs.length >= 2 && (
                    <div className="flex items-center gap-3 mb-3 bg-muted/30 rounded-lg px-3 py-2">
                      <Sparkline values={logs.map((l) => l.value)} colorClass="text-rose-500" />
                      <div className="text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1 text-rose-600 font-medium">
                          <TrendingUp size={10} strokeWidth={1.5} />
                          {logs.length} záznamů
                        </div>
                        <div>poslední: {formatDate(logs[logs.length - 1].log_date)}</div>
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    {logGoalId === goal.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={logValue}
                          onChange={(e) => setLogValue(e.target.value)}
                          placeholder="hodnota"
                          className={cn('w-24 text-xs border border-border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                        />
                        <input
                          type="text"
                          value={logNote}
                          onChange={(e) => setLogNote(e.target.value)}
                          placeholder="poznámka (volitelně)"
                          className={cn('flex-1 text-xs border border-border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                        />
                        <button
                          onClick={() => handleAddLog(goal.id)}
                          disabled={isLogging}
                          className={cn('flex items-center gap-1 text-[10px] font-medium text-white rounded-md px-2 py-1 transition-colors disabled:opacity-60', ACCENT.button)}
                        >
                          {isLogging && <Loader2 size={10} className="animate-spin" />}
                          Uložit
                        </button>
                        <button onClick={() => setLogGoalId(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                          Zrušit
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => openLogForm(goal.id)} className="text-[10px] font-medium text-rose-700 hover:text-rose-800 transition-colors">
                        + Zaznamenat hodnotu
                      </button>
                    )}
                  </div>

                  <GoalStepsChecklist
                    steps={(actionsByGoal[goal.id] ?? []).map((a) => ({ id: a.id, content: a.content, position: a.position, done: a.done }))}
                    onSave={(steps) => setGoalActions(goal.id, steps)}
                    accent={ACCENT}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
