import type { Metadata } from 'next'
import { z } from 'zod'
import { requireClient } from '@/lib/portal/context'
import { listClientThreads } from '@/lib/portal/chat'
import { loadClientOverview } from '@/lib/portal/overview'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { ProjectConsultations } from '@/components/portal/consultations'

export const metadata: Metadata = { title: 'Konzultace' }

const isDone = (s: string) => s === 'done' || s === 'paid'

// Konzultace přes všechny zakázky klienta (KP15, KP16). Nahoře domluvené
// (s názvem zakázky, když jich je víc), rezervace v Kryštofově volnu (KP14)
// s výběrem zakázky. `?zakazka=` z panelu O zakázce ji rovnou předvybere.
export default async function KlientKonzultacePage({ searchParams }: { searchParams: Promise<{ zakazka?: string }> }) {
  const ctx = await requireClient()
  const threads = await listClientThreads(ctx.clientId).catch(() => [])
  const overview = await loadClientOverview(ctx.clientId, ctx.memberId, threads)
  const wanted = z.string().uuid().safeParse((await searchParams).zakazka)
  const ordered = [...overview.projects].sort((a, b) => Number(isDone(a.project.status)) - Number(isDone(b.project.status)))
  const preselected =
    (wanted.success ? ordered.find((p) => p.project.id === wanted.data) : undefined) ?? ordered[0] ?? null
  const upcoming = ordered
    .flatMap((p) => p.consultations.map((c) => ({ ...c, projectId: p.project.id, projectName: p.project.name })))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <ClientShell ctx={ctx} section="konzultace" threads={threads}>
      <ClientPageHeader title="Konzultace" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {!preselected ? (
            <p className="mt-6 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">
              Konzultaci si domluvíte, jakmile spolu začneme na zakázce pracovat.
            </p>
          ) : !overview.consultationsEnabled ? (
            <p className="mt-6 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">
              Konzultaci si zatím domluvte ve Zprávách. Rezervace tady brzy přibude.
            </p>
          ) : (
            <ProjectConsultations
              key={preselected.project.id}
              projectId={preselected.project.id}
              projects={ordered.map((p) => ({ id: p.project.id, name: p.project.name }))}
              today={getPragueTodayISO()}
              upcoming={upcoming}
              freeSlots={overview.freeSlots}
              title="Vaše konzultace"
            />
          )}
        </div>
      </div>
    </ClientShell>
  )
}
