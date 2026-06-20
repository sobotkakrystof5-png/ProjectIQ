'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, ChevronDown, Loader2 } from 'lucide-react'
import { markProjectAsCompleted } from '@/app/actions'
import { cn } from '@/lib/utils'
import type { ProjectType } from '@/lib/types'

interface Props {
  projectId: string
  projectName: string
  hasEstimatedCosts: boolean
}

const inputCls =
  'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow bg-white'

export function MarkCompletedButton({ projectId, projectName, hasEstimatedCosts }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ProjectType>('client')
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 10))
  const [difficulty, setDifficulty] = useState(5)
  const [timeInvested, setTimeInvested] = useState('')
  const [includeCosts, setIncludeCosts] = useState(hasEstimatedCosts)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await markProjectAsCompleted(projectId, {
        project_type: type,
        completed_at: completedAt,
        difficulty,
        time_invested: timeInvested ? Number(timeInvested) : null,
        include_costs: includeCosts,
      })
      setDone(true)
      setOpen(false)
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
        <CheckCircle size={15} strokeWidth={1.5} />
        Přidáno do dokončených zakázek
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle size={15} strokeWidth={1.5} />
          Přesunout do dokončených zakázek
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
            Dokončit zakázku — {projectName}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Typ projektu</label>
              <div className="relative">
                <select
                  value={type}
                  onChange={e => setType(e.target.value as ProjectType)}
                  className={cn(inputCls, 'appearance-none pr-8')}
                >
                  <option value="client">Zakázka pro klienta</option>
                  <option value="personal">Osobní projekt</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datum dokončení</label>
              <input
                type="date"
                value={completedAt}
                onChange={e => setCompletedAt(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Náročnost (1–10)</label>
              <div className="relative">
                <select
                  value={difficulty}
                  onChange={e => setDifficulty(Number(e.target.value))}
                  className={cn(inputCls, 'appearance-none pr-8')}
                >
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Čas (hod., volitelné)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={timeInvested}
                onChange={e => setTimeInvested(e.target.value)}
                placeholder="např. 12"
                className={inputCls}
              />
            </div>
          </div>

          {hasEstimatedCosts && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="include_costs"
                checked={includeCosts}
                onChange={e => setIncludeCosts(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <label htmlFor="include_costs" className="text-sm text-emerald-800 cursor-pointer">
                Přidat předpokládané náklady do sekce Náklady
              </label>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Zbytek (hodinová sazba, poznámky) doplníš v sekci Dokončené zakázky.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />}
              Dokončit a přesunout
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              Zrušit
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
