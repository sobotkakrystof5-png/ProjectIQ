import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { JobBoard } from '@/components/ws/app/jobs/job-board'
import { JobList } from '@/components/ws/app/jobs/job-list'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav, Toolbar } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'
import { getJobBoard } from '@/lib/ws/calendar'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith } from '@/lib/ws/detail-param'
import {
  countJobFilters,
  JOB_FILTERS,
  JOB_FILTER_LABELS,
  jobFactsFrom,
  jobFlags,
  matchesJobFilter,
  parseJobFilter,
  parseJobView,
} from '@/lib/ws/job-filters'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { navHref, navItemForSegment } from '@/lib/ws/nav'
import { plural } from '@/lib/ws/plural'
import { formatClock, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { getEnabledModules } from '@/lib/ws/today'

export const metadata: Metadata = { title: 'Zakázky' }

type SearchParams = Record<string, string | string[] | undefined>

/**
 * Zakázky (S10, RD06): tabule podle vlastních stavů, nebo seznam po stavech
 * (na telefonu výchozí). Filtry Čeká na mě / Po termínu / Bez termínu; pohled
 * i filtr jsou v adrese (`?pohled=`, `?filtr=`), takže jdou sdílet. Zakázka
 * vzniká potvrzením poptávky. Nastavení stavů je v S13, tady jen přesun.
 */
export default async function JobsPage(
  props: {
    params: Promise<{ business: string }>
    searchParams: Promise<SearchParams>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const modules = await getEnabledModules(ctx, business)
  if (!navItemForSegment('zakazky', modules)) notFound()

  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, 'zakazky')
  const { stages, jobs } = await getJobBoard(ctx, business, now)
  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)

  // Bez volby v adrese: telefon začíná seznamem (bez vodorovného posunu), počítač tabulí.
  const phone = /iPhone|Android.+Mobile|Mobi/i.test((await headers()).get('user-agent') ?? '')
  const view = parseJobView(searchParams.pohled, phone)
  const filter = parseJobFilter(searchParams.filtr)

  const facts = (j: (typeof jobs)[number]) => jobFactsFrom(j, stages)
  const counts = countJobFilters(jobs.map(facts), now)
  const open = jobs.filter((j) => jobFlags(facts(j), now).open).length
  const shown = jobs.filter((j) => matchesJobFilter(facts(j), filter, now))

  const boardJobs = shown.map((j) => {
    const next = j.next_start ? pragueParts(j.next_start) : null
    return {
      id: j.id,
      stageId: j.stage_id,
      title: j.title,
      customer: j.customer_name,
      when: next ? `${formatRelativeDay(next.date, today)} ${formatClock(j.next_start!)}` : null,
      price: j.price !== null ? formatMoney(Number(j.price), { currency: j.currency as WsCurrency }) : null,
      href: link({ detail: `zakazka:${j.id}` }),
      overdue: jobFlags(facts(j), now).overdue,
    }
  })

  return (
    <PageShell width="wide">
      <PageHeader
        title="Zakázky"
        accent="krok za krokem."
        subtitle={jobs.length > 0 ? `${plural(open, ['otevřená', 'otevřené', 'otevřených'])} · ${plural(jobs.length - open, ['uzavřená', 'uzavřené', 'uzavřených'])} za 30 dní` : undefined}
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="Zatím žádná zakázka"
          description="Zakázka vznikne sama, když potvrdíte poptávku. Pak ji tady posouváte mezi stavy."
        />
      ) : (
        <>
          <Toolbar>
            <PillNav
              label="Pohled"
              variant="segmented"
              items={(['tabule', 'seznam'] as const).map((v) => ({
                key: v,
                label: v === 'tabule' ? 'Tabule' : 'Seznam',
                href: link({ pohled: v, detail: null }),
                active: v === view,
              }))}
            />
            <PillNav
              label="Filtr zakázek"
              items={JOB_FILTERS.map((f) => ({
                key: f,
                label: JOB_FILTER_LABELS[f],
                href: link({ filtr: f === 'vse' ? null : f, detail: null }),
                active: f === filter,
                count: counts[f],
              }))}
            />
          </Toolbar>

          {shown.length === 0 ? (
            <EmptyState
              size="compact"
              title="Nic takového tu není"
              description={
                filter === 'ceka'
                  ? 'Žádná zakázka na vás nečeká. Nové zakázky se objeví tady.'
                  : filter === 'po-terminu'
                    ? 'Žádná zakázka není po termínu.'
                    : 'Každá zakázka má termín.'
              }
              action={
                <Link href={link({ filtr: null, detail: null })} scroll={false} className={buttonVariants({ variant: 'outline' })}>
                  Ukázat všechny zakázky
                </Link>
              }
            />
          ) : view === 'tabule' ? (
            <JobBoard slug={business.slug} invoices={modules.has('invoices')} stages={stages} jobs={boardJobs} />
          ) : (
            <JobList slug={business.slug} invoices={modules.has('invoices')} stages={stages} jobs={boardJobs} />
          )}
        </>
      )}

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </PageShell>
  )
}
