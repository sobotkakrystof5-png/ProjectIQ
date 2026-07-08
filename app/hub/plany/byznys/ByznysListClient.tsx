'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Briefcase, Plus, AlertCircle, Loader2, Wallet, ChevronRight } from 'lucide-react'
import { createBusiness, type PlanBusiness, type PlanBusinessPayload, type PlanBusinessStatus } from './byznys-plan-actions'
import { cn, formatCurrency } from '@/lib/utils'

const STATUS_LABELS: Record<PlanBusinessStatus, string> = {
  planovani: 'Plánování',
  pripraveno_k_exportu: 'Připraveno k exportu',
  exportovano: 'Exportováno',
}

const STATUS_STYLES: Record<PlanBusinessStatus, string> = {
  planovani: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  pripraveno_k_exportu: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  exportovano: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

const emptyForm = (): PlanBusinessPayload => ({ title: '', status: 'planovani' })

interface Props {
  businesses: PlanBusiness[]
}

export function ByznysListClient({ businesses }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PlanBusinessPayload>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stats = useMemo(() => {
    const counts: Record<PlanBusinessStatus, number> = { planovani: 0, pripraveno_k_exportu: 0, exportovano: 0 }
    for (const b of businesses) counts[b.status]++
    return counts
  }, [businesses])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim()) {
      setFormError('Zadej název strategie')
      return
    }
    setIsSubmitting(true)
    const result = await createBusiness(form)
    setIsSubmitting(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    if (result.id) router.push(`/hub/plany/byznys/${result.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Plánování</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.planovani}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">K exportu</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.pripraveno_k_exportu}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <span className="text-xs text-muted-foreground block mb-1">Exportováno</span>
          <p className="text-base font-semibold text-foreground tabular-nums">{stats.exportovano}</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Briefcase size={16} strokeWidth={1.5} className="text-brand-800" />
            <h2 className="text-base font-semibold text-foreground">Byznys strategie</h2>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Nová strategie
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
                autoFocus
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
                className="flex-1 py-2 text-sm font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Vytvořit a otevřít
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Zatím žádné strategie. Založ novou, nebo schval nápad v sekci Projekty a přesuň ho sem.
            </p>
          ) : (
            businesses.map((b) => (
              <Link
                key={b.id}
                href={`/hub/plany/byznys/${b.id}`}
                className="flex items-center justify-between gap-3 border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{b.title}</h3>
                    <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_STYLES[b.status])}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </div>
                  {b.budget != null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet size={11} strokeWidth={1.5} />
                      {formatCurrency(b.budget)}
                    </span>
                  )}
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
