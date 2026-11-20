import Link from 'next/link'
import { CalendarClock, ExternalLink } from 'lucide-react'
import type { PortalProject } from '@/lib/portal/projects'
import type { PortalPhase } from '@/lib/portal/phases'
import type { PortalMoney } from '@/lib/portal/money'
import type { PortalConsultation } from '@/lib/portal/consultations'
import { consultationWhen } from '@/lib/consultations/rules'
import { getPragueTodayISO } from '@/lib/prague-time'
import { formatDate } from '@/lib/utils'

/**
 * Panel „O zakázce" vedle chatu (KP15, R-123): etapa a termín, co čeká na
 * klienta, peníze a nejbližší konzultace. Skládá jen to, co už prostor
 * umí (KP12–KP14); přehled klienta ho rozšíří v KP16.
 */

const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`

export function ProjectAside({
  project,
  phases,
  money,
  nextConsultation,
}: {
  project: PortalProject
  phases: PortalPhase[]
  money: PortalMoney | null
  nextConsultation: PortalConsultation | null
}) {
  const current = phases.find((p) => p.status === 'running') ?? phases.find((p) => p.status === 'waiting') ?? null
  const myTasks = phases.flatMap((p) => p.tasks.filter((t) => !t.doneAt)).slice(0, 3)
  return (
    <div className="space-y-5 p-5 text-sm">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">O zakázce</h2>
        <p className="mt-2 font-semibold text-ink">{current ? current.name : project.statusLabel}</p>
        <p className="text-quiet">
          Hotovo {project.progress} %{current?.dueDate ? ` · do ${formatDate(current.dueDate)}` : project.deadline ? ` · termín ${formatDate(project.deadline)}` : ''}
        </p>
      </section>
      {myTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">Na tahu jste vy</h2>
          <ul className="mt-2 space-y-1 text-ink">
            {myTasks.map((t) => <li key={t.id}>{t.body}</li>)}
          </ul>
        </section>
      )}
      {money && money.price > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">Peníze</h2>
          <p className="mt-2 font-num text-ink">Zaplaceno {czk(money.paid)}</p>
          <p className="font-num text-quiet">Zbývá {czk(money.remaining)}</p>
        </section>
      )}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">Konzultace</h2>
        {nextConsultation ? (
          <p className="mt-2 text-ink">{consultationWhen(nextConsultation.startsAt, getPragueTodayISO())}</p>
        ) : (
          <p className="mt-2 text-quiet">Žádná domluvená.</p>
        )}
        <Link href={`/klient/projekt/${project.id}#konzultace`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-navy-700 hover:underline">
          <CalendarClock size={15} strokeWidth={1.5} aria-hidden="true" />
          Domluvit konzultaci
        </Link>
      </section>
      <div className="flex flex-col gap-1 border-t border-navy-100 pt-3">
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
