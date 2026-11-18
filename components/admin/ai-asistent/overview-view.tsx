import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHead } from '@/components/admin/card'
import { pct, resultBadge } from '@/lib/admin/outreach-analysis'
import { agoLabel, czk, durationLabel, syncIsStale } from '@/lib/admin/outreach-crm-view'
import { formatWhen, queueReason } from '@/lib/admin/outreach-view'
import type { Overview } from '@/lib/admin/outreach-crm'
import { cn } from '@/lib/utils'

/**
 * AI asistent › Přehled (R-120): co se dnes stalo, komu je na tahu Kryštof,
 * kolik lidí došlo jak daleko a jestli Growth OS posílá data. Jedna hlavní
 * akce obrazovky: první firma „na tahu".
 */

const detailHref = (id: string) => `/dashboard/ai-asistent/kontakt/${id}`

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-chip border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs text-quiet">{label}</p>
      <p className="mt-1 font-num text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="text-xs text-quiet">{hint}</p>}
    </div>
  )
}

function Bar({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-50" aria-hidden="true">
      <div className={cn('h-full rounded-full', strong ? 'bg-navy-700' : 'bg-navy-300')} style={{ width: `${w}%` }} />
    </div>
  )
}

export function OverviewView({ data, nowIso, funnelDays }: { data: Overview; nowIso: string; funnelDays: number }) {
  const now = new Date(nowIso)
  const { today, week, funnel } = data

  const stages = [
    { key: 'dialed', label: 'Obvoláno', count: funnel.dialed },
    { key: 'reached', label: 'Zvedli', count: funnel.reached },
    { key: 'accepted', label: 'Chtějí ukázku', count: funnel.accepted },
    { key: 'demoSent', label: 'Ukázka odeslaná', count: funnel.demoSent },
    { key: 'opened', label: 'Otevřeli ukázku nebo e-mail', count: funnel.opened },
    { key: 'interested', label: 'Odpověděli nebo mají schůzku', count: funnel.interested },
    { key: 'won', label: 'Zakázka', count: funnel.won },
  ]
  const max = Math.max(stages[0].count, 1)
  const costPerAccepted = week.costCzk !== null && week.accepted > 0 ? week.costCzk / week.accepted : null
  const syncAt = [data.lastSync.leads, data.lastSync.calls, data.lastSync.reports]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null
  const stale = syncIsStale(syncAt, now)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dnes vytočeno" value={today.calls} hint={`za 7 dní ${week.calls}`} />
        <Stat label="Dnes zvedlo" value={today.connected} hint={`za 7 dní ${week.connected} (${pct(week.connected, week.calls)})`} />
        <Stat label="Dnes chtějí ukázku" value={today.accepted} hint={`za 7 dní ${week.accepted} (${pct(week.accepted, week.connected)} zvednutých)`} />
        <Stat
          label="Hovory dnes stály"
          value={czk(today.costCzk) ?? '–'}
          hint={week.costCzk !== null ? `za 7 dní ${czk(week.costCzk)}` : 'Cenu Growth OS zatím neposílá'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHead
            title="Na tahu jste vy"
            hint={
              data.queueTotal > 0
                ? `${data.queueTotal} ${data.queueTotal === 1 ? 'firma čeká' : data.queueTotal < 5 ? 'firmy čekají' : 'firem čeká'} na hovor, schůzku nebo odpověď.`
                : 'Teď nikdo nečeká. Jakmile si někdo řekne o ukázku nebo o hovor, objeví se tady.'
            }
            action={
              data.queueTotal > 0 ? (
                <Link
                  href="/dashboard/ai-asistent?pohled=kontakty"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
                >
                  Celá fronta
                  <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                </Link>
              ) : undefined
            }
          />
          {data.queue.length > 0 && (
            <ul className="-mx-2 flex flex-col">
              {data.queue.map((row) => {
                const reason = queueReason(row, now)
                return (
                  <li key={row.id}>
                    <Link
                      href={detailHref(row.id)}
                      className="flex min-h-11 items-center gap-3 rounded-chip px-2 py-2 transition-colors hover:bg-navy-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{row.company}</span>
                        <span className="block truncate text-xs text-quiet">
                          {[row.contactName, row.industry, row.city].filter(Boolean).join(' · ') || 'Bez dalších údajů'}
                        </span>
                      </span>
                      <Badge variant={reason.urgent ? 'signal' : 'neutral'} className="hidden shrink-0 sm:inline-flex">
                        {reason.label}
                      </Badge>
                      <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead title="Cesta k zakázce" hint={`Firmy, se kterými se za posledních ${funnelDays} dní něco dělo.`} />
          {funnel.dialed === 0 ? (
            <p className="text-sm text-quiet">Za tohle období asistent nikomu nevolal.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {stages.map((s, i) => (
                <li key={s.key} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[13rem_1fr_5.5rem]">
                  <span className="text-sm text-ink">{s.label}</span>
                  <Bar value={s.count} max={max} strong={s.key === 'won' || s.key === 'interested'} />
                  <span className="text-right font-num text-sm text-ink">
                    {s.count}
                    {i > 0 && <span className="ml-2 text-xs text-quiet">{pct(s.count, stages[i - 1].count)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHead
            title="Poslední hovory"
            hint="Nový hovor se tu objeví do minuty po zavěšení, jakmile ho Growth OS pošle."
            action={
              <Link
                href="/dashboard/ai-asistent?pohled=reporty"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
              >
                Reporty
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            }
          />
          {data.recentCalls.length === 0 ? (
            <p className="text-sm text-quiet">Zatím tu žádný hovor není.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {data.recentCalls.map((c) => {
                const badge = resultBadge(c.result)
                const inner = (
                  <>
                    <span className="w-24 shrink-0 font-num text-xs text-quiet">
                      {c.calledAt ? formatWhen(c.calledAt, now) : c.date}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.company}</span>
                      <span className="block truncate text-xs text-quiet">
                        {[durationLabel(c.durationS), c.chanceLevel && !['zatím nevíme', 'žádná'].includes(c.chanceLevel) ? `šance ${c.chanceLevel}` : null]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </span>
                    </span>
                    <Badge variant={badge.tone} className="shrink-0">
                      {badge.label}
                    </Badge>
                  </>
                )
                return (
                  <li key={c.rowId}>
                    {c.leadId ? (
                      <Link
                        href={`${detailHref(c.leadId)}#hovor-${c.rowId}`}
                        className="flex min-h-11 items-center gap-3 rounded-chip px-2 py-2 transition-colors hover:bg-navy-50"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex min-h-11 items-center gap-3 px-2 py-2">{inner}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead title="Provoz" hint="Jestli Growth OS posílá data a kolik zbývá kreditu." />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">Poslední data z Growth OS</dt>
              <dd className={cn('text-right font-medium', stale ? 'text-danger' : 'text-ink')}>
                {syncAt ? agoLabel(syncAt, now) : 'zatím nic'}
              </dd>
            </div>
            {stale && (
              <p className="rounded-chip bg-navy-50 px-3 py-2 text-xs text-ink">
                Dlouho nepřišla žádná data. Zkontrolujte v Growth OS workflow „Synchronizace do ZakazIQ" a klíč GROWTH_OS_API_KEY.
              </p>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">Kredit Odorik</dt>
              <dd className="text-right font-num text-ink">{czk(data.account?.odorikBalanceCzk ?? null) ?? '–'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">Kredity ElevenLabs</dt>
              <dd className="text-right font-num text-ink">
                {data.account?.elevenlabsCreditsLeft !== null && data.account?.elevenlabsCreditsLeft !== undefined
                  ? `${data.account.elevenlabsCreditsLeft.toLocaleString('cs-CZ')}${
                      data.account.elevenlabsCreditsLimit ? ` z ${data.account.elevenlabsCreditsLimit.toLocaleString('cs-CZ')}` : ''
                    }`
                  : '–'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">Cena za jeden souhlas (7 dní)</dt>
              <dd className="text-right font-num text-ink">{czk(costPerAccepted) ?? '–'}</dd>
            </div>
            {!data.account && (
              <p className="text-xs text-quiet">Kredity se ukážou, až je Growth OS začne posílat v denním reportu.</p>
            )}
            {data.account?.checkedAt && <p className="text-xs text-quiet">Kredity zjištěny {agoLabel(data.account.checkedAt, now)}.</p>}
          </dl>
        </Card>
      </div>
    </div>
  )
}
