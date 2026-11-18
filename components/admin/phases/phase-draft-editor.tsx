'use client'

import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TASK_FORMS, addDays, plural, tasksFromLines, type PhaseDraft, type ServiceTemplate } from '@/lib/admin/phase-model'

// Náhled etap ze služby (KP12): u nové zakázky a v detailu zakázky bez etap.
// Etapy jsou kopie šablony — tady jdou upravit, smazat a přidat, šablona se
// tím nemění. Termín = začátek + součet typických délek; ručně změněný termín
// se při posunu začátku nepřepočítá.

export interface DraftRow {
  key: string
  name: string
  description: string
  /** Typická délka ze šablony; `null` = etapa termín neposouvá. */
  days: number | null
  dueDate: string
  manualDue: boolean
  tasksText: string
}

export interface PhaseDraftState {
  serviceId: string
  startDay: string
  rows: DraftRow[]
}

let seq = 0
const newKey = () => `etapa-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** Termíny řádků bez ručního data od začátku podle délek, v pořadí. */
export function withDueDates(rows: DraftRow[], startDay: string): DraftRow[] {
  let cursor = startDay
  return rows.map((r) => {
    if (r.days !== null) cursor = addDays(cursor, r.days)
    if (r.manualDue) return r
    return { ...r, dueDate: r.days !== null ? cursor : '' }
  })
}

export function rowsFromService(service: ServiceTemplate | undefined, startDay: string): DraftRow[] {
  if (!service) return []
  return withDueDates(
    service.phases.map((p) => ({
      key: newKey(),
      name: p.name,
      description: p.description,
      days: p.typicalDays,
      dueDate: '',
      manualDue: false,
      tasksText: p.tasks.join('\n'),
    })),
    startDay,
  )
}

/** Řádky formuláře → etapy pro server (ten je znovu ověří Zodem). */
export function rowsToDrafts(rows: DraftRow[]): PhaseDraft[] {
  return rows.map((r) => ({
    name: r.name.trim(),
    description: r.description.trim(),
    dueDate: r.dueDate || null,
    tasks: tasksFromLines(r.tasksText),
  }))
}

/** Chyba, kterou stojí za to říct dřív, než se formulář odešle. */
export function draftsProblem(rows: DraftRow[]): string | null {
  const unnamed = rows.findIndex((r) => !r.name.trim())
  if (unnamed >= 0) return `Etapa ${unnamed + 1} nemá název.`
  return null
}

const inputCls =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

export function PhaseDraftEditor({
  value,
  onChange,
  disabled,
}: {
  value: PhaseDraftState
  onChange: (next: PhaseDraftState) => void
  disabled?: boolean
}) {
  const id = useId()
  const { rows, startDay } = value

  const setRows = (next: DraftRow[]) => onChange({ ...value, rows: withDueDates(next, startDay) })
  const update = (key: string, patch: Partial<DraftRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const remove = (key: string) => {
    const before = rows
    const index = rows.findIndex((r) => r.key === key)
    const removed = rows[index]
    setRows(rows.filter((r) => r.key !== key))
    toast.message(`Etapa ${removed?.name.trim() ? `„${removed.name.trim()}"` : index + 1} odebrána.`, {
      undo: () => onChange({ ...value, rows: before }),
    })
  }

  const add = () =>
    setRows([...rows, { key: newKey(), name: '', description: '', days: null, dueDate: '', manualDue: false, tasksText: '' }])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor={`${id}-start`} className="text-sm font-medium text-ink">Začátek práce</label>
        <input
          id={`${id}-start`}
          type="date"
          value={startDay}
          disabled={disabled}
          onChange={(e) => e.target.value && onChange({ ...value, startDay: e.target.value, rows: withDueDates(rows, e.target.value) })}
          className={inputCls}
        />
        <p className="text-xs text-quiet">Termíny etap se od něj spočítají podle typické délky. Každý jde změnit.</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-chip border border-dashed border-navy-200 px-4 py-3 text-sm text-quiet">
          Tahle služba zatím nemá etapy. Doplníte je v Nastavení › Služby, nebo přidejte etapu tady.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-chip border border-navy-100 bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2.5 font-num text-xs font-medium text-quiet" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-${r.key}-name`} className="sr-only">Název etapy {i + 1}</label>
                    <input
                      id={`${id}-${r.key}-name`}
                      type="text"
                      value={r.name}
                      maxLength={120}
                      disabled={disabled}
                      placeholder={`Název etapy ${i + 1}`}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-${r.key}-due`} className="sr-only">Termín etapy {i + 1}</label>
                    <input
                      id={`${id}-${r.key}-due`}
                      type="date"
                      value={r.dueDate}
                      disabled={disabled}
                      onChange={(e) => update(r.key, { dueDate: e.target.value, manualDue: true })}
                      className={cn(inputCls, 'font-num')}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => remove(r.key)}
                  aria-label={`Odebrat etapu ${i + 1}`}
                  className="text-quiet"
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </div>
              <details className="mt-3 pl-7">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-navy-700">
                  Popis a úkoly pro klienta
                  {tasksFromLines(r.tasksText).length > 0 && (
                    <span className="ml-1.5 text-quiet">· {plural(tasksFromLines(r.tasksText).length, TASK_FORMS)}</span>
                  )}
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-${r.key}-desc`} className="text-sm font-medium text-ink">Co se v etapě děje (uvidí klient)</label>
                    <textarea
                      id={`${id}-${r.key}-desc`}
                      value={r.description}
                      maxLength={1000}
                      rows={2}
                      disabled={disabled}
                      onChange={(e) => update(r.key, { description: e.target.value })}
                      className={cn(inputCls, 'resize-none')}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-${r.key}-tasks`} className="text-sm font-medium text-ink">Úkoly pro klienta, každý na řádek</label>
                    <textarea
                      id={`${id}-${r.key}-tasks`}
                      value={r.tasksText}
                      rows={3}
                      disabled={disabled}
                      onChange={(e) => update(r.key, { tasksText: e.target.value })}
                      className={cn(inputCls, 'resize-none')}
                    />
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}

      <Button type="button" variant="outline" onClick={add} disabled={disabled || rows.length >= 30}>
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        Přidat etapu
      </Button>
    </div>
  )
}
