'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, TrendingDown, RefreshCw, Zap } from 'lucide-react'
import { createCost, updateCost, deleteCost, type CostPayload } from '@/app/completed-actions'
import { COST_TYPE_LABELS, type Cost, type CostType } from '@/lib/types'

const COST_TYPES: CostType[] = ['fixed_monthly', 'fixed_annual', 'one_time']

const EMPTY_FORM = (type: CostType): CostPayload => ({
  name: '',
  amount: 0,
  cost_type: type,
  description: null,
})

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

function CostForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: CostPayload
  onSave: (data: CostPayload) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<CostPayload>(initial)
  const set = (field: keyof CostPayload, value: string | number | null) =>
    setForm(prev => ({ ...prev, [field]: value === '' ? null : value }))

  return (
    <tr className="bg-brand-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Název nákladu *"
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
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
            value={form.cost_type}
            onChange={e => setForm(prev => ({ ...prev, cost_type: e.target.value as CostType }))}
          >
            {COST_TYPES.map(t => (
              <option key={t} value={t}>{COST_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Popis (volitelný)"
          value={form.description ?? ''}
          onChange={e => set('description', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            disabled={!form.name.trim() || isPending}
            onClick={() => form.name.trim() && onSave(form)}
            className="p-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={14} />
          </button>
          <button onClick={onCancel} className="p-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function CostRow({
  cost,
  onEdit,
  onDelete,
  isPending,
}: {
  cost: Cost
  onEdit: () => void
  onDelete: () => void
  isPending: boolean
}) {
  const typeStyle: Record<CostType, string> = {
    fixed_monthly: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    fixed_annual: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
    one_time: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  }

  return (
    <tr className="border-t border-border hover:bg-slate-50/60 transition-colors group">
      <td className="px-3 py-2.5">
        <span className="text-sm font-medium text-foreground">{cost.name}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm font-semibold text-red-600">{fmt(Number(cost.amount))} Kč</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeStyle[cost.cost_type]}`}>
          {COST_TYPE_LABELS[cost.cost_type]}
        </span>
      </td>
      <td className="px-3 py-2.5 max-w-[220px]">
        <span className="text-sm text-muted-foreground truncate block">{cost.description ?? ''}</span>
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

function CostSection({
  title,
  icon,
  costs,
  addingType,
  onAddNew,
  onCancelAdd,
  editingId,
  onEdit,
  onCancelEdit,
  onSave,
  onCreate,
  onDelete,
  isPending,
  summary,
  defaultType,
}: {
  title: string
  icon: React.ReactNode
  costs: Cost[]
  addingType: CostType | null
  onAddNew: (type: CostType) => void
  onCancelAdd: () => void
  editingId: string | null
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, data: CostPayload) => void
  onCreate: (data: CostPayload) => void
  onDelete: (id: string) => void
  isPending: boolean
  summary: string
  defaultType: CostType
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
        </div>
        <button
          onClick={() => onAddNew(defaultType)}
          disabled={addingType !== null}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-slate-50 text-foreground disabled:opacity-50 transition-colors shadow-sm"
        >
          <Plus size={13} />
          Přidat
        </button>
      </div>
      <div className="border border-border rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Název</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Částka</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typ</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Popis</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {addingType !== null && (
                <CostForm
                  initial={EMPTY_FORM(addingType)}
                  onSave={onCreate}
                  onCancel={onCancelAdd}
                  isPending={isPending}
                />
              )}
              {costs.length === 0 && addingType === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Zatím žádné náklady v této kategorii.
                  </td>
                </tr>
              )}
              {costs.map(cost =>
                editingId === cost.id ? (
                  <CostForm
                    key={cost.id}
                    initial={{
                      name: cost.name,
                      amount: Number(cost.amount),
                      cost_type: cost.cost_type,
                      description: cost.description,
                    }}
                    onSave={(data) => onSave(cost.id, data)}
                    onCancel={onCancelEdit}
                    isPending={isPending}
                  />
                ) : (
                  <CostRow
                    key={cost.id}
                    cost={cost}
                    onEdit={() => onEdit(cost.id)}
                    onDelete={() => onDelete(cost.id)}
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

export default function CostsManager({ initialCosts }: { initialCosts: Cost[] }) {
  const [costs, setCosts] = useState<Cost[]>(initialCosts)
  const [addingType, setAddingType] = useState<CostType | null>(null)
  const [addingSection, setAddingSection] = useState<'fixed' | 'onetime' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fixedCosts = costs.filter(c => c.cost_type === 'fixed_monthly' || c.cost_type === 'fixed_annual')
  const oneTimeCosts = costs.filter(c => c.cost_type === 'one_time')

  const monthlySum = costs.filter(c => c.cost_type === 'fixed_monthly').reduce((s, c) => s + Number(c.amount), 0)
  const annualSum = costs.filter(c => c.cost_type === 'fixed_annual').reduce((s, c) => s + Number(c.amount), 0)
  const oneTimeSum = oneTimeCosts.reduce((s, c) => s + Number(c.amount), 0)
  const annualTotal = monthlySum * 12 + annualSum

  const handleCreate = (data: CostPayload) => {
    startTransition(async () => {
      await createCost(data)
      setCosts(prev => [{
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date(),
      } as Cost, ...prev])
      setAddingType(null)
      setAddingSection(null)
    })
  }

  const handleUpdate = (id: string, data: CostPayload) => {
    startTransition(async () => {
      await updateCost(id, data)
      setCosts(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
      setEditingId(null)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Opravdu smazat tento náklad?')) return
    startTransition(async () => {
      await deleteCost(id)
      setCosts(prev => prev.filter(c => c.id !== id))
    })
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Měsíčně</p>
          <p className="text-xl font-bold text-red-600">{fmt(monthlySum)} Kč</p>
          <p className="text-xs text-muted-foreground mt-0.5">fixní měsíční náklady</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Ročně</p>
          <p className="text-xl font-bold text-red-600">{fmt(annualTotal)} Kč</p>
          <p className="text-xs text-muted-foreground mt-0.5">měsíční × 12 + roční</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Jednorázové</p>
          <p className="text-xl font-bold text-amber-600">{fmt(oneTimeSum)} Kč</p>
          <p className="text-xs text-muted-foreground mt-0.5">celkem jednorázové</p>
        </div>
      </div>

      <CostSection
        title="Fixní náklady"
        icon={
          <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
            <RefreshCw size={13} className="text-blue-600" strokeWidth={1.5} />
          </div>
        }
        costs={fixedCosts}
        addingType={addingSection === 'fixed' ? addingType : null}
        onAddNew={(type) => { setAddingType(type); setAddingSection('fixed'); setEditingId(null) }}
        onCancelAdd={() => { setAddingType(null); setAddingSection(null) }}
        editingId={editingId}
        onEdit={(id) => { setEditingId(id); setAddingType(null); setAddingSection(null) }}
        onCancelEdit={() => setEditingId(null)}
        onSave={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        isPending={isPending}
        summary={`${fmt(monthlySum)} Kč/měs · ${fmt(annualTotal)} Kč/rok`}
        defaultType="fixed_monthly"
      />

      <CostSection
        title="Jednorázové náklady"
        icon={
          <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
            <Zap size={13} className="text-amber-600" strokeWidth={1.5} />
          </div>
        }
        costs={oneTimeCosts}
        addingType={addingSection === 'onetime' ? addingType : null}
        onAddNew={(type) => { setAddingType(type); setAddingSection('onetime'); setEditingId(null) }}
        onCancelAdd={() => { setAddingType(null); setAddingSection(null) }}
        editingId={editingId}
        onEdit={(id) => { setEditingId(id); setAddingType(null); setAddingSection(null) }}
        onCancelEdit={() => setEditingId(null)}
        onSave={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        isPending={isPending}
        summary={`${fmt(oneTimeSum)} Kč celkem`}
        defaultType="one_time"
      />
    </div>
  )
}
