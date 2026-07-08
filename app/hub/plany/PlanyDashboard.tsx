'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Target, Plus, Pencil, Trash2, AlertCircle, Loader2, X,
  Wallet, Gauge, ShieldAlert, ArrowRight, Lightbulb,
} from 'lucide-react'
import {
  createPlan, updatePlan, deletePlan,
  type Plan, type PlanPayload, type PlanCategory, type PlanStatus,
} from './plany-actions'
import {
  PLAN_CATEGORIES, PLAN_CATEGORY_LABELS, PLAN_CATEGORY_STYLES,
  PLAN_STATUSES, PLAN_STATUS_LABELS, PLAN_STATUS_STYLES,
} from './plany-constants'
import { cn } from '@/lib/utils'

function formatCZK(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

const STAT_BG: Record<string, string> = {
  slate: 'bg-slate-50',
  sky: 'bg-sky-50',
  emerald: 'bg-emerald-50',
  red: 'bg-red-50',
  amber: 'bg-amber-50',
  violet: 'bg-violet-50',
}

function StatTile({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className={`${STAT_BG[color]} rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

function ScoreDots({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={cn('w-1.5 h-1.5 rounded-full', i < value ? colorClass : 'bg-muted')}
        />
      ))}
    </div>
  )
}

const emptyForm = (): PlanPayload => ({
  title: '',
  description: '',
  category: 'jine',
  status: 'napad',
  potential_value: null,
  effort_score: null,
  risk_score: null,
  next_step: '',
  notes: '',
})

interface Props {
  plans: Plan[]
}

export function PlanyDashboard({ plans }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<PlanStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<PlanCategory | 'all'>('all')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanPayload>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stats = useMemo(() => {
    const counts: Record<PlanStatus, number> = {
      napad: 0, analyza: 0, rozhodnuto_ano: 0, rozhodnuto_ne: 0, aktivni: 0,
    }
    let totalPotential = 0
    for (const p of plans) {
      counts[p.status]++
      if (p.status !== 'rozhodnuto_ne' && p.potential_value) totalPotential += p.potential_value
    }
    return { counts, totalPotential }
  }, [plans])

  const filteredPlans = plans.filter(p =>
    (statusFilter === 'all' || p.status === statusFilter) &&
    (categoryFilter === 'all' || p.category === categoryFilter)
  )

  function openCreateForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(plan: Plan) {
    setEditingId(plan.id)
    setForm({
      title: plan.title,
      description: plan.description ?? '',
      category: plan.category,
      status: plan.status,
      potential_value: plan.potential_value,
      effort_score: plan.effort_score,
      risk_score: plan.risk_score,
      next_step: plan.next_step ?? '',
      notes: plan.notes ?? '',
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
      setFormError('Zadej název plánu')
      return
    }

    setIsSubmitting(true)
    const result = editingId
      ? await updatePlan(editingId, form)
      : await createPlan(form)
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
    await deletePlan(id)
    setIsPending(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Dashboard stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile icon={<Lightbulb size={13} strokeWidth={1.5} className="text-slate-500" />} label="Nápad" value={String(stats.counts.napad)} color="slate" />
        <StatTile icon={<Gauge size={13} strokeWidth={1.5} className="text-sky-600" />} label="V analýze" value={String(stats.counts.analyza)} color="sky" />
        <StatTile icon={<Target size={13} strokeWidth={1.5} className="text-emerald-600" />} label="Schváleno" value={String(stats.counts.rozhodnuto_ano)} color="emerald" />
        <StatTile icon={<X size={13} strokeWidth={1.5} className="text-red-500" />} label="Zamítnuto" value={String(stats.counts.rozhodnuto_ne)} color="red" />
        <StatTile icon={<ArrowRight size={13} strokeWidth={1.5} className="text-amber-600" />} label="Aktivní" value={String(stats.counts.aktivni)} color="amber" />
        <StatTile icon={<Wallet size={13} strokeWidth={1.5} className="text-violet-600" />} label="Potenciál na stole" value={formatCZK(stats.totalPotential)} color="violet" />
      </div>

      {/* Filters + add button */}
      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Target size={16} strokeWidth={1.5} className="text-amber-600" />
            <h2 className="text-base font-semibold text-foreground">Plány</h2>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat plán
          </button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              statusFilter === 'all' ? 'bg-brand-800 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-brand-50 hover:text-brand-800'
            )}
          >
            Vše
          </button>
          {PLAN_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-brand-800 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-brand-50 hover:text-brand-800'
              )}
            >
              {PLAN_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
              categoryFilter === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
            )}
          >
            Všechny kategorie
          </button>
          {PLAN_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                categoryFilter === c ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
              )}
            >
              {PLAN_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Add / edit form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="např. Automatizovaný fakturační nástroj"
                required
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Popis</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Volitelně..."
                rows={2}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Kategorie</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as PlanCategory }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {PLAN_CATEGORIES.map(c => (
                    <option key={c} value={c}>{PLAN_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as PlanStatus }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {PLAN_STATUSES.map(s => (
                    <option key={s} value={s}>{PLAN_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Potenciál (Kč)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.potential_value ?? ''}
                  onChange={e => setForm(f => ({ ...f, potential_value: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="0"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Náročnost (1–10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={form.effort_score ?? ''}
                  onChange={e => setForm(f => ({ ...f, effort_score: e.target.value ? Math.min(10, Math.max(1, Number(e.target.value))) : null }))}
                  placeholder="—"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Riziko (1–10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={form.risk_score ?? ''}
                  onChange={e => setForm(f => ({ ...f, risk_score: e.target.value ? Math.min(10, Math.max(1, Number(e.target.value))) : null }))}
                  placeholder="—"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Další krok</label>
              <input
                type="text"
                value={form.next_step}
                onChange={e => setForm(f => ({ ...f, next_step: e.target.value }))}
                placeholder="např. Zjistit poptávku u 5 potenciálních klientů"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Poznámky</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Volitelně..."
                rows={2}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle size={12} strokeWidth={2} />
                {formError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {editingId ? 'Uložit změny' : 'Přidat plán'}
              </button>
            </div>
          </form>
        )}

        {/* Plan list */}
        <div className="space-y-2.5">
          {filteredPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {plans.length === 0
                ? 'Zatím žádné plány. Přidej první nápad na budoucí projekt, který chceš analyzovat, než se rozhodneš ho spustit.'
                : 'Žádné plány neodpovídají vybranému filtru.'}
            </p>
          ) : (
            filteredPlans.map(plan => (
              <div
                key={plan.id}
                className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{plan.title}</h3>
                      <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', PLAN_STATUS_STYLES[plan.status])}>
                        {PLAN_STATUS_LABELS[plan.status]}
                      </span>
                      <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', PLAN_CATEGORY_STYLES[plan.category])}>
                        {PLAN_CATEGORY_LABELS[plan.category]}
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mb-2">{plan.description}</p>
                    )}
                    {plan.next_step && (
                      <div className="flex items-center gap-1.5 text-xs text-foreground/80 mb-2">
                        <ArrowRight size={11} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                        {plan.next_step}
                      </div>
                    )}
                    <div className="flex items-center gap-4 flex-wrap">
                      {plan.potential_value != null && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <Wallet size={11} strokeWidth={1.5} />
                          {formatCZK(plan.potential_value)}
                        </span>
                      )}
                      {plan.effort_score != null && (
                        <div className="flex items-center gap-1.5">
                          <Gauge size={11} strokeWidth={1.5} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Náročnost</span>
                          <ScoreDots value={plan.effort_score} colorClass="bg-slate-500" />
                        </div>
                      )}
                      {plan.risk_score != null && (
                        <div className="flex items-center gap-1.5">
                          <ShieldAlert size={11} strokeWidth={1.5} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Riziko</span>
                          <ScoreDots value={plan.risk_score} colorClass="bg-orange-500" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEditForm(plan)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      disabled={isPending === plan.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
