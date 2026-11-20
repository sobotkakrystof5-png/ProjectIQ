import Link from 'next/link'
import { CalendarClock, ChevronRight, FileWarning, MessagesSquare, PenLine, Star, Stamp } from 'lucide-react'
import type { OverviewProject, WaitingItem } from '@/lib/portal/overview'
import { TaskDoneButton } from '@/components/portal/task-done-button'
import { countLabel, formatMoney } from '@/lib/portal/format'
import { consultationWhen } from '@/lib/consultations/rules'
import { cn, formatDate } from '@/lib/utils'

/**
 * Přehled klienta (KP16, R-123). Nahoře jedna věc: co od klienta teď
 * potřebujeme, nebo klidná věta, že nic. Pod tím karta každé zakázky —
 * etapa s termínem, peníze, konzultace a poslední zpráva o práci.
 */

const ITEM_FORMS = ['věc', 'věci', 'věcí'] as const
const MESSAGE_FORMS = ['nepřečtená zpráva', 'nepřečtené zprávy', 'nepřečtených zpráv'] as const
const SHOWN = 6

const action =
  '-ml-3 inline-flex min-h-11 shrink-0 items-center sm:ml-0 gap-1 rounded-chip px-3 text-sm font-semibold text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function ItemIcon({ kind }: { kind: WaitingItem['kind'] }) {
  const Icon = { approval: Stamp, task: PenLine, unread: MessagesSquare, invoice: FileWarning, survey: Star }[kind]
  return (
    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-signal-ink">
      <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
    </span>
  )
}

function WaitingRow({ item }: { item: WaitingItem }) {
  let title: string
  let detail: string
  let end: React.ReactNode
  switch (item.kind) {
    case 'approval':
      title = 'Schválit návrh'
      detail = item.body ? `${item.projectName} · ${item.body}` : item.projectName
      end = (
        <Link href={`/klient/zpravy/${item.projectId}`} className={action}>
          Otevřít <ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      )
      break
    case 'task':
      title = item.body
      detail = `${item.projectName} · ${item.phaseName}`
      end = <TaskDoneButton projectId={item.projectId} taskId={item.taskId} done={false} label={item.body} />
      break
    case 'unread':
      title = countLabel(item.count, MESSAGE_FORMS)
      detail = item.projectName
      end = (
        <Link href={`/klient/zpravy/${item.projectId}`} className={action}>
          Přečíst <ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      )
      break
    case 'invoice':
      title = `Faktura ${item.invoice.number} je po splatnosti`
      detail = `${item.projectName} · ${formatMoney(item.invoice.amount, item.invoice.currency)}${item.invoice.dueOn ? ` · splatná ${formatDate(item.invoice.dueOn)}` : ''}`
      end = (
        <Link href={`/klient/faktury#faktura-${item.invoice.id}`} className={action}>
          Zobrazit <ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      )
      break
    case 'survey':
      title = 'Ohodnoťte spolupráci'
      detail = `${item.projectName} · zabere minutu`
      end = (
        <Link href={`/klient/projekt/${item.projectId}#hodnoceni`} className={action}>
          Ohodnotit <ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      )
      break
  }
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <ItemIcon kind={item.kind} />
      {/* Na telefonu je akce pod textem, ať dlouhý úkol nemusí do úzkého sloupce. */}
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-ink">{title}</p>
          <p className="mt-0.5 line-clamp-2 break-words text-sm text-signal-ink">{detail}</p>
        </div>
        <div className="mt-2 flex sm:mt-0">{end}</div>
      </div>
    </li>
  )
}

export function WaitingCard({ items }: { items: WaitingItem[] }) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="ceka-na-vas" className="rounded-box border border-navy-100 bg-surface p-5">
        <h2 id="ceka-na-vas" className="text-lg font-semibold text-ink">Teď od vás nic nepotřebujeme.</h2>
        <p className="mt-1 text-sm text-quiet">Až budeme něco potřebovat, uvidíte to tady a přijde vám e-mail.</p>
      </section>
    )
  }
  const shown = items.slice(0, SHOWN)
  const rest = items.length - shown.length
  return (
    <section aria-labelledby="ceka-na-vas" className="rounded-box border border-signal-line bg-signal-bg p-5">
      <h2 id="ceka-na-vas" className="text-lg font-semibold text-ink">Čeká na vás {countLabel(items.length, ITEM_FORMS)}</h2>
      <ul className="mt-4 divide-y divide-signal-line">
        {shown.map((item) => (
          <WaitingRow key={`${item.kind}-${'taskId' in item ? item.taskId : 'messageId' in item ? item.messageId : 'invoice' in item ? item.invoice.id : item.projectId}`} item={item} />
        ))}
      </ul>
      {rest > 0 && <p className="mt-3 text-sm text-signal-ink">A ještě {countLabel(rest, ITEM_FORMS)} najdete u zakázek níž.</p>}
    </section>
  )
}

