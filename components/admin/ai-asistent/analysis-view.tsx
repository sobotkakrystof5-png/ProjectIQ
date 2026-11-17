import { Card, CardHead } from '@/components/admin/card'
import { CopyPrompt } from '@/components/admin/ai-asistent/copy-prompt'
import { dayLabel } from '@/components/admin/ai-asistent/reports-view'
import { pct, type Analysis, type DayTrend } from '@/lib/admin/outreach-analysis'
import { cn } from '@/lib/utils'

/**
 * AI asistent › Analýza (R-118): úspěšnost, kde hovory váznou a hotový
 * prompt pro Claude Code. Sloupce jsou obyčejné šířky v CSS — data jsou
 * vždy i jako číslo, graf jen pomáhá oku.
 */

function Bar({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-50" aria-hidden="true">
      <div className={cn('h-full rounded-full', strong ? 'bg-navy-700' : 'bg-navy-300')} style={{ width: `${w}%` }} />
    </div>
  )
}

export function AnalysisView({
  analysis: a,
  trend,
  prompt,
}: {
  analysis: Analysis
  trend: DayTrend[]
  prompt: string
}) {
  if (a.dialed === 0) {
    return (
      <div className="rounded-box border border-navy-100 bg-surface px-5 py-8 text-center">
        <p className="text-sm font-semibold text-ink">Za tohle období nejsou žádné hovory.</p>
        <p className="mt-1 text-sm text-quiet">Zkuste delší období, nebo počkejte na první report od robota.</p>
      </div>
    )
  }

  const max = a.funnel[0].count
  const accepted = a.funnel[a.funnel.length - 1].count
  const hungMax = Math.max(...a.hangupBuckets.map((b) => b.count), 0)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHead
          title="Úspěšnost"
          hint={
            <>
              Souhlas s ukázkou u <span className="font-num">{pct(accepted, a.dialed)}</span> vytočených a{' '}
              <span className="font-num">{pct(accepted, a.funnel[1].count)}</span> zvednutých.
              {a.smallSample ? ' Vzorek je zatím malý, berte to jako náznak.' : ''}
            </>
          }
        />
        <ol className="flex flex-col gap-3">
          {a.funnel.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 sm:grid-cols-[12rem_1fr_6rem]">
              <span className="text-sm text-ink">{s.label}</span>
              <Bar value={s.count} max={max} strong={i === a.funnel.length - 1} />
              <span className="text-right font-num text-sm text-ink">
                {s.count}
                {i > 0 && <span className="ml-2 text-xs text-quiet">{pct(s.count, a.funnel[i - 1].count)}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHead title="Kde hovory váznou" hint="Kolik hovorů se ztratilo na kterém kroku. Zvýrazněný je největší problém, který ovlivní agent." />
        <ul className="flex flex-col gap-3">
          {a.leaks.map((l) => {
            const main = a.bottleneck?.key === l.key
            return (
              <li
                key={l.key}
                className={cn(
                  'rounded-chip border px-4 py-3',
                  main ? 'border-navy-700 bg-navy-50' : 'border-navy-100',
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {l.label}
                    {main && <span className="ml-2 text-xs font-medium text-navy-700">hlavní problém</span>}
                  </p>
                  <p className="font-num text-sm text-ink">
                    {l.lost} z {l.of} <span className="text-quiet">({pct(l.lost, l.of)})</span>
                  </p>
                </div>
                <p className="mt-1 text-sm text-quiet">{l.hint}</p>
              </li>
            )
          })}
        </ul>
        {(a.medianIntroS !== null || a.callbacks > 0) && (
          <p className="mt-4 text-sm text-quiet">
            {a.medianIntroS !== null && (
              <>
                Agent představil nabídku v mediánu po <span className="font-num">{a.medianIntroS} s</span>
                {a.lateIntro > 0 && (
                  <>
                    , <span className="font-num">{a.lateIntro}×</span> až po 11 s a víc
                  </>
                )}
                .{' '}
              </>
            )}
            {a.callbacks > 0 && (
              <>
                Zavolat jindy chce <span className="font-num">{a.callbacks}</span> lidí.
              </>
            )}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {hungMax > 0 && (
          <Card>
            <CardHead title="Kdy lidé pokládají" hint="Jen hovory, kde zavěsil volaný." />
            <ul className="flex flex-col gap-3">
              {a.hangupBuckets.map((b) => (
                <li key={b.label} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
                  <span className="text-sm text-ink">{b.label}</span>
                  <Bar value={b.count} max={hungMax} />
                  <span className="text-right font-num text-sm text-ink">{b.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.criteria.length > 0 && (
          <Card>
            <CardHead title="Kde agent chyboval" hint="Kritéria hodnocení z ElevenLabs, která hovor nesplnil." />
            <ul className="flex flex-col gap-3">
              {a.criteria.map((c) => (
                <li key={c.name}>
                  <p className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="font-num text-ink">{c.failures}×</span>
                  </p>
                  {c.examples[0] && <p className="mt-0.5 text-xs text-quiet">{c.examples[0]}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.objections.length > 0 && (
          <Card>
            <CardHead title="Námitky a otázky" hint="Co lidé v hovoru říkali nejčastěji." />
            <ul className="flex flex-col gap-2">
              {a.objections.map((o) => (
                <li key={o.text} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{o.text}</span>
                  <span className="shrink-0 font-num text-ink">{o.count}×</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.segments.length > 1 && (
          <Card>
            <CardHead title="Podle oboru" hint="Vytočeno, zvedlo a souhlas." />
            <ul className="flex flex-col gap-2">
              {a.segments.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{s.name}</span>
                  <span className="shrink-0 font-num text-ink">
                    {s.dialed} · {s.picked} · {s.accepted}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.openings.length > 1 && (
          <Card>
            <CardHead title="Test úvodu" hint="Kolik lidí po zvednutí odpovědělo na úvod." />
            <ul className="flex flex-col gap-2">
              {a.openings.map((o) => (
                <li key={o.variant} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">Varianta {o.variant}</span>
                  <span className="font-num text-ink">
                    {o.answered} z {o.picked} ({pct(o.answered, o.picked)}), souhlas {o.accepted}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {trend.length > 1 && (
        <Card>
          <CardHead title="Den po dni" hint="Souhlas ze zvednutých hovorů." />
          <ul className="flex flex-col gap-2">
            {trend
              .slice()
              .reverse()
              .map((d) => (
                <li key={d.date} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm capitalize text-ink">{dayLabel(d.date)}</span>
                  <Bar value={d.accepted} max={Math.max(...trend.map((t) => t.connected), 1)} strong />
                  <span className="text-right font-num text-xs text-ink">
                    {d.accepted}/{d.connected} <span className="text-quiet">z {d.calls}</span>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card id="prompt">
        <CardHead
          title="Prompt pro Claude Code"
          hint="Složený z čísel a přepisů výše. Nic si nedomýšlí — rozbor a návrh oprav udělá Claude Code v repu autopilota."
        />
        <CopyPrompt prompt={prompt} />
      </Card>
    </div>
  )
}
