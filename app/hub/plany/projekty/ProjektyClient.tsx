'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Plus, Pencil, Trash2, AlertCircle, Loader2, ArrowRight, Wallet } from 'lucide-react'
import {
  createPlanProject, updatePlanProject, deletePlanProject, setProjectActions, moveProjectToBusiness,
  type PlanProject, type PlanProjectAction, type PlanProjectPayload, type PlanProjectStatus,
} from './projekty-plan-actions'
import { GoalStepsChecklist } from '../GoalStepsChecklist'
import { cn, formatCurrency } from '@/lib/utils'

const STATUS_LABELS: Record<PlanProjectStatus, string> = {
  validace: 'Ve validaci',
  schvaleno: 'Schváleno',
  zamitnuto: 'Zamítnuto',
  prevedeno_do_byznysu: 'Převedeno do byznysu',
}

const STATUS_STYLES: Record<PlanProjectStatus, string> = {
  validace: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  schvaleno: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  zamitnuto: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  prevedeno_do_byznysu: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
}

const ACCENT = {
  ring: 'focus:ring-indigo-500/20 focus:border-indigo-500',
  button: 'bg-indigo-600 hover:bg-indigo-700',
  checkbox: 'bg-indigo-600 border-indigo-600',
}

function sentimentColor(pct: number) {
  if (pct < 34) return 'text-red-600'
  if (pct < 67) return 'text-amber-600'
  return 'text-emerald-600'
}

const emptyForm = (): PlanProjectPayload => ({
  title: '', description: '', purpose_meaning: '', problem_solved: '', willingness_to_pay: '',
  potential_notes: '', progress_notes: '', sentiment_pct: 50, planned_investment: null,
  expected_return: null, currency: 'CZK', status: 'validace',
})

interface Props {
  projects: PlanProject[]
  actionsByProject: Record<string, PlanProjectAction[]>
}

