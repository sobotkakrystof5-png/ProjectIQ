import { cache, Suspense } from 'react'
import Link from 'next/link'
import { FolderOpen, Plus } from 'lucide-react'
import { sql } from '@/lib/db'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectCardSkeleton } from '@/components/ProjectCardSkeleton'
import { SummaryBar } from '@/components/SummaryBar'
import { DashboardFilters } from '@/components/DashboardFilters'
import { toBusiness, type Business } from '@/lib/business'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/types'

// Seznam zakázek VIZEON i ALTENO v jednom pohledu (KP02). Staré adresy
// /dashboard (dřív seznam VIZEON) a /alteno (seznam ALTENO) fungují dál.

interface PageProps {
  searchParams: Promise<{ status?: string; firma?: string }>
}

type Firm = 'all' | Business
const FIRMS: { value: Firm; label: string }[] = [
  { value: 'all', label: 'Obě firmy' },
  { value: 'vizeon', label: 'VIZEON' },
  { value: 'alteno', label: 'ALTENO' },
]

const loadProjects = cache(async () => {
  const rows = await sql`
    SELECT * FROM projects
    WHERE NOT (business = 'vizeon' AND is_vizeon_pending(source, vizeon_confirmed))
      AND NOT (business = 'alteno' AND is_alteno_pending(source, alteno_confirmed))
    ORDER BY created_at DESC
  `
  return rows as (Project & { business?: string })[]
})

/** Počet nevyřízených požadavků na zakázku; bez migrace 092 prázdná mapa. */
const loadOpenRequests = cache(async (): Promise<Record<string, number>> => {
  try {
    const rows = await sql`SELECT project_id, count(*)::int AS count FROM client_requests WHERE status = 'new' GROUP BY project_id`
    return Object.fromEntries((rows as { project_id: string; count: number }[]).map((r) => [r.project_id, r.count]))
  } catch {
    return {}
  }
})

function firmHref(firm: Firm, status?: string): string {
  const params = new URLSearchParams()
  if (firm !== 'all') params.set('firma', firm)
  if (status && status !== 'all') params.set('status', status)
  const qs = params.toString()
  return qs ? `/dashboard/zakazky?${qs}` : '/dashboard/zakazky'
}

async function ProjectGrid({ firm, status }: { firm: Firm; status?: string }) {
  const [all, requests] = await Promise.all([loadProjects(), loadOpenRequests()])
  const projects = all
    .filter((p) => firm === 'all' || toBusiness(p.business) === firm)
    .filter((p) => !status || status === 'all' || p.status === status)

  if (projects.length === 0) {
    const filtered = firm !== 'all' || (status && status !== 'all')
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-box bg-navy-50">
          <FolderOpen size={24} strokeWidth={1.5} className="text-navy-400" aria-hidden="true" />
        </div>
        <p className="mb-1 font-medium text-ink">{filtered ? 'Tady nic není' : 'Zatím žádné zakázky'}</p>
        <p className="max-w-xs text-sm text-quiet">
          {filtered ? 'Zkuste jiný filtr, nebo přidejte novou zakázku.' : 'Přidejte první zakázku a začněte sledovat projekty.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const business = toBusiness(p.business)
        const open = requests[p.id] ?? 0
        return (
          <div key={p.id} className="relative">
            <ProjectCard project={p} business={business} />
            {open > 0 && (
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-signal-ink">
                {open === 1 ? '1 požadavek' : `${open} požadavky`}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

async function SummarySection({ firm }: { firm: Firm }) {
  const all = await loadProjects()
  return <SummaryBar projects={all.filter((p) => firm === 'all' || toBusiness(p.business) === firm)} />
}

export default async function ProjectsPage(props: PageProps) {
  const { status, firma } = await props.searchParams
  const firm: Firm = firma === 'vizeon' || firma === 'alteno' ? firma : 'all'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zakázky</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">VIZEON i ALTENO na jednom místě</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/new"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-chip bg-navy-700 px-4 text-sm font-medium text-white hover:bg-navy-800"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nová zakázka VIZEON
          </Link>
          <Link
            href="/alteno/new"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-chip border border-navy-100 bg-surface px-4 text-sm font-medium text-ink hover:border-navy-300"
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            ALTENO
          </Link>
        </div>
      </div>

      <div role="group" aria-label="Firma" className="flex flex-wrap gap-1.5">
        {FIRMS.map((f) => (
          <Link
            key={f.value}
            href={firmHref(f.value, status)}
            aria-current={firm === f.value ? 'true' : undefined}
            className={cn(
              'inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium transition-colors',
              firm === f.value ? 'bg-navy-700 text-white' : 'bg-surface text-quiet ring-1 ring-navy-100 hover:text-ink',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Suspense fallback={<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-white" />)}</div>}>
        <SummarySection firm={firm} />
      </Suspense>

      <Suspense fallback={null}>
        <DashboardFilters />
      </Suspense>

      <Suspense fallback={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <ProjectCardSkeleton key={i} />)}</div>}>
        <ProjectGrid firm={firm} status={status} />
      </Suspense>
    </div>
  )
}
