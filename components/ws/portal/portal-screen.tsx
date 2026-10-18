import { CalendarPlus, Check, ExternalLink, FileDown, MapPin } from 'lucide-react'
import { LoyaltyCard, Logo, Money } from '@/components/ws/brand'
import { ReviewForm } from './review-form'
import { VisitActions } from './visit-actions'
import { accentVars } from '@/lib/ws/accent'
import type { WsCurrency } from '@/lib/ws/money'
import type { PortalJob, PortalRequest, PortalView, PortalVisit } from '@/lib/ws/portal'
import { cn } from '@/lib/ws/utils'
import { formatClock, formatDayLong, formatDayShort, formatTimeRange, pragueParts } from '@/lib/ws/time'

// Obrazovka klientského portálu (S16) — jen vykreslení, data připraví
// lib/ws/portal.ts (stránka /z/[token]).

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

const longWhen = (d: Date) => {
  const p = pragueParts(d)
  return `${formatDayLong(p.date)} v ${formatClock(d)}`
}

export function PortalScreen({ token, view }: { token: string; view: PortalView }) {
  const { brand } = view
  return (
    <div style={accentVars(brand.color)} className="min-h-screen bg-ground">
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 pb-16 pt-8 sm:pt-12">
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-chip bg-navy-700 text-[17px] font-semibold text-white"
          >
            {initials(brand.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{brand.name}</p>
            <p className="text-[14px] text-quiet">{view.job ? 'Vaše zakázka' : view.request ? 'Vaše poptávka' : 'Váš termín'}</p>
          </div>
        </header>

        {view.visit && <VisitSection token={token} visit={view.visit} address={brand.address} />}
        {view.job && <JobSection token={token} job={view.job} address={brand.address} />}
        {view.request && <RequestSection request={view.request} />}

        {view.loyalty && view.loyalty.reward && (
          <section aria-labelledby="vernost" className="flex flex-col gap-3">
            <h2 id="vernost" className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
              Věrnostní karta
            </h2>
            <LoyaltyCard
              customer={view.firstName ?? brand.name}
              business={view.firstName ? brand.name : undefined}
              stamps={view.loyalty.stamps}
              total={view.loyalty.needed}
              reward={view.loyalty.reward}
              status={view.loyalty.status}
              accentColor={brand.color}
            />
          </section>
        )}

        {view.review && (view.review.eligible || view.review.done) && (
          <section aria-labelledby="hodnoceni" className="flex flex-col gap-4 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
            <h2 id="hodnoceni" className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
              {view.review.done ? 'Děkujeme za hodnocení' : 'Jak jste byli spokojeni?'}
            </h2>
            {view.review.done ? (
              <p className="text-[15px] text-quiet">
                Dali jste <span className="font-num text-ink">{view.review.done.score}</span> z 10.
                {view.review.done.comment ? ' Váš komentář si firma přečte.' : ''}
              </p>
            ) : (
              <ReviewForm token={token} />
            )}
          </section>
        )}

        <footer className="mt-auto flex items-center gap-2 pt-6 text-[13px] text-quiet">
          <Logo size={18} />
          <span>Přehled přes ZakazIQ</span>
        </footer>
      </main>
    </div>
  )
}

function RequestSection({ request }: { request: PortalRequest }) {
  const status = request.status === 'new'
    ? 'Čeká na potvrzení'
    : request.status === 'declined'
      ? 'Poptávka byla odmítnuta'
      : 'Poptávka je přijatá'
  return (
    <section aria-labelledby="poptavka" className="flex flex-col gap-4 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="font-num text-[12px] uppercase tracking-[0.08em] text-navy-500">{status}</p>
        <h1 id="poptavka" className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">Vaše objednávka</h1>
        {request.service && <p className="text-[15px] text-quiet">{request.service}</p>}
        {request.start && (
          <p className="text-[15px] text-ink">
            {longWhen(request.start)}{request.end ? `–${formatClock(request.end)}` : ''}
          </p>
        )}
      </div>
      {request.status === 'new' && (
        <p className="rounded-chip bg-ground p-3 text-[15px] leading-relaxed text-quiet">
          Vybraný termín ještě není potvrzený. Firma vám dá vědět, jakmile poptávku vyřídí.
        </p>
      )}
      {request.status === 'declined' && (
        <p className="rounded-chip bg-ground p-3 text-[15px] leading-relaxed text-quiet">
          Firma tento termín nemůže přijmout.
        </p>
      )}
      {(request.status === 'confirmed' || request.status === 'rescheduled') && (
        <p className="rounded-chip bg-ground p-3 text-[15px] leading-relaxed text-quiet">
          Firma vaši poptávku přijala. Pokud se domluvíte na termínu, najdete ho zde.
        </p>
      )}
    </section>
  )
}

const VISIT_STATE: Record<PortalVisit['state'], string> = {
  upcoming: 'Potvrzený termín',
  past: 'Termín proběhl',
  completed: 'Termín proběhl',
  cancelled: 'Zrušený termín',
  no_show: 'Termín proběhl bez vás',
}

function Address({ address }: { address: string | null }) {
  if (!address) return null
  return (
    <p className="flex items-start gap-2 text-[15px] text-ink">
      <MapPin aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-quiet" />
      <span>{address}</span>
    </p>
  )
}

function VisitSection({ token, visit, address }: { token: string; visit: PortalVisit; address: string | null }) {
  const day = pragueParts(visit.start).date
  const cancelled = visit.state === 'cancelled'
  return (
    <section aria-labelledby="termin" className="flex flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className={cn('font-num text-[12px] uppercase tracking-[0.08em]', cancelled ? 'text-danger' : 'text-navy-500')}>
          {VISIT_STATE[visit.state]}
        </p>
        <h1 id="termin" className={cn('text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink', cancelled && 'line-through decoration-1')}>
          {formatDayLong(day)}
        </h1>
        <p className="font-num text-[17px] text-ink">{formatTimeRange(visit.start, visit.end)}</p>
        {visit.service && <p className="text-[15px] text-quiet">{visit.service}</p>}
      </div>

      {!cancelled && <Address address={address} />}

      {visit.calendarUrl && (
        <a
          href={visit.calendarUrl}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800"
        >
          <CalendarPlus aria-hidden size={18} strokeWidth={1.5} />
          Přidat do kalendáře
        </a>
      )}

      {visit.state === 'upcoming' && (
        <VisitActions
          token={token}
          canMove={visit.canMove}
          canCancel={visit.canCancel}
          deadline={visit.deadline ? longWhen(visit.deadline) : null}
          locked={visit.locked}
        />
      )}
    </section>
  )
}

function JobSection({ token, job, address }: { token: string; job: PortalJob; address: string | null }) {
  const current = job.stages.find((s) => s.state === 'current')
  const status = job.cancelled ? 'Zakázka je zrušená' : job.finished ? 'Hotovo' : current ? current.name : 'Přijato'
  return (
    <>
      <section aria-labelledby="zakazka" className="flex flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <p className={cn('font-num text-[12px] uppercase tracking-[0.08em]', job.cancelled ? 'text-danger' : 'text-navy-500')}>{status}</p>
          <h1 id="zakazka" className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {job.title}
          </h1>
        </div>

        {!job.cancelled && job.stages.length > 0 && (
          <ol className="flex flex-col" aria-label="Postup">
            {job.stages.map((s, i) => (
              <li key={`${s.name}-${i}`} className="relative flex items-center gap-3 pb-4 last:pb-0" aria-current={s.state === 'current' ? 'step' : undefined}>
                {i < job.stages.length - 1 && (
                  <span aria-hidden className={cn('absolute left-[11px] top-6 h-[calc(100%-16px)] w-0.5', s.state === 'done' ? 'bg-navy-700' : 'bg-navy-100')} />
                )}
                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-tiny',
                    s.state === 'done' && 'bg-navy-700 text-white',
                    s.state === 'current' && 'border-2 border-navy-700 bg-navy-50',
                    s.state === 'todo' && 'border border-dashed border-navy-200 bg-surface',
                  )}
                >
                  {s.state === 'done' && <Check size={14} strokeWidth={2} />}
                </span>
                <span className={cn('text-[15px]', s.state === 'todo' ? 'text-quiet' : 'font-semibold text-ink')}>
                  {s.name}
                  <span className="sr-only">{s.state === 'done' ? ' — hotovo' : s.state === 'current' ? ' — právě teď' : ' — čeká'}</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <Address address={address} />

        {job.resultUrl && (
          <a
            href={job.resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800"
          >
            Zobrazit výsledek
            <ExternalLink aria-hidden size={16} strokeWidth={1.5} />
          </a>
        )}
      </section>

      {job.visits.length > 0 && (
        <section aria-labelledby="terminy" className="flex flex-col gap-3">
          <h2 id="terminy" className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
            Domluvené termíny
          </h2>
          <ul className="flex flex-col gap-2">
            {job.visits.map((v) => (
              <li key={v.token}>
                <a
                  href={`/z/${v.token}`}
                  className="flex min-h-11 flex-col rounded-chip border border-navy-100 border-l-[3px] border-l-navy-700 bg-navy-100/40 px-4 py-3 hover:bg-navy-100"
                >
                  <span className="text-[15px] font-semibold text-ink">{formatDayLong(pragueParts(v.start).date)}</span>
                  <span className="font-num text-[14px] text-navy-900">{formatTimeRange(v.start, v.end)}</span>
                  {v.service && <span className="text-[14px] text-quiet">{v.service}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="zpravy" className="flex flex-col gap-3">
        <h2 id="zpravy" className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
          Zprávy od firmy
        </h2>
        {job.updates.length === 0 ? (
          <p className="text-[15px] text-quiet">Zatím žádná zpráva. Až bude co nového, objeví se tady.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {job.updates.map((u, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-chip border border-navy-100 bg-surface px-4 py-3">
                <span className="font-num text-[12px] text-quiet">
                  {formatDayShort(pragueParts(u.at).date)} · {formatClock(u.at)}
                </span>
                <p className="whitespace-pre-line text-[15px] text-ink">{u.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {job.invoices.length > 0 && (
        <section aria-labelledby="faktury" className="flex flex-col gap-3">
          <h2 id="faktury" className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
            Faktury
          </h2>
          <ul className="flex flex-col gap-2">
            {job.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-chip border border-navy-100 bg-surface px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-num text-[14px] text-ink">{inv.number}</span>
                  <span className="text-[13px] text-quiet">
                    {inv.paid ? 'Zaplaceno' : inv.dueOn ? `Splatnost ${formatDayShort(inv.dueOn)}` : 'Čeká na zaplacení'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Money amount={inv.amount} currency={inv.currency as WsCurrency} className="text-[15px] font-semibold" />
                  <a
                    href={`/z/${token}/faktura/${inv.id}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-navy-700 hover:bg-navy-50"
                    aria-label={`Stáhnout fakturu ${inv.number}`}
                  >
                    <FileDown aria-hidden size={20} strokeWidth={1.5} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
