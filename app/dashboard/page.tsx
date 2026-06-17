import { cache } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen } from 'lucide-react'
import { sql } from '@/lib/db'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectCardSkeleton } from '@/components/ProjectCardSkeleton'
import { SummaryBar } from '@/components/SummaryBar'
import { DashboardFilters } from '@/components/DashboardFilters'
import { UpcomingConsultations, type UpcomingConsultation } from '@/components/UpcomingConsultations'
import type { Project } from '@/lib/types'
import { Suspense } from 'react'

interface PageProps {
  searchParams: { status?: string }
}

// Shared per-request cache — DB se zavolá jen jednou i přes dvě Suspense boundaries
const loadAllProjects = cache(async () => {
  const rows = await sql`SELECT * FROM projects ORDER BY created_at DESC`
  return rows as Project[]
})

async function ProjectGrid({ statusFilter }: { statusFilter?: string }) {
  const all = await loadAllProjects()
  const projects =
    statusFilter && statusFilter !== 'all'
      ? all.filter(p => p.status === statusFilter)
      : all

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
  const projects = await loadAllProjects()
  return <SummaryBar projects={projects} />
}

async function ConsultationsSection() {
  const rows = await sql`
    SELECT
      cs.id, cs.scheduled_at, cs.channel, cs.client_wish, cs.meeting_link,
      p.client_name, p.id as project_id, NULL AS source
    FROM consultation_slots cs
    JOIN projects p ON cs.project_id = p.id
    WHERE cs.scheduled_at > now()

    UNION ALL

    SELECT
      ce.id, ce.starts_at AS scheduled_at, 'other' AS channel,
      ce.description AS client_wish, NULL AS meeting_link,
      p.client_name, p.id as project_id, 'vizeon' AS source
    FROM calendar_events ce
    JOIN projects p ON ce.project_id = p.id
    WHERE ce.starts_at > now()
      AND ce.project_id IS NOT NULL

    ORDER BY scheduled_at
    LIMIT 20
  `
  return <UpcomingConsultations consultations={rows as UpcomingConsultation[]} />
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

      <Suspense fallback={null}>
        <ConsultationsSection />
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
