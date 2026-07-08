'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Target, PiggyBank, TrendingUp, Gift, Plus, Pencil, Trash2, AlertCircle, Loader2,
  TrendingDown, Minus, Calendar,
} from 'lucide-react'
import {
  createFinanceGoal, updateFinanceGoal, deleteFinanceGoal,
  addSavingsSnapshot, deleteSavingsSnapshot,
  createWishlistItem, updateWishlistItem, deleteWishlistItem,
  type PlanFinanceGoal, type PlanFinanceGoalPayload,
  type PlanSavingsSnapshot, type SavingsTrend,
  type PlanWishlistItem, type PlanWishlistItemPayload, type WishlistItemType, type WishlistItemStatus,
} from './finance-plan-actions'
import { Sparkline } from '../Sparkline'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type Tab = 'cile' | 'uspory' | 'investice' | 'prani'

const TABS: { key: Tab; label: string; icon: typeof Target }[] = [
  { key: 'cile', label: 'Cíle', icon: Target },
  { key: 'uspory', label: 'Úspory', icon: PiggyBank },
  { key: 'investice', label: 'Investice', icon: TrendingUp },
  { key: 'prani', label: 'Přání', icon: Gift },
]

const ACCENT_RING = 'focus:ring-emerald-500/20 focus:border-emerald-500'

