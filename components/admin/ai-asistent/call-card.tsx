import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { SECTION_LABEL } from '@/components/admin/card'
import { resultBadge, transcriptText, type AnalysisCall } from '@/lib/admin/outreach-analysis'
import {
  collectedLabel,
  collectedValue,
  criterionLabel,
  czk,
  durationLabel,
  type CallView,
} from '@/lib/admin/outreach-crm-view'
import { cn } from '@/lib/utils'

/**
 * Jeden hovor AI asistenta (R-118, R-120) — v Reportech den po dni a v detailu
 * klienta. Rozbaluje se nativním `<details>`, takže funguje bez JavaScriptu.
 *
 * Shrnutí, přepis a sesbíraná data jsou texty o skutečném člověku: jen text
 * (React escapuje sám), nikdy HTML. Nahrávky se nepřehrávají, stačí přepis
 * (rozhodl Kryštof 2026-11-18).
 */

const PRAGUE = 'Europe/Prague'

function timeLabel(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function dateTimeLabel(iso: string | null, date: string): string {
  const at = iso ? new Date(iso) : new Date(`${date}T12:00:00Z`)
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: PRAGUE,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    ...(iso ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(at)
}

function isView(call: AnalysisCall | CallView): call is CallView {
  return 'rowId' in call
}

const HUNG_UP: Record<string, string> = { client: 'položil klient', agent: 'ukončil asistent', system: 'spojení spadlo' }

export function CallCard({
  call,
  showDate = false,
  companyHref,
  defaultOpen = false,
}: {
  call: AnalysisCall | CallView
  /** V detailu klienta datum, v Reportech (jeden den) jen čas. */
  showDate?: boolean
  /** Odkaz na detail klienta (v Reportech). */
  companyHref?: string | null
  defaultOpen?: boolean
}) {
  const badge = resultBadge(call.result)
  const view = isView(call) ? call : null
  const collected = view ? Object.entries(view.collected) : []
  const criteria = view?.criteria ?? []
  const hasDetail = Boolean(
    call.summary ||
      call.transcript?.length ||
      call.failedCriteria.length ||
      call.objections.length ||
      call.chanceWhy.length ||
      collected.length ||
      criteria.length,
  )
  const meta = [
    showDate ? null : call.industry,
    call.round ? `${call.round}. kolo` : null,
    durationLabel(call.durationS),
    call.whoHungUp ? HUNG_UP[call.whoHungUp] ?? null : null,
    call.chanceLevel && call.chanceLevel !== 'zatím nevíme' && call.chanceLevel !== 'žádná' ? `šance ${call.chanceLevel}` : null,
    view?.costCzk ? czk(view.costCzk) : null,
  ].filter(Boolean)
  // V detailu klienta je firma nad kartou, nadpisem je proto začátek shrnutí.
  const title = showDate ? (call.summary?.split('\n')[0] ?? 'Hovor') : call.company

  const head = (
    <span className="flex min-h-11 items-center gap-3 px-4 py-2.5">
      <span className={cn('shrink-0 font-num text-xs text-quiet', showDate ? 'w-24' : 'w-12')}>
        {showDate ? dateTimeLabel(call.calledAt, call.date) : timeLabel(call.calledAt)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-quiet">{meta.join(' · ')}</span>
      </span>
      <Badge variant={badge.tone} className="shrink-0">
        {badge.label}
      </Badge>
    </span>
  )

  const anchor = view ? `hovor-${view.rowId}` : undefined
  if (!hasDetail) {
    return (
      <li id={anchor} className="scroll-mt-24 rounded-box border border-navy-100 bg-surface">
        {head}
      </li>
    )
  }

  return (
    <li id={anchor} className="scroll-mt-24 rounded-box border border-navy-100 bg-surface">
      <details className="group" open={defaultOpen}>
        <summary className="cursor-pointer list-none rounded-box transition-colors hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
          {head}
        </summary>
        <div className="flex flex-col gap-4 border-t border-navy-100 px-4 py-4">
          {companyHref && (
            <Link
              href={companyHref}
              className="inline-flex min-h-11 items-center self-start text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
            >
              Detail klienta: všechny hovory, ukázka, e-maily
            </Link>
          )}
          {call.chanceWhy.length > 0 && (
            <div>
              <h3 className={SECTION_LABEL}>Proč tahle šance</h3>
              <p className="mt-1 text-sm text-ink">{call.chanceWhy.join('; ')}</p>
              {call.chanceAction && <p className="mt-1 text-sm text-quiet">Co dál: {call.chanceAction}</p>}
            </div>
          )}
          {call.summary && (
            <div>
              <h3 className={SECTION_LABEL}>Shrnutí</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{call.summary}</p>
              <p className="mt-1 text-xs text-quiet">Shrnul to AI asistent, nemusí být přesné. Klientovi to neposílejte.</p>
            </div>
          )}
          {collected.length > 0 && (
            <div>
              <h3 className={SECTION_LABEL}>Co asistent zjistil</h3>
              <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                {collected.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-quiet">{collectedLabel(k)}</dt>
                    <dd className="whitespace-pre-wrap text-ink">{collectedValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {call.objections.length > 0 && (
            <div>
              <h3 className={SECTION_LABEL}>Námitky a otázky</h3>
              <p className="mt-1 text-sm text-ink">{call.objections.join('; ')}</p>
            </div>
          )}
          {criteria.length > 0 ? (
            <div>
              <h3 className={SECTION_LABEL}>Jak si asistent vedl</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-ink">
                {criteria.map((c) => {
                  const r = criterionLabel(c.result)
                  return (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                      <Badge variant={r.ok === false ? 'danger' : r.ok ? 'confirmed' : 'neutral'}>{r.label}</Badge>
                      <span className="font-medium">{c.name}</span>
                      {r.ok === false && c.rationale ? <span className="text-quiet">{c.rationale}</span> : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            call.failedCriteria.length > 0 && (
              <div>
                <h3 className={SECTION_LABEL}>Kde agent chyboval</h3>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-ink">
                  {call.failedCriteria.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium">{f.name}</span>
                      {f.rationale ? <span className="text-quiet"> — {f.rationale}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
          {call.transcript && call.transcript.length > 0 && (
            <div>
              <h3 className={SECTION_LABEL}>Přepis</h3>
              <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-chip bg-navy-50 p-3 font-num text-xs leading-relaxed text-ink">
                {transcriptText(call.transcript, 20_000)}
              </pre>
            </div>
          )}
          {view && (view.terminationReason || view.telephonyStatus) && (
            <p className="text-xs text-quiet">
              {[
                view.terminationReason ? `Konec hovoru: ${view.terminationReason}` : null,
                view.telephonyStatus ? `Operátor: ${view.telephonyStatus}` : null,
                view.costSource === 'odhad' ? 'Cena je odhad z délky hovoru.' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </details>
    </li>
  )
}
