import { Card, CardHead } from '@/components/admin/card'
import { CATEGORY_LABEL } from '@/lib/admin/voice/categories'
import { STATUS_LABEL, guardLabel, type DictationStatus } from '@/lib/admin/voice/labels'
import type { VoiceOverview } from '@/lib/admin/voice/queries'
import {
  formatDays,
  formatDictations,
  formatMinutes,
  formatMs,
  formatUsd,
  formatWords,
  wordsNoun,
  type HeatWeek,
} from '@/lib/admin/voice/stats'
import { cn } from '@/lib/utils'

/**
 * Přehled ZakazIQ Voice (VO10, plán oddíl 8). Kreslí se celý na serveru, bez
 * knihovny a bez JavaScriptu (vzor `components/client-web/web-leads-chart.tsx`):
 * hodnota sloupce se ukáže při najetí myší, čtečka dostane tabulku.
 * Jedna řada = jedna barva; škály (heatmapa) rostou tmavostí (R-103).
 */

const nf = (n: number) => n.toLocaleString('cs-CZ')

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const dayLong = (day: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const monthShort = (day: string) =>
  new Intl.DateTimeFormat('cs-CZ', { month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-quiet">{label}</dt>
      <dd className="mt-1">
        <span className="font-num text-2xl font-semibold leading-none text-ink">{value}</span>
        {unit && <span className="ml-1.5 text-sm text-quiet">{unit}</span>}
        {hint && <span className="mt-1 block text-xs text-quiet">{hint}</span>}
      </dd>
    </div>
  )
}

function StatRow({ o }: { o: VoiceOverview }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Dnes" value={nf(o.todayWords)} unit={wordsNoun(o.todayWords)} />
        <Stat label="Posledních 7 dní" value={nf(o.weekWords)} unit={wordsNoun(o.weekWords)} />
        <Stat label="Celkem" value={nf(o.total.words)} unit={wordsNoun(o.total.words)} hint={formatDictations(o.total.dictations)} />
        <Stat
          label="Rychlost"
          value={o.total.wpm === null ? '—' : nf(o.total.wpm)}
          unit={o.total.wpm === null ? undefined : 'slov za min'}
          hint={o.total.wpm === null ? 'Spočítá se z delších diktátů.' : undefined}
        />
        <Stat
          label="Série"
          value={nf(o.streak.current)}
          unit={o.streak.current === 1 ? 'den' : o.streak.current >= 2 && o.streak.current <= 4 ? 'dny' : 'dní'}
          hint={`Nejdelší ${formatDays(o.streak.longest)}`}
        />
        <Stat
          label="Ušetřený čas"
          value={formatMinutes(o.total.savedMinutes)}
          hint={`Proti psaní rychlostí ${o.settings.typingWpm} slov za minutu`}
        />
      </dl>
    </Card>
  )
}

