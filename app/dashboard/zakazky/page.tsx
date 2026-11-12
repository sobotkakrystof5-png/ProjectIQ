import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ProjectCard } from '@/components/ProjectCard'
import { SummaryBar } from '@/components/SummaryBar'
import { Pagination } from '@/components/admin/pagination'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav, Toolbar } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { CLOSED_FILTER, loadProjectsScreen, PROJECT_SORT } from '@/lib/admin/projects'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { WEB_LEAD_ORIGINS, type LeadOrigin } from '@/lib/lead-origins'
import { STATUS_LABELS, STATUS_ORDER, type ProjectType } from '@/lib/types'

// Seznam zakázek — jeden byznys, zakázky ze všech webů (AD02, R-088).
// Filtr „Zdroj" dřív přepínal firmu (VIZEON / ALTENO); dnes říká jen to,
// odkud poptávka přišla. Nepotvrzené poptávky tady nejsou, ty jsou
// v /dashboard/poptavky.
//
// Od AD07 filtruje a stránkuje databáze. Adresy filtrů se nemění
// (`?status=`, `?zdroj=`), takže uložené odkazy fungují dál.
//
// AD11 sem stáhlo Dokončené: `?status=uzavrene` je výpis uzavřených zakázek
// (stará adresa `/dashboard/dokoncene` sem přesměrovává) a `?typ=personal`
// ukáže vlastní projekty bez klienta, které dřív žily v druhé záložce
// Dokončených. Výchozí pohled je práce pro klienty.

const PATH = '/dashboard/zakazky'

export default async function ProjectsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

  const rawOrigin = one(searchParams.zdroj)
  const origin: LeadOrigin | null = WEB_LEAD_ORIGINS.some((o) => o.key === rawOrigin) ? (rawOrigin as LeadOrigin) : null
  const rawStatus = one(searchParams.status)
  const status =
    rawStatus === CLOSED_FILTER || STATUS_ORDER.includes(rawStatus as (typeof STATUS_ORDER)[number])
      ? (rawStatus as string)
      : null
  const type: ProjectType = one(searchParams.typ) === 'personal' ? 'personal' : 'client'

  const params = parseTableParams(searchParams, {
    allowed: PROJECT_SORT,
    defaultSort: 'pridano',
    pageSize: 24,
    tiebreak: 'created_at',
  })
  const screen = await loadProjectsScreen(params, origin, status, type)
  const links = tableLinks(PATH, searchParams)
  const filtered = origin !== null || status !== null || type !== 'client'

  return (
    <PageShell width="wide">
      <PageHeader
        title="Zakázky"
        subtitle="Všechna práce na jednom místě — od poptávky po uzavření."
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nová zakázka
          </Link>
        }
      />

      <PillNav
        label="Druh zakázky"
        items={[
          {
            key: 'client',
            label: 'Pro klienty',
            href: tableHref(PATH, searchParams, { typ: null, page: null }),
            active: type === 'client',
            count: screen.typeCounts.client,
          },
          {
            key: 'personal',
            label: 'Vlastní projekty',
            href: tableHref(PATH, searchParams, { typ: 'personal', page: null }),
            active: type === 'personal',
            count: screen.typeCounts.personal,
          },
        ]}
      />

      <PillNav
        label="Zdroj poptávky"
        items={[
          {
            key: 'all',
            label: 'Všechny zdroje',
            href: tableHref(PATH, searchParams, { zdroj: null, page: null }),
            active: origin === null,
          },
          ...WEB_LEAD_ORIGINS.map((o) => ({
            key: o.key,
            label: o.name,
            href: tableHref(PATH, searchParams, { zdroj: o.key, page: null }),
            active: origin === o.key,
          })),
        ]}
      />

      <SummaryBar projects={screen.summary} />

      <Toolbar>
        <PillNav
          label="Stav zakázky"
          items={[
            {
              key: 'all',
              label: 'Vše',
              href: tableHref(PATH, searchParams, { status: null, page: null }),
              active: status === null,
              count: screen.counts.all ?? 0,
            },
            ...STATUS_ORDER.map((value) => ({
              key: value,
              label: STATUS_LABELS[value],
              href: tableHref(PATH, searchParams, { status: value, page: null }),
              active: status === value,
              count: screen.counts[value] ?? 0,
            })),
            {
              key: CLOSED_FILTER,
              label: 'Uzavřené',
              href: tableHref(PATH, searchParams, { status: CLOSED_FILTER, page: null }),
              active: status === CLOSED_FILTER,
              count: screen.counts[CLOSED_FILTER] ?? 0,
            },
          ]}
        />
      </Toolbar>

      {screen.rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'Tady nic není' : 'Zatím žádné zakázky'}
          description={
            filtered
              ? 'Zkuste jiný filtr, nebo přidejte novou zakázku.'
              : 'Přidejte první zakázku a uvidíte, co se na ní děje.'
          }
          action={
            <Link
              href="/dashboard/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
            >
              <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
              Nová zakázka
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {screen.rows.map((project) => {
              const open = screen.openRequests[project.id] ?? 0
              return (
                <div key={project.id} className="relative">
                  <ProjectCard project={project} />
                  {open > 0 && (
                    <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-signal-ink">
                      {open === 1 ? '1 požadavek' : `${open} požadavky`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination params={params} total={screen.total} links={links} />
        </>
      )}
    </PageShell>
  )
}
