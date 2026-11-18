import { Check } from 'lucide-react'
import type { PortalPhase } from '@/lib/portal/phases'
import { TASK_FORMS, plural } from '@/lib/admin/phase-model'
import { TaskDoneButton } from '@/components/portal/task-done-button'
import { cn, formatDate } from '@/lib/utils'

// Osa etap v klientském prostoru (KP12). Aktuální etapa je zvýrazněná, úkoly
// pro klienta mají „Mám hotovo". Texty i data přišly z projekce portal.*,
// vykreslují se jako text, nikdy jako HTML.

const STATUS_TEXT = { waiting: 'Čeká', running: 'Teď probíhá', done: 'Hotovo' } as const

function currentIndex(phases: PortalPhase[]): number {
  const running = phases.findIndex((p) => p.status === 'running')
  return running >= 0 ? running : phases.findIndex((p) => p.status === 'waiting')
}

export function PhaseTimeline({ projectId, phases }: { projectId: string; phases: PortalPhase[] }) {
  const current = currentIndex(phases)
  const waitingOnYou = phases.reduce((n, p) => n + p.tasks.filter((t) => !t.doneAt).length, 0)

  return (
    <section className="mt-5" aria-labelledby="etapy">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="etapy" className="text-sm font-semibold uppercase tracking-wider text-quiet">Etapy</h2>
        {waitingOnYou > 0 && (
          <span className="rounded-full border border-dashed border-signal-line bg-signal-bg px-2.5 py-0.5 text-xs font-semibold text-signal-ink">
            Čeká na vás {plural(waitingOnYou, TASK_FORMS)}
          </span>
        )}
      </div>
      <ol className="space-y-3">
        {phases.map((p, i) => {
          const isCurrent = i === current
          return (
            <li
              key={p.id}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'rounded-box border bg-surface p-5',
                isCurrent ? 'border-navy-700' : 'border-navy-100',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-medium text-ink">
                  {p.status === 'done' ? (
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-700 text-white">
                      <Check size={14} strokeWidth={2} aria-hidden="true" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-num text-xs',
                        isCurrent ? 'border-navy-700 text-navy-700' : 'border-navy-200 text-quiet',
                      )}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                  )}
                  {p.name}
                </p>
                <span className="text-xs text-quiet">
                  {STATUS_TEXT[p.status]}
                  {p.status === 'done' && p.doneAt
                    ? ` · ${formatDate(p.doneAt)}`
                    : p.dueDate
                      ? ` · do ${formatDate(p.dueDate)}`
                      : ''}
                </span>
              </div>
              {p.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{p.description}</p>}
              {p.tasks.length > 0 && (
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <p className="text-xs font-medium text-quiet">Co potřebujeme od vás</p>
                  <ul className="mt-2 space-y-2">
                    {p.tasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className={cn('min-w-0', t.doneAt ? 'text-quiet line-through' : 'text-ink')}>
                          {t.body}
                          {t.doneAt && <span className="sr-only"> (hotovo)</span>}
                        </span>
                        <TaskDoneButton projectId={projectId} taskId={t.id} done={Boolean(t.doneAt)} label={t.body} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {phases.some((p) => p.tasks.length > 0) && (
        <p className="mt-3 text-xs text-quiet">
          Hesla a přístupy sem ani do zpráv nepište. Napište, že je máte připravené, a domluvíme bezpečné předání.
        </p>
      )}
    </section>
  )
}