/** Slova po dnech za 30 dní; dnešek tmavší a s popiskem. */
function DailyChart({ o }: { o: VoiceOverview }) {
  const max = Math.max(0, ...o.last30.map((d) => d.words))
  const height = 132
  const n = o.last30.length
  return (
    <Card className="min-w-0">
      <CardHead title="Slova po dnech" hint="Posledních 30 dní. Najetím myší uvidíte přesné číslo." />
      {max === 0 ? (
        <p className="text-sm text-quiet">Za posledních 30 dní žádné slovo.</p>
      ) : (
        <figure>
          <div aria-hidden="true">
            <div className="relative">
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-navy-100" />
              <span className="absolute -top-2 right-0 bg-surface pl-1 font-num text-[11px] leading-4 text-quiet">{nf(max)}</span>
              <div className="flex items-end gap-[3px]" style={{ height }}>
                {o.last30.map((d, i) => {
                  const today = d.day === o.today
                  const h = d.words === 0 ? 2 : Math.max(4, Math.round((d.words / max) * (height - 8)))
                  const edge = i < 5 ? 'left-0' : i > n - 6 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  return (
                    <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end">
                      <div
                        className={cn(
                          'w-full',
                          d.words === 0
                            ? 'rounded-sm bg-navy-100'
                            : cn('rounded-t-[4px]', today ? 'bg-navy-800' : 'bg-navy-400 group-hover:bg-navy-600'),
                        )}
                        style={{ height: h }}
                      />
                      <span
                        className={cn(
                          'pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-chip bg-navy-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100',
                          edge,
                        )}
                      >
                        {dayLabel(d.day)}: <span className="font-num font-semibold">{formatWords(d.words)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-1 flex justify-between border-t border-navy-100 pt-1 font-num text-[11px] leading-4 text-quiet">
              <span>{dayLabel(o.last30[0].day)}</span>
              <span>{dayLabel(o.last30[Math.floor(n / 2)].day)}</span>
              <span className="font-semibold text-ink">dnes</span>
            </div>
          </div>
          <table className="sr-only">
            <caption>Slova po dnech za posledních 30 dní</caption>
            <thead>
              <tr>
                <th scope="col">Den</th>
                <th scope="col">Slova</th>
              </tr>
            </thead>
            <tbody>
              {o.last30.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{dayLong(d.day)}</th>
                  <td>{d.words}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </Card>
  )
}

const BAND_CLASS = ['bg-navy-50', 'bg-navy-200', 'bg-navy-400', 'bg-navy-600', 'bg-navy-800'] as const
const BAND_LABEL = ['nic', '1–249', '250–499', '500–749', '750 a víc'] as const
const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

/** 26 týdnů × 7 dní, pásma jako ve Wispr Flow. Na úzkém displeji se posouvá vodorovně uvnitř karty. */
function Heatmap({ weeks }: { weeks: HeatWeek[] }) {
  const active = weeks.flatMap((w) => w.cells).filter((c) => c && c.words > 0).length
  return (
    <Card className="min-w-0">
      <CardHead title="Aktivita" hint={`Posledních 26 týdnů, ${formatDays(active)} s diktováním.`} />
      {/* Na úzkém displeji se mřížka posouvá; `rtl` ji otevře u dneška, ne před půl rokem. */}
      <div className="overflow-x-auto pb-1 [direction:rtl]">
        <div className="inline-flex gap-2 [direction:ltr]" aria-hidden="true">
          <div className="grid grid-rows-[16px_repeat(7,14px)] gap-[3px] pr-1 text-[11px] leading-[14px] text-quiet">
            <span />
            {WEEKDAYS.map((d, i) => (
              <span key={d}>{i % 2 === 0 ? d : ''}</span>
            ))}
          </div>
          {weeks.map((w, i) => {
            const first = w.cells.find((c) => c)?.day ?? w.weekStart
            const showMonth = i === 0 || w.weekStart.slice(0, 7) !== weeks[i - 1].weekStart.slice(0, 7)
            return (
              <div key={w.weekStart} className="grid grid-rows-[16px_repeat(7,14px)] gap-[3px]">
                <span className="whitespace-nowrap text-[11px] leading-4 text-quiet">{showMonth ? monthShort(first) : ''}</span>
                {w.cells.map((c, d) =>
                  c ? (
                    <span
                      key={c.day}
                      title={`${dayLong(c.day)}: ${formatWords(c.words)}`}
                      className={cn('h-[14px] w-[14px] rounded-[3px]', BAND_CLASS[c.band])}
                    />
                  ) : (
                    <span key={`${w.weekStart}-${d}`} className="h-[14px] w-[14px]" />
                  ),
                )}
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet" aria-hidden="true">
        Slov za den:
        {BAND_LABEL.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn('h-3 w-3 rounded-[3px]', BAND_CLASS[i])} />
            {label}
          </span>
        ))}
      </p>
      <p className="sr-only">
        Za posledních 26 týdnů jste diktovali {formatDays(active)}. Slova po dnech jsou v grafu nad tímto přehledem.
      </p>
    </Card>
  )
}

function Bars({ rows, empty }: { rows: { key: string; label: string; value: number; detail: string }[]; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max === 0) return <p className="text-sm text-quiet">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="shrink-0 font-num text-xs text-quiet">{r.detail}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-navy-50">
            <div className="h-2 rounded-full bg-navy-600" style={{ width: `${Math.max(2, Math.round((r.value / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Categories({ o }: { o: VoiceOverview }) {
  return (
    <Card>
      <CardHead title="Kategorie" hint="Kam se diktovalo za 30 dní, podle aplikace." />
      <Bars
        empty="Za 30 dní nic."
        rows={o.categories.map((c) => ({
          key: c.category,
          label: CATEGORY_LABEL[c.category],
          value: c.words,
          detail: `${formatWords(c.words)}${c.share === null ? '' : ` · ${c.share} %`}`,
        }))}
      />
    </Card>
  )
}

function Apps({ o }: { o: VoiceOverview }) {
  return (
    <Card>
      <CardHead title="Aplikace" hint="Osm nejčastějších za 30 dní." />
      <Bars
        empty="Za 30 dní nic."
        rows={o.apps.map((a) => ({ key: a.name, label: a.name, value: a.words, detail: `${formatWords(a.words)} · ${formatDictations(a.dictations)}` }))}
      />
    </Card>
  )
}

function Hours({ o }: { o: VoiceOverview }) {
  const max = Math.max(0, ...o.hours)
  const height = 88
  return (
    <Card>
      <CardHead title="Kdy diktujete" hint="Slova podle hodiny dne za 30 dní." />
      {max === 0 ? (
        <p className="text-sm text-quiet">Za 30 dní nic.</p>
      ) : (
        <figure>
          <div aria-hidden="true">
            <div className="flex items-end gap-[3px]" style={{ height }}>
              {o.hours.map((w, h) => (
                <div key={h} className="group relative flex h-full min-w-0 flex-1 items-end">
                  <div
                    className={cn('w-full', w === 0 ? 'rounded-sm bg-navy-100' : 'rounded-t-[3px] bg-navy-500 group-hover:bg-navy-700')}
                    style={{ height: w === 0 ? 2 : Math.max(4, Math.round((w / max) * (height - 4))) }}
                  />
                  <span
                    className={cn(
                      'pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-chip bg-navy-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100',
                      h < 4 ? 'left-0' : h > 19 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                    )}
                  >
                    {h}:00–{h + 1}:00: <span className="font-num font-semibold">{formatWords(w)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between border-t border-navy-100 pt-1 font-num text-[11px] leading-4 text-quiet">
              <span>0</span>
              <span>6</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
          <table className="sr-only">
            <caption>Slova podle hodiny dne</caption>
            <tbody>
              {o.hours.map((w, h) => (
                <tr key={h}>
                  <th scope="row">{h}:00</th>
                  <td>{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </Card>
  )
}

const weekLabel = (monday: string) => `od ${dayLabel(monday)}`

/** Kvalita: opravy po vložení po týdnech (měřítko učení), pojistky, chyby a odezva. */
function Quality({ o }: { o: VoiceOverview }) {
  const problems: DictationStatus[] = ['raw', 'blocked', 'error', 'empty', 'cancelled']
  const anyEdits = o.editShare.some((w) => w.edited > 0)
  const maxShare = Math.max(1, ...o.editShare.map((w) => w.percent ?? 0))
  return (
    <Card>
      <CardHead title="Kvalita" hint="Jestli se systém učí a jak často zasáhla pojistka. Za 30 dní, opravy za 12 týdnů." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Opravené po vložení</h3>
          <p className="mt-0.5 text-xs text-quiet">Podíl diktátů, které jste po vložení upravili. Má klesat.</p>
          {!anyEdits ? (
            <p className="mt-3 text-sm text-quiet">
              Zatím žádná oprava. Jakmile aplikace na Macu začne opravy posílat, uvidíte tady, jestli jich ubývá.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {o.editShare.map((w) => (
                <li key={w.week} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs">
                  <span className="font-num text-quiet">{weekLabel(w.week)}</span>
                  <span className="h-2 rounded-full bg-navy-50">
                    <span
                      className="block h-2 rounded-full bg-navy-600"
                      style={{ width: `${w.percent ? Math.max(3, Math.round((w.percent / maxShare) * 100)) : 0}%` }}
                    />
                  </span>
                  <span className="text-right font-num text-ink">{w.percent === null ? '—' : `${w.percent} %`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Co se stalo s diktáty</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">{STATUS_LABEL.ok}</dt>
              <dd className="font-num text-ink">{nf(o.statuses.ok ?? 0)}</dd>
            </div>
            {problems.map((s) => (
              <div key={s} className="flex items-baseline justify-between gap-3">
                <dt className="text-quiet">{STATUS_LABEL[s]}</dt>
                <dd className={cn('font-num', (s === 'blocked' || s === 'error') && (o.statuses[s] ?? 0) > 0 ? 'text-danger' : 'text-ink')}>
                  {nf(o.statuses[s] ?? 0)}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-navy-100 pt-2">
              <dt className="text-quiet">Odezva (polovina / 95 %)</dt>
              <dd className="font-num text-ink">
                {formatMs(o.latency.p50)} / {formatMs(o.latency.p95)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-quiet">Opravy systémem</dt>
              <dd className="font-num text-ink">{nf(o.total.fixes)}</dd>
            </div>
          </dl>
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Pojistky</h3>
          {o.guards.length === 0 ? (
            <p className="mt-3 text-sm text-quiet">Za 30 dní žádný zásah.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              {o.guards.slice(0, 10).map((g) => (
                <div key={g.code} className="flex items-baseline justify-between gap-3">
                  <dt className="min-w-0 text-quiet">{guardLabel(g.code)}</dt>
                  <dd className="shrink-0 font-num text-ink">{nf(g.count)}×</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </Card>
  )
}

function Costs({ o }: { o: VoiceOverview }) {
  const cap = o.settings.dailyCostCapUsd
  return (
    <Card>
      <CardHead title="Náklady" hint="Přepis a čištění, jak je účtují poskytovatelé (v dolarech)." />
      <dl className="grid grid-cols-2 gap-4">
        <Stat label="Dnes" value={formatUsd(o.cost.today)} />
        <Stat label="Tento měsíc" value={formatUsd(o.cost.month)} />
      </dl>
      <p className="mt-3 text-xs text-quiet">
        {cap > 0
          ? `Denní strop ${formatUsd(cap)}. Nad ním se vkládá jen přepis bez čištění.`
          : 'Denní strop je 0 USD, takže se nečistí nikdy.'}
      </p>
    </Card>
  )
}

export function VoiceOverviewView({ o }: { o: VoiceOverview }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <StatRow o={o} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <DailyChart o={o} />
        <Heatmap weeks={o.heatmap} />
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Categories o={o} />
        <Apps o={o} />
        <Hours o={o} />
      </div>
      <Quality o={o} />
      <Costs o={o} />
    </div>
  )
}
