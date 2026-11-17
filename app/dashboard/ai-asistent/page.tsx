import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { OutreachQueue } from '@/components/admin/outreach-queue'
import { ReportDayDetail, ReportDaysList, dayLabel } from '@/components/admin/ai-asistent/reports-view'
import { AnalysisView } from '@/components/admin/ai-asistent/analysis-view'
import { countOutreachQueue, loadOutreachQueue } from '@/lib/admin/outreach'
import { loadAnalysisInput, loadReportDay, loadReportDays } from '@/lib/admin/outreach-reports'
import { analyze, buildImprovementPrompt } from '@/lib/admin/outreach-analysis'
import { googleStatus } from '@/lib/admin/google/oauth'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'
import { getPragueTodayISO } from '@/lib/prague-time'

// AI asistent (R-118): všechno z Growth OS na jednom místě.
//  - Kontakty: komu je na tahu Kryštof (souhlas s ukázkou, zavolat jindy…),
//    e-mail s ukázkou, termínem a Meetem jedním klikem (R-114).
//  - Reporty: den po dni, co robot nahovořil.
//  - Analýza: úspěšnost, kde hovory váznou a prompt pro Claude Code.
// Pohled, den i období jsou v adrese, takže přežijí reload i Zpět.

const PATH = '/dashboard/ai-asistent'
const PERIODS = [7, 30, 90] as const

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function href(params: Record<string, string | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${PATH}?${s}` : PATH
}

export default async function AiAssistantPage(props: { searchParams: Promise<Search> }) {
  const searchParams = await props.searchParams
  const view = one(searchParams.pohled) ?? 'kontakty'
  if (!['kontakty', 'reporty', 'analyza'].includes(view)) notFound()

  const den = one(searchParams.den)
  // Tvar i skutečné datum: „2026-13-45" by tvarem prošlo a Intl by na něm spadl.
  const reportDate =
    den &&
    /^\d{4}-\d{2}-\d{2}$/.test(den) &&
    !Number.isNaN(Date.parse(`${den}T12:00:00Z`)) &&
    new Date(`${den}T12:00:00Z`).toISOString().slice(0, 10) === den
      ? den
      : null
  const periodRaw = Number(one(searchParams.obdobi))
  const period = (PERIODS as readonly number[]).includes(periodRaw) ? periodRaw : 30

  const now = new Date()
  const [queueCount, queue, google, days, day, analysisInput] = await Promise.all([
    countOutreachQueue(),
    view === 'kontakty' ? loadOutreachQueue(now) : null,
    view === 'kontakty' ? googleStatus() : null,
    view === 'reporty' && !reportDate ? loadReportDays() : null,
    view === 'reporty' && reportDate ? loadReportDay(reportDate).catch(() => null) : null,
    view === 'analyza' ? loadAnalysisInput(period) : null,
  ])

  const tabs = [
    { key: 'kontakty', label: 'Kontakty', href: href({}), active: view === 'kontakty', count: queueCount ?? undefined },
    { key: 'reporty', label: 'Reporty', href: href({ pohled: 'reporty' }), active: view === 'reporty' },
    { key: 'analyza', label: 'Analýza', href: href({ pohled: 'analyza' }), active: view === 'analyza' },
  ]

  return (
    <PageShell width="default" className="gap-6">
      <PageHeader
        title="AI asistent"
        subtitle="Koho robot obvolal, kdo chce ukázku nebo hovor a jak se robotovi daří."
        subtitleFont="sans"
      />
      <PillNav label="Pohled" variant="segmented" items={tabs} />

      {view === 'kontakty' &&
        (queue?.available ? (
          <OutreachQueue
            rows={queue.rows}
            nowIso={now.toISOString()}
            meeting={{
              google: google?.configured === true && google.connected,
              mail: vizeonMailConfigured(),
            }}
          />
        ) : (
          <p className="text-sm text-quiet">Kontakty od robota se ukážou, až databáze dostane migraci 114.</p>
        ))}

      {view === 'reporty' && !reportDate && days && (
        days.available ? (
          <ReportDaysList days={days.days} hrefFor={(date) => href({ pohled: 'reporty', den: date })} />
        ) : (
          <p className="text-sm text-quiet">Reporty se ukážou, až databáze dostane migraci 116.</p>
        )
      )}

      {view === 'reporty' && reportDate && (
        <div className="flex flex-col gap-5">
          <Link
            href={href({ pohled: 'reporty' })}
            className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
          >
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Všechny dny
          </Link>
          <h2 className="text-xl font-semibold capitalize text-ink">{dayLabel(reportDate)}</h2>
          {day ? (
            <ReportDayDetail report={day} />
          ) : (
            <p className="text-sm text-quiet">Za tenhle den report není.</p>
          )}
        </div>
      )}

      {view === 'analyza' && analysisInput && (
        analysisInput.available ? (
          <AnalysisSection period={period} input={analysisInput} />
        ) : (
          <p className="text-sm text-quiet">Analýza se ukáže, až databáze dostane migraci 116.</p>
        )
      )}
    </PageShell>
  )
}

function AnalysisSection({
  period,
  input,
}: {
  period: number
  input: NonNullable<Awaited<ReturnType<typeof loadAnalysisInput>>>
}) {
  const analysis = analyze(input.calls)
  const to = getPragueTodayISO()
  const from = new Date(Date.parse(`${to}T12:00:00Z`) - (period - 1) * 86_400_000).toISOString().slice(0, 10)
  const prompt = buildImprovementPrompt(analysis, input.calls, { from, to, days: period })
  return (
    <div className="flex flex-col gap-5">
      <PillNav
        label="Období"
        items={PERIODS.map((p) => ({
          key: String(p),
          label: `${p} dní`,
          href: href({ pohled: 'analyza', obdobi: p === 30 ? null : String(p) }),
          active: p === period,
        }))}
      />
      <AnalysisView analysis={analysis} trend={input.trend} prompt={prompt} />
    </div>
  )
}
