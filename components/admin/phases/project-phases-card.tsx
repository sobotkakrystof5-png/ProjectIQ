'use client'

import Link from 'next/link'
import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Circle, CircleCheck, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { CardHead } from '@/components/admin/card'
import { cn, formatDate } from '@/lib/utils'
import { getPragueTodayISO } from '@/lib/prague-time'
import {
  PHASE_FORMS,
  PHASE_STATUSES,
  PHASE_STATUS_LABELS,
  plural,
  currentPhaseIndex,
  progressFromPhases,
  type PhaseStatus,
  type ProjectPhase,
  type ServiceTemplate,
} from '@/lib/admin/phase-model'
import { addProjectPhasesAction, setPhaseDueDateAction, setPhaseStatusAction } from '@/app/phases-actions'
import {
  PhaseDraftEditor, draftsProblem, rowsFromService, rowsToDrafts, type PhaseDraftState,
} from '@/components/admin/phases/phase-draft-editor'

// Etapy v detailu zakázky (KP12). Stav jedním klikem se „Zpět", termín
// v řádku, úkoly klienta s tím, kdy je označil. Klient vidí totéž v prostoru —
// propisuje to databáze (migrace 121), tahle komponenta jen volá akce.

export function ProjectPhasesCard({
  projectId,
  phases: initial,
  services,
  inPortal,
}: {
  projectId: string
  phases: ProjectPhase[]
  services: ServiceTemplate[]
  /** Je zakázka propojená s klientským prostorem? Jen kvůli větě nahoře. */
  inPortal: boolean
}) {
  const [phases, setPhases] = useState(initial)
  useEffect(() => setPhases(initial), [initial])

  if (phases.length === 0) return <AddPhases projectId={projectId} services={services} />

  const current = currentPhaseIndex(phases)
  const progress = progressFromPhases(phases) ?? 0

  return (
    <div>
      <CardHead
        title="Etapy"
        hint={
          inPortal
            ? `Hotovo ${progress} %. Klient etapy a svoje úkoly vidí v klientském prostoru.`
            : `Hotovo ${progress} %. Klient je uvidí, až ho pozvete do klientského prostoru.`
        }
      />
      <ol className="space-y-3">
        {phases.map((phase, i) => (
          <PhaseRow
            key={phase.id}
            phase={phase}
            index={i}
            isCurrent={i === current}
            onLocalChange={(patch) => setPhases((prev) => prev.map((p) => (p.id === phase.id ? { ...p, ...patch } : p)))}
          />
        ))}
      </ol>
    </div>
  )
}