function progressColor(pct: number) {
  if (pct < 30) return 'bg-red-500'
  if (pct < 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', progressColor(clamped))} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function pctLabel(pct: number | null) {
  if (pct === null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

interface Props {
  goals: PlanFinanceGoal[]
  snapshots: PlanSavingsSnapshot[]
  trend: SavingsTrend
  wishlist: PlanWishlistItem[]
}

export function FinanceClient({ goals, snapshots, trend, wishlist }: Props) {
  const [tab, setTab] = useState<Tab>('cile')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 bg-muted/40 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon size={13} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'cile' && <GoalsTab goals={goals} />}
      {tab === 'uspory' && <SavingsTab snapshots={snapshots} trend={trend} />}
      {tab === 'investice' && <WishlistTab items={wishlist} itemType="investice" title="Investice" createLabel="Přidat investici" />}
      {tab === 'prani' && <WishlistTab items={wishlist} itemType="nakup" title="Přání" createLabel="Přidat přání" />}
    </div>
  )
}

// ─── Cíle ───────────────────────────────────────────────────────────────────

const emptyGoalForm = (): PlanFinanceGoalPayload => ({ title: '', target_amount: 0, period: '', target_date: null, current_amount: 0, notes: '' })

function GoalsTab({ goals }: { goals: PlanFinanceGoal[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanFinanceGoalPayload>(emptyGoalForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, setIsPending] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(emptyGoalForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(goal: PlanFinanceGoal) {
    setEditingId(goal.id)
    setForm({
      title: goal.title, target_amount: goal.target_amount, period: goal.period ?? '',
      target_date: goal.target_date, current_amount: goal.current_amount, notes: goal.notes ?? '',
    })
    setFormError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim() || !form.target_amount) {
      setFormError('Vyplň název a cílovou částku')
      return
    }
    setIsSubmitting(true)
    const result = editingId ? await updateFinanceGoal(editingId, form) : await createFinanceGoal(form)
    setIsSubmitting(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setIsPending(id)
    await deleteFinanceGoal(id)
    setIsPending(null)
    router.refresh()
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Finanční cíle</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} strokeWidth={2} />
          Přidat cíl
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="např. Vydělat 1M za rok"
              required
              className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cílová částka (Kč)</label>
              <input
                type="number"
                min="0"
                value={form.target_amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, target_amount: Number(e.target.value) }))}
                required
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Aktuální částka (Kč)</label>
              <input
                type="number"
                min="0"
                value={form.current_amount ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, current_amount: Number(e.target.value) }))}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Perioda</label>
              <input
                type="text"
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                placeholder="rok, měsíc..."
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Termín</label>
              <input
                type="date"
                value={form.target_date ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value || null }))}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Poznámky</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT_RING)}
            />
          </div>
          {formError && (
            <div className="flex items-center gap-2 text-red-600 text-xs">
              <AlertCircle size={12} strokeWidth={2} />
              {formError}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Uložit změny' : 'Přidat cíl'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2.5">
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Zatím žádné finanční cíle.</p>
        ) : (
          goals.map((goal) => {
            const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0
            return (
              <div key={goal.id} className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                      <span>{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</span>
                      {goal.period && <span>· {goal.period}</span>}
                      {goal.target_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} strokeWidth={1.5} />
                          {formatDate(goal.target_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(goal)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button onClick={() => handleDelete(goal.id)} disabled={isPending === goal.id} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30">
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <ProgressBar pct={pct} />
                {goal.notes && <p className="text-xs text-muted-foreground mt-2">{goal.notes}</p>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Úspory ─────────────────────────────────────────────────────────────────

function TrendBadge({ label, pct }: { label: string; pct: number | null }) {
  const Icon = pct === null ? Minus : pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus
  const color = pct === null ? 'text-muted-foreground' : pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-600' : 'text-muted-foreground'
  return (
    <div className="bg-muted/30 rounded-xl p-3">
      <span className="text-xs text-muted-foreground block mb-1">{label}</span>
      <div className={cn('flex items-center gap-1 text-base font-semibold tabular-nums', color)}>
        <Icon size={14} strokeWidth={2} />
        {pctLabel(pct)}
      </div>
    </div>
  )
}

function SavingsTab({ snapshots, trend }: { snapshots: PlanSavingsSnapshot[]; trend: SavingsTrend }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, setIsPending] = useState<string | null>(null)

  const chronological = [...snapshots].reverse()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = Number(amount.replace(',', '.'))
    if (!amount || Number.isNaN(value)) {
      setError('Zadej platnou částku')
      return
    }
    setIsSubmitting(true)
    const result = await addSavingsSnapshot({ amount: value, note: note.trim() || undefined })
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setAmount('')
    setNote('')
    router.refresh()
  }

  async function handleDelete(id: string) {
    setIsPending(id)
    await deleteSavingsSnapshot(id)
    setIsPending(null)
    router.refresh()
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold text-foreground">Úspory</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/30 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Aktuálně</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{trend.current != null ? formatCurrency(trend.current) : '—'}</p>
        </div>
        <TrendBadge label="MoM" pct={trend.momPct} />
        <TrendBadge label="YoY" pct={trend.yoyPct} />
      </div>

      {chronological.length >= 2 && (
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2 w-fit">
          <Sparkline values={chronological.map((s) => s.amount)} colorClass="text-emerald-500" />
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2 bg-muted/30 border border-border rounded-xl p-3">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Částka (Kč)"
          className={cn('w-36 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Poznámka (volitelně)"
          className={cn('flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          Přidat
        </button>
      </form>
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-xs">
          <AlertCircle size={12} strokeWidth={2} />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Zatím žádné záznamy úspor.</p>
        ) : (
          snapshots.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2 group">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">{formatDate(s.snapshot_date)}</span>
                <span className="font-medium text-foreground">{formatCurrency(s.amount)}</span>
                {s.note && <span className="text-muted-foreground">{s.note}</span>}
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                disabled={isPending === s.id}
                className="p-1 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Investice / Přání (sdílená komponenta, liší se item_type) ────────────

const emptyWishlistForm = (itemType: WishlistItemType): PlanWishlistItemPayload => ({
  item_type: itemType, title: '', target_amount: 0, saved_amount: 0, purpose: '', expected_return_pct: null, status: 'aktivni',
})

function WishlistTab({ items, itemType, title, createLabel }: { items: PlanWishlistItem[]; itemType: WishlistItemType; title: string; createLabel: string }) {
  const router = useRouter()
  const filtered = items.filter((i) => i.item_type === itemType)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanWishlistItemPayload>(emptyWishlistForm(itemType))
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, setIsPending] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(emptyWishlistForm(itemType))
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(item: PlanWishlistItem) {
    setEditingId(item.id)
    setForm({
      item_type: item.item_type, title: item.title, target_amount: item.target_amount,
      saved_amount: item.saved_amount, purpose: item.purpose ?? '',
      expected_return_pct: item.expected_return_pct, status: item.status,
    })
    setFormError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim() || !form.target_amount) {
      setFormError('Vyplň název a cílovou částku')
      return
    }
    setIsSubmitting(true)
    const result = editingId ? await updateWishlistItem(editingId, form) : await createWishlistItem(form)
    setIsSubmitting(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setIsPending(id)
    await deleteWishlistItem(id)
    setIsPending(null)
    router.refresh()
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} strokeWidth={2} />
          {createLabel}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cílová částka (Kč)</label>
              <input
                type="number"
                min="0"
                value={form.target_amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, target_amount: Number(e.target.value) }))}
                required
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Naspořeno (Kč)</label>
              <input
                type="number"
                min="0"
                value={form.saved_amount ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, saved_amount: Number(e.target.value) }))}
                className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">K čemu mi to bude</label>
            <textarea
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              rows={2}
              className={cn('w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 resize-none', ACCENT_RING)}
            />
          </div>
          {itemType === 'investice' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Očekávaný výnos (% p.a.)</label>
              <input
                type="number"
                step="0.1"
                value={form.expected_return_pct ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, expected_return_pct: e.target.value ? Number(e.target.value) : null }))}
                className={cn('w-full sm:w-40 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as WishlistItemStatus }))}
              className={cn('w-full sm:w-48 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2', ACCENT_RING)}
            >
              <option value="aktivni">Aktivní</option>
              <option value="splneno">Splněno</option>
              <option value="zruseno">Zrušeno</option>
            </select>
          </div>
          {formError && (
            <div className="flex items-center gap-2 text-red-600 text-xs">
              <AlertCircle size={12} strokeWidth={2} />
              {formError}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Uložit změny' : createLabel}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Zatím žádné položky.</p>
        ) : (
          filtered.map((item) => {
            const pct = item.target_amount > 0 ? (item.saved_amount / item.target_amount) * 100 : 0
            return (
              <div key={item.id} className="border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      {item.expected_return_pct != null && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          {item.expected_return_pct}% p.a.
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(item.saved_amount)} / {formatCurrency(item.target_amount)}
                    </div>
                    {item.purpose && <p className="text-xs text-muted-foreground mt-1">{item.purpose}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} disabled={isPending === item.id} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30">
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <ProgressBar pct={pct} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
