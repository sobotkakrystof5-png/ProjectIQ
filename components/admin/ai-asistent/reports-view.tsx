import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, CardHead, SECTION_LABEL } from '@/components/admin/card'
import { CallCard } from '@/components/admin/ai-asistent/call-card'
import { pct, type DayReport } from '@/lib/admin/outreach-analysis'
import type { ReportListItem } from '@/lib/admin/outreach-reports'

/**
 * AI asistent › Reporty (R-118): den po dni, co robot nahovořil. Vykresluje
 * se jen ze strukturovaných dat; přepisy a shrnutí jsou texty o skutečných
 * lidech — jen jako text (React escapuje sám), rozbalují se nativním <details>.
 */

/** „pondělí 17. 11." z „2026-11-17". */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function ReportDaysList({ days, hrefFor }: { days: ReportListItem[]; hrefFor: (date: string) => string }) {
  if (days.length === 0) {
    return (
      <div className="rounded-box border border-navy-100 bg-surface px-5 py-8 text-center">
        <p className="text-sm font-semibold text-ink">Zatím tu žádný report není.</p>
        <p className="mt-1 text-sm text-quiet">
          Robot pošle report po každém kole volání. Starší dny dotáhne skript zakaziq-report v autopilotu.
        </p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-navy-100 overflow-hidden rounded-box border border-navy-100 bg-surface">
      {days.map((d) => {
        const s = d.stats
        return (
          <li key={d.date}>
            <Link
              href={hrefFor(d.date)}
              className="flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-navy-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold capitalize text-ink">
                  {dayLabel(d.date)}
                  {d.round > 0 && <span className="ml-2 font-normal normal-case text-quiet">po {d.round}. kole</span>}
                </span>
                <span className="block text-xs text-quiet">
                  Vytočeno <span className="font-num">{s.calls ?? 0}</span>, zvedlo{' '}
                  <span className="font-num">{s.connected ?? 0}</span>, souhlas{' '}
                  <span className="font-num">{s.accepted ?? 0}</span>
                  {s.callback ? (
                    <>
                      , zavolat jindy <span className="font-num">{s.callback}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="hidden font-num text-sm text-ink sm:block">{pct(s.accepted ?? 0, s.connected ?? 0)}</span>
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-chip border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs text-quiet">{label}</p>
      <p className="mt-1 font-num text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="text-xs text-quiet">{hint}</p>}
    </div>
  )
}

export function ReportDayDetail({
  report,
  leadHrefs,
}: {
  report: DayReport
  /** Klíč firmy z Growth OS → odkaz na detail klienta. */
  leadHrefs?: Map<string, string>
}) {
  const s = report.stats
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vytočeno" value={s.calls ?? 0} />
        <Stat label="Zvedlo" value={s.connected ?? 0} hint={pct(s.connected ?? 0, s.calls ?? 0)} />
        <Stat label="Souhlas s ukázkou" value={s.accepted ?? 0} hint={`${pct(s.accepted ?? 0, s.connected ?? 0)} ze zvednutých`} />
        <Stat label="Zavolat jindy" value={s.callback ?? 0} />
      </div>
      <p className="text-sm text-quiet">
        Položilo bez rozhodnutí <span className="font-num">{s.hungUp ?? 0}</span>, mlčky položilo{' '}
        <span className="font-num">{s.silent ?? 0}</span>, neslyšelo nás <span className="font-num">{s.cantHear ?? 0}</span>,
        odmítlo <span className="font-num">{s.declined ?? 0}</span>. Medián hovoru{' '}
        <span className="font-num">{s.medianS ?? 0} s</span>
        {s.medianIntroS !== null && s.medianIntroS !== undefined && (
          <>
            , nabídka zazněla po <span className="font-num">{s.medianIntroS} s</span>
          </>
        )}
        {s.costEur ? (
          <>
            . Cena hovorů <span className="font-num">{s.costEur}</span>
          </>
        ) : null}
        .
      </p>

      {report.rounds.length > 1 && (
        <Card>
          <CardHead title="Kola" hint="Kdo v kterém kole zvedl a jak dopadl." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-quiet">
                  <th className="py-2 pr-3 font-medium">Kolo</th>
                  <th className="py-2 pr-3 font-medium">Vytočeno</th>
                  <th className="py-2 pr-3 font-medium">Zvedlo</th>
                  <th className="py-2 pr-3 font-medium">Souhlas</th>
                  <th className="py-2 pr-3 font-medium">Položilo</th>
                  <th className="py-2 font-medium">Nezvedlo</th>
                </tr>
              </thead>
              <tbody className="font-num">
                {report.rounds.map((r) => (
                  <tr key={r.round} className="border-t border-navy-100">
                    <td className="py-2 pr-3 font-sans">
                      {r.round}. {r.time ? <span className="text-quiet">({r.time})</span> : null}
                    </td>
                    <td className="py-2 pr-3">{r.called}</td>
                    <td className="py-2 pr-3">{r.picked}</td>
                    <td className="py-2 pr-3">{r.accepted}</td>
                    <td className="py-2 pr-3">{r.hungUp + r.silent}</td>
                    <td className="py-2">{r.notAnswered + r.voicemail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <section aria-labelledby="hovory-dne" className="flex flex-col gap-2">
        <h2 id="hovory-dne" className={SECTION_LABEL}>
          Hovory ({report.calls.length})
        </h2>
        {report.calls.length === 0 ? (
          <p className="text-sm text-quiet">Report přišel bez jednotlivých hovorů.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.calls.map((c) => (
              <CallCard key={c.id} call={c} companyHref={leadHrefs?.get(c.leadId) ?? null} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
