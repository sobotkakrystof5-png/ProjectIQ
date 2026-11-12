'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, Loader2, RotateCcw } from 'lucide-react'
import { closeProject, reopenProject } from '@/app/closed-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { ProjectStatus, ProjectType } from '@/lib/types'

/**
 * Uzavření zakázky a jeho vrácení (AD11, R-090).
 *
 * Dřív to bylo „Přidat do dokončených zakázek" — zakázka se zkopírovala
 * jinam a zpět to nešlo. Od migrace 106 se nic nekopíruje, takže toast
 * nabídne „Zpět" jako u ostatních akcí adminu.
 */

const selectCls =
  'h-11 w-full appearance-none rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function CloseProjectButton({
  projectId,
  projectName,
  hasEstimatedCosts,
}: {
  projectId: string
  projectName: string
  hasEstimatedCosts: boolean
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ProjectType>('client')
  const [closedOn, setClosedOn] = useState(getPragueTodayISO())
  const [difficulty, setDifficulty] = useState(5)
  const [timeInvested, setTimeInvested] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [includeCosts, setIncludeCosts] = useState(hasEstimatedCosts)
  const [pending, start] = useTransition()

  const undo = (previousStatus: ProjectStatus) =>
    start(async () => {
      try {
        await reopenProject(projectId, previousStatus)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Zakázku se nepodařilo otevřít zpět.')
      }
    })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      try {
        const result = await closeProject(projectId, {
          project_type: type,
          closed_on: closedOn,
          difficulty,
          time_invested: timeInvested ? Number(timeInvested) : null,
          estimated_hours: estimatedHours ? Number(estimatedHours) : null,
          include_costs: includeCosts,
        })
        setOpen(false)
        toast.success('Zakázka je uzavřená.', {
          description: result.skippedCostsDueToExisting
            ? 'Náklady jsme nepřidali — zakázka už nějaké eviduje.'
            : 'Klientovi jsme poslali poděkování s dotazníkem.',
          undo: () => undo(result.previousStatus),
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Zakázku se nepodařilo uzavřít.')
      }
    })
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <CheckCircle size={15} strokeWidth={1.75} aria-hidden />
        Uzavřít zakázku
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-panel border border-navy-100 bg-surface p-4 sm:p-5"
    >
      <p className="text-sm font-semibold text-ink">Uzavřít zakázku {projectName}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="close-type">Druh zakázky</Label>
          <select
            id="close-type"
            value={type}
            onChange={(e) => setType(e.target.value as ProjectType)}
            className={selectCls}
          >
            <option value="client">Pro klienta</option>
            <option value="personal">Vlastní projekt bez klienta</option>
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="close-date">Datum uzavření</Label>
          <Input
            id="close-date"
            type="date"
            value={closedOn}
            onChange={(e) => setClosedOn(e.target.value)}
            required
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="close-difficulty">Náročnost (1–10)</Label>
          <select
            id="close-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className={selectCls}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="close-hours">Odpracováno hodin</Label>
          <Input
            id="close-hours"
            type="number"
            min="0"
            step="0.5"
            value={timeInvested}
            onChange={(e) => setTimeInvested(e.target.value)}
            placeholder="např. 12"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="close-estimate">Kolik hodin jste čekal při zadání</Label>
          <Input
            id="close-estimate"
            type="number"
            min="0"
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            placeholder="např. 8"
          />
          <p className="text-xs text-quiet">Nepovinné. Slouží jen k porovnání odhadu se skutečností.</p>
        </div>
      </div>

      {hasEstimatedCosts && (
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={includeCosts}
            onChange={(e) => setIncludeCosts(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-navy-700"
          />
          <span>
            Přepsat odhad nákladů na skutečný náklad
            <span className="block text-xs text-quiet">
              Náklad zůstane i po vrácení uzavření — smažete ho v Nákladech.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />}
          Uzavřít zakázku
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Zrušit
        </Button>
      </div>
    </form>
  )
}

/** Uzavřená zakázka: datum a tlačítko, které uzavření vrátí. */
export function ReopenProjectButton({
  projectId,
  status,
}: {
  projectId: string
  status: ProjectStatus
}) {
  const [pending, start] = useTransition()

  const reopen = () =>
    start(async () => {
      try {
        // Vrací se do „v řešení" — zaplacená zakázka si stav nechá, peníze
        // s uzavřením nesouvisí.
        await reopenProject(projectId, status === 'paid' ? 'paid' : 'in_progress')
        toast.success('Zakázka je zase otevřená.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Zakázku se nepodařilo otevřít zpět.')
      }
    })

  return (
    <Button type="button" variant="ghost" onClick={reopen} disabled={pending} className="h-9 px-3.5 text-sm">
      <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
      Otevřít zpět
    </Button>
  )
}
