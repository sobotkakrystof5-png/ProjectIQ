import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ProjectCard } from '@/components/ProjectCard'
import { SummaryBar } from '@/components/SummaryBar'
import { Pagination } from '@/components/admin/pagination'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav, Toolbar } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { loadProjectsScreen, PROJECT_SORT, SCOPE_STATUSES, scopeStatus, type ProjectScope } from '@/lib/admin/projects'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'
import { WEB_LEAD_ORIGINS, type LeadOrigin } from '@/lib/lead-origins'
import { STATUS_LABELS, type ProjectType } from '@/lib/types'

// Výpis zakázek pro obě obrazovky (R-109): `/dashboard/zakazky` ukazuje
// rozpracovanou práci, `/dashboard/zakazky/dokoncene` hotové a zaplacené
// zakázky. Filtry (`?typ=`, `?zdroj=`, `?status=`) mají obě stejné.

type SearchParams = Record<string, string | string[] | undefined>

const SCREENS: Record<
  ProjectScope,
  { path: string; title: string; subtitle: string; defaultSort: keyof typeof PROJECT_SORT; empty: { title: string; description: string } }
> = {
  active: {
    path: '/dashboard/zakazky',
    title: 'Zakázky',
    subtitle: 'Rozpracovaná práce. Hotové a zaplacené zakázky najdete v Dokončených.',
    defaultSort: 'pridano',
    empty: { title: 'Nic rozpracovaného', description: 'Přidejte novou zakázku, nebo se podívejte do Dokončených.' },
  },
  finished: {
    path: '/dashboard/zakazky/dokoncene',
    title: 'Dokončené',
    subtitle: 'Hotové a zaplacené zakázky, naposledy uzavřené nahoře.',
    defaultSort: 'uzavreno',
    empty: { title: 'Zatím nic dokončeného', description: 'Až zakázku uzavřete, objeví se tady.' },
  },
}

const NEW_PROJECT_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800'

function NewProjectLink() {
  return (
    <Link href="/dashboard/new" className={NEW_PROJECT_CLASS}>
      <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
      Nová zakázka
    </Link>
  )
}

export async function ProjectsList({ scope, searchParams }: { scope: ProjectScope; searchParams: SearchParams }) {
  const screenDef = SCREENS[scope]
  const PATH = screenDef.path
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

  const rawOrigin = one(searchParams.zdroj)
  const origin: LeadOrigin | null = WEB_LEAD_ORIGINS.some((o) => o.key === rawOrigin) ? (rawOrigin as LeadOrigin) : null
  const status = scopeStatus(scope, one(searchParams.status))
  const type: ProjectType = one(searchParams.typ) === 'personal' ? 'personal' : 'client'

  const params = parseTableParams(searchParams, {
    allowed: PROJECT_SORT,
    defaultSort: screenDef.defaultSort,
    pageSize: 24,
    tiebreak: 'created_at',
  })
  const screen = await loadProjectsScreen(scope, params, origin, status, type)
  const links = tableLinks(PATH, searchParams)
  const filtered = origin !== null || status !== null || type !== 'client'

  return (
    <PageShell width="wide">
      <PageHeader
        title={screenDef.title}
        subtitle={screenDef.subtitle}
        subtitleFont="sans"
        action={scope === 'active' ? <NewProjectLink /> : undefined}
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

      <SummaryBar projects={screen.summary} mode={scope} />

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
            ...SCOPE_STATUSES[scope].map((value) => ({
              key: value,
              label: STATUS_LABELS[value],
              href: tableHref(PATH, searchParams, { status: value, page: null }),
              active: status === value,
              count: screen.counts[value] ?? 0,
            })),
          ]}
        />
      </Toolbar>

      {screen.rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'Tady nic není' : screenDef.empty.title}
          description={filtered ? 'Zkuste jiný filtr.' : screenDef.empty.description}
          action={scope === 'active' ? <NewProjectLink /> : undefined}
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
