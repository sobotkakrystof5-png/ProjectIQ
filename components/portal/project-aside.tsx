import Link from 'next/link'
import { CalendarClock, Check, ExternalLink, Video } from 'lucide-react'
import type { PortalActivity, PortalProject } from '@/lib/portal/projects'
import { currentPhase, openTasks, type PortalPhase } from '@/lib/portal/phases'
import type { PortalInvoice, PortalMoney } from '@/lib/portal/money'
import type { PortalConsultation } from '@/lib/portal/consultations'
import { TaskDoneButton } from '@/components/portal/task-done-button'
import { countLabel, formatMoney } from '@/lib/portal/format'
import { consultationWhen } from '@/lib/consultations/rules'
import type { WebLeadStats } from '@/lib/client-web/stats'
import { WebLeadsChart } from '@/components/client-web/web-leads-chart'
import { cn, formatDate } from '@/lib/utils'

/**
 * Panel „O zakázce" vedle chatu (KP15, KP16, R-123): etapy jako osa
 * s termíny a úkoly „Mám hotovo", zaplaceno a zbývá s odkazem na faktury,
 * nejbližší konzultace s odkazem na Meet, co se dělo a živá verze webu.
 * Od 1280 px vedle chatu, pod tím ve výsuvném panelu (AsideSheet).
 */

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-quiet'
const LINK = 'inline-flex min-h-11 items-center gap-1.5 font-semibold text-navy-700 hover:underline'

export function ProjectAside({
  project,
  phases,
  money,
  invoices,
  consultations,
  activity,
  webLeads = null,
  today,
}: {
  project: PortalProject
  phases: PortalPhase[]
  money: PortalMoney | null
  invoices: PortalInvoice[]
  consultations: PortalConsultation[]
  activity: PortalActivity[]
  /** Poptávky z webu (KP17); `null` = zakázka nemá napojený web. */
  webLeads?: WebLeadStats | null
  today: string
}) {
  const current = currentPhase(phases)
  const index = current ? phases.findIndex((p) => p.id === current.id) + 1 : 0
  const tasks = openTasks(phases)
  const toPay = invoices.filter((i) => i.state === 'open' || i.state === 'overdue')
  const next = consultations[0] ?? null

  return (
    <div className="space-y-6 p-5 text-sm">
      <section className="pr-12 xl:pr-0">
        <h2 className={LABEL}>O zakázce</h2>
        <p className="mt-2 break-words font-semibold text-ink">
          {current ? current.name : phases.length > 0 ? 'Všechny etapy jsou hotové' : project.statusLabel}
        </p>
        <p className="text-quiet">
          {current ? `Etapa ${index} z ${phases.length}` : `Hotovo ${project.progress} %`}
          {current?.dueDate ? ` · do ${formatDate(current.dueDate)}` : !current && project.deadline ? ` · termín ${formatDate(project.deadline)}` : ''}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Postup zakázky">
          <div className="h-full rounded-full bg-navy-700" style={{ width: `${project.progress}%` }} />
        </div>
      </section>

      {tasks.length > 0 && (
        <section className="rounded-box border border-signal-line bg-signal-bg p-4">
          <h2 className="font-semibold text-ink">Na tahu jste vy</h2>
          <ul className="mt-2 space-y-2">
            {tasks.map(({ task }) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-ink">{task.body}</span>
                <TaskDoneButton projectId={project.id} taskId={task.id} done={false} label={task.body} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {phases.length > 0 && (
        <section>
          <h2 className={LABEL}>Etapy</h2>
          <ol className="mt-3 space-y-3">
            {phases.map((p, i) => (
              <li key={p.id} aria-current={p.id === current?.id ? 'step' : undefined} className="flex gap-2.5">
                {p.status === 'done' ? (
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-700 text-white">
                    <Check size={12} strokeWidth={2} aria-hidden="true" />
                    <span className="sr-only">Hotovo:</span>
                  </span>
                ) : (
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-num text-[11px]',
                      p.id === current?.id ? 'border-navy-700 text-navy-700' : 'border-navy-200 text-quiet',
                    )}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p className={cn('break-words', p.id === current?.id ? 'font-semibold text-ink' : p.status === 'done' ? 'text-quiet' : 'text-ink')}>
                    {p.name}
                  </p>
                  <p className="text-xs text-quiet">
                    {p.status === 'done'
                      ? p.doneAt ? `Hotovo ${formatDate(p.doneAt)}` : 'Hotovo'
                      : p.dueDate ? `Do ${formatDate(p.dueDate)}` : p.id === current?.id ? 'Teď probíhá' : 'Čeká'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(money || invoices.length > 0) && (
        <section>
          <h2 className={LABEL}>Peníze</h2>
          {money ? (
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-quiet">Zaplaceno</dt>
                <dd className="font-num text-ink">{formatMoney(money.paid)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-quiet">Zbývá</dt>
                <dd className="font-num font-semibold text-ink">{formatMoney(money.remaining)}</dd>
              </div>
            </dl>
          ) : null}
          {toPay.length > 0 && <p className="mt-2 text-quiet">K zaplacení: {countLabel(toPay.length, ['faktura', 'faktury', 'faktur'])}</p>}
          <Link href={`/klient/faktury?zakazka=${project.id}`} className={LINK}>
            Faktury
          </Link>
        </section>
      )}

      <section>
        <h2 className={LABEL}>Konzultace</h2>
        {next ? (
          <>
            <p className="mt-2 text-ink">{consultationWhen(next.startsAt, today)}</p>
            {next.meetUrl && (
              <a href={next.meetUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                <Video size={15} strokeWidth={1.5} aria-hidden="true" />
                Připojit se
              </a>
            )}
          </>
        ) : (
          <p className="mt-2 text-quiet">Žádnou domluvenou nemáte.</p>
        )}
        <Link href={`/klient/konzultace?zakazka=${project.id}`} className={cn(LINK, 'flex')}>
          <CalendarClock size={15} strokeWidth={1.5} aria-hidden="true" />
          Domluvit konzultaci
        </Link>
      </section>

      {webLeads && (
        <section>
          <h2 className={cn(LABEL, 'mb-2')}>Poptávky z vašeho webu</h2>
          <WebLeadsChart stats={webLeads} compact />
        </section>
      )}

      {activity.length > 0 && (
        <section>
          <h2 className={LABEL}>Co se dělo</h2>
          <ul className="mt-2 space-y-2">
            {activity.slice(0, 3).map((a) => (
              <li key={a.id}>
                <p className="break-words text-ink">{a.title}</p>
                <p className="text-xs text-quiet">{formatDate(a.publishedAt)}</p>
              </li>
            ))}
          </ul>
          {activity.length > 3 && (
            <Link href={`/klient/projekt/${project.id}#co-se-delo`} className={LINK}>
              Všechno, co se dělo
            </Link>
          )}
        </section>
      )}

      <div className="flex flex-col border-t border-navy-100 pt-2">
        <Link href={`/klient/projekt/${project.id}`} className="inline-flex min-h-11 items-center font-medium text-ink hover:underline">
          Detail zakázky
        </Link>
        {project.projectUrl && (
          <a href={project.projectUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink hover:underline">
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
            Otevřít živou verzi
          </a>
        )}
      </div>
    </div>
  )
}