export function ProjektyClient({ projects, actionsByProject }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState<string | null>(null)
  const [isMoving, setIsMoving] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<PlanProjectStatus | 'all'>('all')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanProjectPayload>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stats = useMemo(() => {
    const counts: Record<PlanProjectStatus, number> = { validace: 0, schvaleno: 0, zamitnuto: 0, prevedeno_do_byznysu: 0 }
    for (const p of projects) counts[p.status]++
    return counts
  }, [projects])

  const filtered = projects.filter((p) => statusFilter === 'all' || p.status === statusFilter)

  function openCreateForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(project: PlanProject) {
    setEditingId(project.id)
    setForm({
      title: project.title,
      description: project.description ?? '',
      purpose_meaning: project.purpose_meaning ?? '',
      problem_solved: project.problem_solved ?? '',
      willingness_to_pay: project.willingness_to_pay ?? '',
      potential_notes: project.potential_notes ?? '',
      progress_notes: project.progress_notes ?? '',
      sentiment_pct: project.sentiment_pct ?? 50,
      planned_investment: project.planned_investment,
      expected_return: project.expected_return,
      currency: project.currency,
      status: project.status,
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
      setFormError('Zadej název nápadu')
      return
    }
    setIsSubmitting(true)
    const result = editingId ? await updatePlanProject(editingId, form) : await createPlanProject(form)
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
    await deletePlanProject(id)
    setIsPending(null)
    router.refresh()
  }

  async function handleMoveToBusiness(id: string) {
    setIsMoving(id)
    const result = await moveProjectToBusiness(id)
    setIsMoving(null)
    if (result.businessId) {
      router.push(`/hub/plany/byznys/${result.businessId}`)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-sky-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Ve validaci</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.validace}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Schváleno</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.schvaleno}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Zamítnuto</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.zamitnuto}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">V byznysu</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.prevedeno_do_byznysu}</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Layers size={16} strokeWidth={1.5} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-foreground">Nápady k validaci</h2>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat nápad
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === 'all' ? 'bg-indigo-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-indigo-50 hover:text-indigo-700')}
          >
            Vše
          </button>
          {(Object.keys(STATUS_LABELS) as PlanProjectStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', statusFilter === s ? 'bg-indigo-700 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-indigo-50 hover:text-indigo-700')}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Název nápadu</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
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

            <div className="border-t border-border/60 pt-3 space-y-3">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Smysl</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Má to reálný smysl / přínos?</label>
                <textarea
                  value={form.purpose_meaning}
                  onChange={(e) => setForm((f) => ({ ...f, purpose_meaning: e.target.value }))}
                  rows={2}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 space-y-3">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Problém</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Jaký problém to řeší?</label>
                <textarea
                  value={form.problem_solved}
                  onChange={(e) => setForm((f) => ({ ...f, problem_solved: e.target.value }))}
                  rows={2}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 space-y-3">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Ochota platit</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Jsou lidé ochotni za to platit?</label>
                <textarea
                  value={form.willingness_to_pay}
                  onChange={(e) => setForm((f) => ({ ...f, willingness_to_pay: e.target.value }))}
                  rows={2}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 space-y-3">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Potenciál</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Reálný potenciál</label>
                <textarea
                  value={form.potential_notes}
                  onChange={(e) => setForm((f) => ({ ...f, potential_notes: e.target.value }))}
                  rows={2}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Jak se daří — co konkrétně dělám</label>
                <textarea
                  value={form.progress_notes}
                  onChange={(e) => setForm((f) => ({ ...f, progress_notes: e.target.value }))}
                  rows={2}
                  className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT.ring)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between mb-1">
                  <span>Osobní pocit, že se to vyplácí</span>
                  <span className={cn('font-semibold tabular-nums', sentimentColor(form.sentiment_pct ?? 50))}>{form.sentiment_pct ?? 50}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.sentiment_pct ?? 50}
                  onChange={(e) => setForm((f) => ({ ...f, sentiment_pct: Number(e.target.value) }))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600"
                  style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b, #10b981)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Plánovaná investice (Kč)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.planned_investment ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, planned_investment: e.target.value ? Number(e.target.value) : null }))}
                    className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Očekávaná návratnost (Kč)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.expected_return ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, expected_return: e.target.value ? Number(e.target.value) : null }))}
                    className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/60 pt-3">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PlanProjectStatus }))}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT.ring)}
              >
                {(Object.keys(STATUS_LABELS) as PlanProjectStatus[])
                  .filter((s) => s !== 'prevedeno_do_byznysu')
                  .map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
              </select>
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
                {editingId ? 'Uložit změny' : 'Přidat nápad'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {projects.length === 0 ? 'Zatím žádné nápady. Přidej první nápad, který chceš ověřit.' : 'Žádné nápady neodpovídají vybranému filtru.'}
            </p>
          ) : (
            filtered.map((project) => (
              <div key={project.id} className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{project.title}</h3>
                      <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_STYLES[project.status])}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    {project.description && <p className="text-xs text-muted-foreground mb-2">{project.description}</p>}
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      {project.sentiment_pct != null && (
                        <span className={cn('font-medium', sentimentColor(project.sentiment_pct))}>{project.sentiment_pct}% pocit</span>
                      )}
                      {project.planned_investment != null && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Wallet size={11} strokeWidth={1.5} />
                          {formatCurrency(project.planned_investment)}
                        </span>
                      )}
                      {project.expected_return != null && (
                        <span className="flex items-center gap-1 text-emerald-700 font-medium">
                          <ArrowRight size={11} strokeWidth={1.5} />
                          {formatCurrency(project.expected_return)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEditForm(project)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      disabled={isPending === project.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <GoalStepsChecklist
                  steps={(actionsByProject[project.id] ?? []).map((a) => ({ id: a.id, content: a.content, position: a.position, done: a.done }))}
                  onSave={(steps) => setProjectActions(project.id, steps)}
                  accent={ACCENT}
                />

                {project.status === 'schvaleno' && (
                  <button
                    onClick={() => handleMoveToBusiness(project.id)}
                    disabled={isMoving === project.id}
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
                  >
                    {isMoving === project.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} strokeWidth={2} />}
                    Přesunout do Byznys strategie
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
