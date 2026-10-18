import Link from 'next/link'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import type { JobDetail } from '@/lib/ws/jobs'
import { jobFlags } from '@/lib/ws/job-filters'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { formatMinutes, formatRelativeDay, pragueParts } from '@/lib/ws/time'

const when = (d: Date, today: string) => {
  const p = pragueParts(d)
  return `${formatRelativeDay(p.date, today)} ${formatMinutes(p.minutes)}`
}

/**
 * Shrnutí zakázky nahoře v panelu: stav, zákazník, cena, příští termín a
 * upozornění, že je po termínu. Čtení z jednoho dotazu `getJobDetail`.
 */
export function JobSummary({ job, today, now, customerHref }: { job: JobDetail; today: string; now: Date; customerHref: string | null }) {
  const flags = jobFlags(
    { stageType: job.stageType, closed: job.closedAt !== null, nextStart: job.nextStart, lastEnd: job.lastEnd },
    now,
  )
  return (
    <div className="flex flex-col gap-2.5 rounded-box bg-navy-50 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {job.stageName && (
          <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ink">{job.stageName}</span>
        )}
        {flags.overdue && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
            <AlertTriangle aria-hidden size={16} strokeWidth={1.5} />
            Po termínu
          </span>
        )}
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[15px]">
        {job.customerName ? (
          customerHref ? (
            <Link href={customerHref} scroll={false} className="font-semibold text-ink underline-offset-4 hover:underline">
              {job.customerName}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{job.customerName}</span>
          )
        ) : (
          <span className="text-quiet">Bez zákazníka</span>
        )}
        {job.price !== null && <span className="font-num text-ink">{formatMoney(job.price, { currency: job.currency as WsCurrency })}</span>}
      </p>
      <p className="inline-flex items-center gap-2 font-num text-sm text-quiet">
        <CalendarClock aria-hidden size={16} strokeWidth={1.5} />
        {job.nextStart ? `Příští termín: ${when(job.nextStart, today)}` : job.lastEnd ? `Poslední termín: ${when(job.lastEnd, today)}` : 'Zatím bez termínu'}
      </p>
    </div>
  )
}

/**
 * Historie stavů: co a kdy se s zakázkou dělo. Změny stavu se zaznamenávají
 * od RD06 (ws.audit_log); starší zakázky mají jen den vzniku.
 */
export function JobHistory({ job, today }: { job: JobDetail; today: string }) {
  return (
    <section aria-label="Historie stavů" className="flex flex-col gap-3 border-t pt-5">
      <h3 className="text-[16px] font-semibold text-ink">Historie stavů</h3>
      <ol className="flex flex-col gap-2.5 text-[15px]">
        {job.history.map((h, i) => (
          <li key={i} className="grid grid-cols-[136px_minmax(0,1fr)] gap-3">
            <span className="font-num text-xs leading-6 text-quiet">{when(h.at, today)}</span>
            <span className="min-w-0 text-ink">
              {h.from ? <span className="text-quiet">{h.from} → </span> : null}
              <span className="font-semibold">{h.to}</span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[136px_minmax(0,1fr)] gap-3">
          <span className="font-num text-xs leading-6 text-quiet">{when(job.createdAt, today)}</span>
          <span className="text-ink">Zakázka vznikla</span>
        </li>
      </ol>
    </section>
  )
}
