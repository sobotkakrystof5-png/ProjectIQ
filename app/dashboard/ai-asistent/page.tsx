import { requireAdminPage } from '@/lib/auth'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { ReportDayDetail, ReportDaysList, dayLabel } from '@/components/admin/ai-asistent/reports-view'
import { AnalysisView } from '@/components/admin/ai-asistent/analysis-view'
import { OverviewView } from '@/components/admin/ai-asistent/overview-view'
import { ContactsView } from '@/components/admin/ai-asistent/contacts-view'
import { AutoRefresh } from '@/components/admin/ai-asistent/auto-refresh'
import { countOutreachQueue } from '@/lib/admin/outreach'
import { OVERVIEW_FUNNEL_DAYS, leadIdsByExternal, loadContacts, loadOverview } from '@/lib/admin/outreach-crm'
import { parseContactFilter } from '@/lib/admin/outreach-crm-view'
import { loadAnalysisInput, loadReportDay, loadReportDays } from '@/lib/admin/outreach-reports'
import { analyze, buildImprovementPrompt } from '@/lib/admin/outreach-analysis'
import { googleStatus } from '@/lib/admin/google/oauth'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'
import { getPragueTodayISO } from '@/lib/prague-time'

// AI asistent (R-118, R-120): všechno z Growth OS na jednom místě.
//  - Přehled: dnešek a týden, kdo je na tahu, cesta k zakázce, poslední
//    hovory a provoz (čerstvost dat, kredity Odoriku a ElevenLabs).
//  - Kontakty: fronta „Na tahu" s akcemi (R-112, R-114) a všechny firmy
//    s filtry a hledáním; klik vede na detail klienta.
//  - Reporty: den po dni, co robot nahovořil.
//  - Analýza: úspěšnost, kde hovory váznou a prompt pro Claude Code.
// Pohled, filtr, den i období jsou v adrese, takže přežijí reload i Zpět.
// Přehled a Kontakty se obnovují každých 30 s, dokud je karta vidět.

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
  await requireAdminPage()
  const searchParams = await props.searchParams
  const view = one(searchParams.pohled) ?? 'prehled'
  if (!['prehled', 'kontakty', 'reporty', 'analyza'].includes(view)) notFound()
  const filter = parseContactFilter(one(searchParams.filtr))
  const q = (one(searchParams.q) ?? '').trim().slice(0, 80)

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
  const [queueCount, overview, contacts, google, days, day, analysisInput] = await Promise.all([
    countOutreachQueue(),
    view === 'prehled' ? loadOverview(now) : null,
    view === 'kontakty' ? loadContacts(filter, q, now) : null,
    view === 'kontakty' ? googleStatus() : null,
    view === 'reporty' && !reportDate ? loadReportDays() : null,
    view === 'reporty' && reportDate ? loadReportDay(reportDate).catch(() => null) : null,
    view === 'analyza' ? loadAnalysisInput(period) : null,
  ])
  const leadHrefs = day
    ? new Map(
        [...(await leadIdsByExternal(day.calls.map((c) => c.leadId)))].map(([ext, id]) => [
          ext,
          `${PATH}/kontakt/${id}`,
        ]),
      )
    : undefined

  const tabs = [
    { key: 'prehled', label: 'Přehled', href: href({}), active: view === 'prehled' },
    {
      key: 'kontakty',
      label: 'Kontakty',
      href: href({ pohled: 'kontakty' }),
      active: view === 'kontakty',
      count: queueCount ?? undefined,
    },
    { key: 'reporty', label: 'Reporty', href: href({ pohled: 'reporty' }), active: view === 'reporty' },
    { key: 'analyza', label: 'Analýza', href: href({ pohled: 'analyza' }), active: view === 'analyza' },
  ]

  return (
    <PageShell width="default" className="gap-6">
      <PageHeader
        title="AI asistent"
        subtitle="Koho asistent obvolal, kdo chce ukázku nebo hovor a jak se mu daří."
        subtitleFont="sans"
      />
      <PillNav label="Pohled" variant="segmented" items={tabs} />

      {(view === 'prehled' || view === 'kontakty') && <AutoRefresh seconds={30} />}

      {view === 'prehled' &&
        overview &&
        (overview.available ? (
          <OverviewView data={overview} nowIso={now.toISOString()} funnelDays={OVERVIEW_FUNNEL_DAYS} />
        ) : (
          <p className="text-sm text-quiet">Přehled se ukáže, až databáze dostane migraci 114.</p>
        ))}

      {view === 'kontakty' &&
        contacts &&
        (contacts.available ? (
          <ContactsView
            data={contacts}
            filter={filter}
            q={q}
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
            <ReportDayDetail report={day} leadHrefs={leadHrefs} />
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
