'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createCost, deleteCost, updateCost, type CostPayload } from '@/app/costs-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/ws/utils'
import {
  COST_CATEGORY_LABELS,
  COST_TYPE_LABELS,
  type Cost,
  type CostCategory,
  type CostType,
} from '@/lib/types'

/**
 * Přidání a úprava nákladu (AD07). Tabulka je serverová, proto je formulář
 * v dialogu a ne v řádku — řádek se po uložení překreslí ze serveru.
 */

const TYPES: CostType[] = ['fixed_monthly', 'fixed_annual', 'one_time']
const CATEGORIES: CostCategory[] = ['client', 'personal', 'all']

const emptyForm = (type: CostType, projectId: string | null): CostPayload => ({
  name: '',
  amount: 0,
  cost_type: type,
  // Náklad u zakázky je vždy klientský — nemá smysl nutit uživatele kategorii dohledávat.
  category: projectId ? 'client' : 'all',
  description: null,
  project_id: projectId,
})

const toForm = (cost: Cost): CostPayload => ({
  name: cost.name,
  amount: Number(cost.amount),
  cost_type: cost.cost_type,
  category: cost.category ?? 'all',
  description: cost.description,
  project_id: cost.project_id,
})

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

const selectClass =
  'h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

function CostForm({
  initial,
  mode,
  open,
  onOpenChange,
  costId,
  projectId,
}: {
  initial: CostPayload
  mode: 'new' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  costId?: string
  projectId: string | null
}) {
  const [form, setForm] = useState(initial)
  const [pending, start] = useTransition()
  const set = <K extends keyof CostPayload>(key: K, value: CostPayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = () => {
    if (!form.name.trim()) return
    start(async () => {
      if (mode === 'edit' && costId) {
        await updateCost(costId, form)
        toast.success('Uloženo')
      } else {
        await createCost(form)
        toast.success('Náklad přidaný')
      }
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Upravit náklad' : 'Přidat náklad'}</DialogTitle>
          <DialogDescription>Fixní náklady se počítají do měsíčního a ročního přehledu ve Financích.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Název">
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Hosting, doména, licence…"
              />
            </Field>
          </div>
          <Field label="Částka (Kč)">
            <Input
              type="number"
              min="0"
              className="font-num"
              value={form.amount || ''}
              onChange={(e) => set('amount', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Jak často">
            <select
              className={selectClass}
              value={form.cost_type}
              onChange={(e) => set('cost_type', e.target.value as CostType)}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {COST_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          {!projectId && (
            <Field label="Kam patří">
              <select
                className={selectClass}
                value={form.category ?? 'all'}
                onChange={(e) => set('category', e.target.value as CostCategory)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {COST_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className={projectId ? 'sm:col-span-2' : ''}>
            <Field label="Popis">
              <Input
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value || null)}
                placeholder="Volitelné"
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={pending || !form.name.trim()}>
            {mode === 'edit' ? 'Uložit' : 'Přidat náklad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NewCostButton({
  defaultType = 'fixed_monthly',
  projectId = null,
  variant = 'primary',
  label = 'Přidat náklad',
}: {
  defaultType?: CostType
  projectId?: string | null
  variant?: 'primary' | 'outline'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={1.5} />
        {label}
      </Button>
      {open && (
        <CostForm
          initial={emptyForm(defaultType, projectId)}
          mode="new"
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
        />
      )}
    </>
  )
}

export function CostRowActions({ cost, className }: { cost: Cost; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const remove = () => {
    if (!confirm(`Smazat náklad „${cost.name}“?`)) return
    start(async () => {
      await deleteCost(cost.id, cost.project_id ?? null)
      toast.success('Náklad smazaný')
    })
  }

  return (
    <div className={cn('flex items-center justify-end gap-1', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Upravit ${cost.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-navy-50 hover:text-navy-700"
      >
        <Pencil size={15} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Smazat ${cost.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
      {open && (
        <CostForm
          initial={toForm(cost)}
          mode="edit"
          costId={cost.id}
          open={open}
          onOpenChange={setOpen}
          projectId={cost.project_id ?? null}
        />
      )}
    </div>
  )
}