function PhaseLine({ p }: { p: OverviewProject }) {
  const { phases, current, project } = p
  if (phases.length === 0) {
    return (
      <p className="text-sm text-quiet">
        Hotovo {project.progress} %{project.deadline ? ` · termín ${formatDate(project.deadline)}` : ''}
      </p>
    )
  }
  if (!current) return <p className="text-sm text-ink">Všechny etapy jsou hotové.</p>
  const index = phases.findIndex((x) => x.id === current.id) + 1
  return (
    <p className="text-sm text-ink">
      <span className="font-medium">{current.name}</span>
      <span className="text-quiet">
        {' '}· etapa {index} z {phases.length}
        {current.dueDate ? ` · do ${formatDate(current.dueDate)}` : ''}
      </span>
    </p>
  )
}

export function OverviewProjectCard({ p, today }: { p: OverviewProject; today: string }) {
  const { project, money, unread } = p
  const toPay = p.invoices
    .filter((i) => i.state === 'open' || i.state === 'overdue')
    .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
  const hasDetails = Boolean(money || toPay.length || p.consultations.length || project.lastActivity)
  const next = p.consultations[0] ?? null
  return (
    <li className="rounded-box border border-navy-100 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-semibold text-ink">{project.name}</h3>
        <span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">{project.statusLabel}</span>
      </div>

      <div className="mt-3 space-y-2">
        <PhaseLine p={p} />
        <div role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Postup zakázky ${project.name}`}>
          <div className="h-2 overflow-hidden rounded-full bg-navy-50">
            <div className="h-full rounded-full bg-navy-700" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
      </div>

      {hasDetails && (
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {(money || toPay.length > 0) && (
          <div>
            <dt className="text-xs text-quiet">Peníze</dt>
            {money && (
            <dd className="text-ink">
              {money.remaining === 0 && toPay.length === 0 ? (
                'Všechno zaplaceno'
              ) : (
                <>
                  Zaplaceno <span className="font-num">{formatMoney(money.paid)}</span>
                  <span className="text-quiet"> · </span>zbývá <span className="font-num font-semibold">{formatMoney(money.remaining)}</span>
                </>
              )}
            </dd>
            )}
            {toPay.length > 0 && (
              <dd className="text-xs text-quiet">
                K zaplacení faktura {toPay[0].number}
                {toPay[0].dueOn ? ` do ${formatDate(toPay[0].dueOn)}` : ''}
                {toPay.length > 1 ? ` a ${countLabel(toPay.length - 1, ['další', 'další', 'dalších'])}` : ''}
              </dd>
            )}
          </div>
        )}
        {next && (
          <div>
            <dt className="text-xs text-quiet">Konzultace</dt>
            <dd className="flex items-center gap-1.5 text-ink">
              <CalendarClock size={14} strokeWidth={1.5} className="shrink-0 text-navy-600" aria-hidden="true" />
              {consultationWhen(next.startsAt, today)}
            </dd>
          </div>
        )}
        {project.lastActivity && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-quiet">Naposledy jsme udělali</dt>
            <dd className="break-words text-ink">
              {project.lastActivity.title}
              <span className="text-quiet"> · {formatDate(project.lastActivity.publishedAt)}</span>
            </dd>
          </div>
        )}
      </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-navy-100 pt-4">
        <Link
          href={`/klient/zpravy/${project.id}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-chip px-4 text-sm font-semibold',
            unread > 0 ? 'bg-navy-700 text-white hover:bg-navy-800' : 'border border-navy-100 text-ink hover:border-navy-300',
          )}
        >
          <MessagesSquare size={16} strokeWidth={1.5} aria-hidden="true" />
          Zprávy
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-semibold text-signal-ink">
              {unread > 99 ? '99+' : unread}
              <span className="sr-only"> nepřečtených</span>
            </span>
          )}
        </Link>
        <Link
          href={`/klient/projekt/${project.id}`}
          className="inline-flex min-h-11 items-center rounded-chip px-3 text-sm font-medium text-quiet hover:bg-navy-50 hover:text-ink"
        >
          Detail zakázky
        </Link>
      </div>
    </li>
  )
}
