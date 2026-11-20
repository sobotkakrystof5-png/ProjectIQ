import type { Metadata } from 'next'
import { requireClient } from '@/lib/portal/context'
import { listClientProjects } from '@/lib/portal/projects'
import { loadClientConsultations } from '@/lib/portal/consultations'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { ProjectConsultations } from '@/components/portal/consultations'

export const metadata: Metadata = { title: 'Konzultace' }

// Konzultace přes všechny zakázky klienta (KP15) — u každé zakázky jde
// domluvit novou v Kryštofově volnu (KP14).
export default async function KlientKonzultacePage() {
  const ctx = await requireClient()
  const projects = await listClientProjects(ctx.clientId)
  const all = await Promise.all(projects.map((p) => loadClientConsultations(ctx.clientId, p.id)))
  const today = getPragueTodayISO()

  return (
    <ClientShell ctx={ctx} section="konzultace">
      <ClientPageHeader title="Konzultace" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {projects.length === 0 && (
            <p className="mt-6 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">Zatím tu žádná zakázka není.</p>
          )}
          {projects.map((p, i) =>
            all[i].enabled ? (
              <div key={p.id} className="mt-6">
                <h2 className="text-base font-semibold text-ink">{p.name}</h2>
                <ProjectConsultations projectId={p.id} today={today} upcoming={all[i].upcoming} freeSlots={all[i].freeSlots} />
              </div>
            ) : null,
          )}
        </div>
      </div>
    </ClientShell>
  )
}
