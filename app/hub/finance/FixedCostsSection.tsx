'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import {
  createCost, deleteCost,
  type Cost, type CostType,
} from './finance-actions'

const COST_TYPE_LABEL: Record<CostType, string> = {
  fixed_monthly: 'měsíčně',
  fixed_annual: 'ročně',
  one_time: 'jednorázově',
}

const COST_CATEGORIES = [
  'domény',
  'hosting',
  'software',
  'nástroje',
  'ostatní',
] as const

function formatCZK(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function annualAmount(cost: Cost): number {
  if (cost.cost_type === 'fixed_monthly') return cost.amount * 12
  return cost.amount
}

interface Props {
  costs: Cost[]
}

export function FixedCostsSection({ costs }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [costType, setCostType] = useState<CostType>('fixed_annual')
  const [category, setCategory] = useState<string>(COST_CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const recurring = costs.filter(c => c.cost_type !== 'one_time')
  const totalAnnual = recurring.reduce((s, c) => s + annualAmount(c), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    const amountNum = parseFloat(amount.replace(',', '.'))
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Zadej platnou částku')
      setIsSubmitting(false)
      return
    }

    const result = await createCost({ name, amount: amountNum, cost_type: costType, category, description })
    setIsSubmitting(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    setName('')
    setAmount('')
    setDescription('')
    setShowForm(false)
    startTransition(() => { router.refresh() })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCost(id)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} strokeWidth={1.5} className="text-slate-500" />
          <h2 className="text-base font-semibold text-foreground">Fixní náklady</h2>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} strokeWidth={2} />
          Přidat náklad
        </button>
      </div>

      {/* Přidávací formulář */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-muted/30 border border-border rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="např. zakaziq.cz"
                required
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Částka (Kč)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                required
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Frekvence</label>
              <select
                value={costType}
                onChange={e => setCostType(e.target.value as CostType)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
              >
                <option value="fixed_annual">Ročně</option>
                <option value="fixed_monthly">Měsíčně</option>
                <option value="one_time">Jednorázově</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Kategorie</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
              >
                {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Poznámka</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Volitelně..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
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
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Uložit
            </button>
          </div>
        </form>
      )}

      {/* Seznam nákladů */}
      <div className="space-y-0.5">
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Žádné fixní náklady. Přidej domény, hosting, předplatná...
          </p>
        ) : (
          costs.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/40 rounded-lg group transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">{c.name}</span>
                {c.description && (
                  <span className="text-xs text-muted-foreground ml-2">{c.description}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
                {c.category}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {COST_TYPE_LABEL[c.cost_type]}
              </span>
              <span className="text-sm font-semibold text-red-500 shrink-0 tabular-nums">
                −{formatCZK(c.amount)}
              </span>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={isPending}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Celkový součet ročních nákladů */}
      {recurring.length > 0 && (
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Celkem ročně (opakující se)</span>
          <span className="text-sm font-semibold text-red-500 tabular-nums">
            −{formatCZK(totalAnnual)}
          </span>
        </div>
      )}
    </div>
  )
}
