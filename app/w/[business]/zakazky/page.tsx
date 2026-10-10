import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { JobBoard } from '@/components/ws/app/jobs/job-board'
import { AccentHeading, EmptyState } from '@/components/ws/brand'
import { getJobBoard } from '@/lib/ws/calendar'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { hrefWith } from '@/lib/ws/detail-param'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'
import { navHref, navItemForSegment } from '@/lib/ws/nav'
import { formatClock, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { getEnabledModules } from '@/lib/ws/today'

export const metadata: Metadata = { title: 'Zakázky' }

type SearchParams = Record<string, string | string[] | undefined>

/**
 * Zakázky (S10): tabule podle vlastních stavů byznysu. Zakázka vzniká
 * potvrzením poptávky. Nastavení stavů je v S13, tady jen přesun.
 */
export default async function JobsPage({
  params,
  searchParams,
}: {
  params: { business: string }
  searchParams: SearchParams
}) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const modules = await getEnabledModules(ctx, business)
  if (!navItemForSegment('zakazky', modules)) notFound()

  const now = new Date()
  const today = pragueParts(now).date
  const pathname = navHref(business.slug, 'zakazky')
  const { stages, jobs } = await getJobBoard(ctx, business, now)
  const link = (patch: Record<string, string | null>) => hrefWith(pathname, searchParams, patch)

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AccentHeading accent="krok za krokem.">Zakázky</AccentHeading>

      {jobs.length === 0 ? (
        <EmptyState
          title="Zatím žádná zakázka"
          description="Zakázka vznikne sama, když potvrdíte poptávku. Pak ji tady posouváte mezi stavy."
        />
      ) : (
        <JobBoard
          slug={business.slug}
          invoices={modules.has('invoices')}
          stages={stages}
          jobs={jobs.map((j) => {
            const next = j.next_start ? pragueParts(j.next_start) : null
            return {
              id: j.id,
              stageId: j.stage_id,
              title: j.title,
              customer: j.customer_name,
              when: next ? `${formatRelativeDay(next.date, today)} ${formatClock(j.next_start!)}` : null,
              price: j.price !== null ? formatMoney(Number(j.price), { currency: j.currency as WsCurrency }) : null,
              href: link({ detail: j.customer_id ? `zakaznik:${j.customer_id}` : null }),
            }
          })}
        />
      )}

      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today} />
    </div>
  )
}
