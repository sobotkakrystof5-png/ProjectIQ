import Link from 'next/link'
import { Plus, FolderOpen } from 'lucide-react'
import { sql } from '@/lib/db'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectCardSkeleton } from '@/components/ProjectCardSkeleton'
import { SummaryBar } from '@/components/SummaryBar'
import { DashboardFilters } from '@/components/DashboardFilters'
import type { Project } from '@/lib/types'
import { Suspense } from 'react'

interface PageProps {
  searchParams: { status?: string }
}

async function ProjectGrid({ statusFilter }: { statusFilter?: string }) {
  const rows =
    statusFilter && statusFilter !== 'all'
      ? await sql`SELECT * FROM projects WHERE status = ${statusFilter} ORDER BY created_at DESC`
      : await sql`SELECT * FROM projects ORDER BY created_at DESC`

  const projects = rows as Project[]

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <FolderOpen size={24} strokeWidth={1.5} className="text-brand-400" />
        </div>
        <p className="font-medium text-foreground mb-1">
          {statusFilter && statusFilter !== 'all' ? 'Žádné zakázky s tímto stavem' : 'Zatím žádné zakázky'}
        </p>
        <p className="text-sm text-muted-foreground max-w-xs">
          {statusFilter && statusFilter !== 'all'
            ? 'Zkus jiný filtr nebo přidej novou zakázku'
            : 'Přidej svoji první zakázku a začni sledovat projekty'}
        </p>
        {(!statusFilter || statusFilter === 'all') && (
          <Link
            href="/dashboard/new"
            className="mt-5 inline-flex items-center gap-2 brand-gradient text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={15} strokeWidth={2} />
            Přidat první zakázku
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(p => <ProjectCard key={p.id} project={p} />)}
    </div>
  )
}

async function SummarySection() {
  const rows = await sql`SELECT * FROM projects`
  return <SummaryBar projects={rows as Project[]} />
}

export default function DashboardPage({ searchParams }: PageProps) {
  const statusFilter = searchParams.status

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Zakázky</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Přehled tvých projektů</p>
        </div>
        <Link
          href="/dashboard/new"
          className="flex items-center gap-2 brand-gradient text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={15} strokeWidth={2} />
          Nová zakázka
        </Link>
      </div>

      <Suspense fallback={
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map(i => <div key={i} className="bg-white border border-border rounded-xl p-4 h-24 animate-pulse" />)}
        </div>
      }>
        <SummarySection />
      </Suspense>

      <Suspense fallback={<div className="flex gap-1.5">{[0,1,2,3,4,5].map(i => <div key={i} className="h-7 w-20 bg-muted rounded-full animate-pulse" />)}</div>}>
        <DashboardFilters />
      </Suspense>

      <Suspense fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0,1,2,3,4,5].map(i => <ProjectCardSkeleton key={i} />)}
        </div>
      }>
        <ProjectGrid statusFilter={statusFilter} />
      </Suspense>
    </div>
  )
}