function PhaseRow({
  phase,
  index,
  isCurrent,
  onLocalChange,
}: {
  phase: ProjectPhase
  index: number
  isCurrent: boolean
  onLocalChange: (patch: Partial<ProjectPhase>) => void
}) {
  const router = useRouter()
  const id = useId()
  const [pending, start] = useTransition()
  const [due, setDue] = useState(phase.dueDate ?? '')
  useEffect(() => setDue(phase.dueDate ?? ''), [phase.dueDate])

  const changeStatus = (status: PhaseStatus, undoing = false) => {
    if (status === phase.status && !undoing) return
    const before = phase.status
    onLocalChange({ status })
    start(async () => {
      const res = await setPhaseStatusAction(phase.id, status)
      if (!res.ok) {
        onLocalChange({ status: before })
        toast.error(res.error)
        return
      }
      router.refresh()
      if (!undoing) {
        toast.success(`${phase.name}: ${PHASE_STATUS_LABELS[status]}.`, {
          undo: () => changeStatus(res.previous, true),
        })
      }
    })
  }

  const changeDue = (value: string, undoing = false) => {
    const next = value || null
    if (next === phase.dueDate && !undoing) return
    const before = phase.dueDate
    onLocalChange({ dueDate: next })
    start(async () => {
      const res = await setPhaseDueDateAction(phase.id, next)
      if (!res.ok) {
        onLocalChange({ dueDate: before })
        setDue(before ?? '')
        toast.error(res.error)
        return
      }
      router.refresh()
      if (!undoing) {
        toast.success(next ? `Termín etapy je ${formatDate(next)}.` : 'Etapa je bez termínu.', {
          undo: () => {
            setDue(res.previous ?? '')
            changeDue(res.previous ?? '', true)
          },
        })
      }
    })
  }

  const waitingTasks = phase.tasks.filter((t) => !t.clientDoneAt).length

  return (
    <li
      className={cn(
        'rounded-chip border bg-surface p-4',
        isCurrent ? 'border-navy-700' : 'border-navy-100',
        phase.status === 'done' && 'bg-navy-50/50',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="font-num text-xs font-medium text-quiet" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="font-medium text-ink">{phase.name}</span>
            {isCurrent && <span className="text-xs font-medium text-navy-700">teď</span>}
          </p>
          {phase.description && <p className="mt-1 text-sm text-quiet">{phase.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-due`} className="sr-only">Termín etapy {phase.name}</label>
          <input
            id={`${id}-due`}
            type="date"
            value={due}
            disabled={pending}
            onChange={(e) => setDue(e.target.value)}
            onBlur={() => changeDue(due)}
            className="h-11 rounded-chip border border-input bg-surface px-3 font-num text-sm text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <div role="group" aria-label={`Stav etapy ${phase.name}`} className="inline-flex rounded-full border border-navy-100 p-0.5">
            {PHASE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={phase.status === s}
                disabled={pending}
                onClick={() => changeStatus(s)}
                className={cn(
                  'min-h-11 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  phase.status === s ? 'bg-navy-700 text-white' : 'text-quiet hover:bg-navy-50 hover:text-ink',
                )}
              >
                {PHASE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          {pending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-quiet" aria-label="Ukládám" />}
        </div>
      </div>

      {phase.tasks.length > 0 && (
        <div className="mt-3 border-t border-navy-100 pt-3">
          <p className="text-xs text-quiet">
            Úkoly pro klienta
            {waitingTasks > 0 ? ` · čeká ${waitingTasks}` : ' · všechno má hotové'}
          </p>
          <ul className="mt-2 space-y-1.5">
            {phase.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                {t.clientDoneAt ? (
                  <CircleCheck size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy-700" aria-hidden="true" />
                ) : (
                  <Circle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-quiet" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 text-ink">{t.body}</span>
                <span className="shrink-0 text-xs text-quiet">
                  {t.clientDoneAt ? `klient označil ${formatDate(t.clientDoneAt)}` : 'čeká na klienta'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function AddPhases({ projectId, services }: { projectId: string; services: ServiceTemplate[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [state, setState] = useState<PhaseDraftState>(() => ({ serviceId: '', startDay: getPragueTodayISO(), rows: [] }))
  const usable = services.filter((s) => s.active)

  if (usable.length === 0) {
    return (
      <div>
        <CardHead title="Etapy" />
        <p className="text-sm text-quiet">
          Zakázka zatím nemá etapy. Nejdřív si v{' '}
          <Link href="/dashboard/sluzby" className="text-navy-700 underline underline-offset-2">Nastavení › Služby</Link>{' '}
          připravte etapy pro druh práce, pak je sem přidáte jedním výběrem.
        </p>
      </div>
    )
  }

  const save = () => {
    const problem = draftsProblem(state.rows)
    if (problem) {
      toast.error(problem)
      return
    }
    start(async () => {
      const res = await addProjectPhasesAction(projectId, rowsToDrafts(state.rows))
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Zakázka má ${plural(res.count, PHASE_FORMS)}.`)
      router.refresh()
    })
  }

  return (
    <div>
      <CardHead
        title="Etapy"
        hint="Zakázka zatím nemá etapy. Vyberte službu, upravte termíny a uložte. Postup v % se pak počítá z hotových etap."
      />
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor={`etapy-sluzba-${projectId}`} className="text-sm font-medium text-ink">Služba</label>
          <select
            id={`etapy-sluzba-${projectId}`}
            value={state.serviceId}
            disabled={pending}
            onChange={(e) => {
              const service = usable.find((s) => s.id === e.target.value)
              setState((prev) => ({ ...prev, serviceId: e.target.value, rows: rowsFromService(service, prev.startDay) }))
            }}
            className="h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Vyberte službu</option>
            {usable.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {state.serviceId && (
          <>
            <PhaseDraftEditor value={state} onChange={setState} disabled={pending} />
            <Button type="button" onClick={save} disabled={pending || state.rows.length === 0}>
              {pending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
              Uložit etapy
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
