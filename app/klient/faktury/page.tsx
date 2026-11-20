import type { Metadata } from 'next'
import { requireClient } from '@/lib/portal/context'
import { listClientProjects } from '@/lib/portal/projects'
import { loadClientMoney } from '@/lib/portal/money'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { ProjectMoney } from '@/components/portal/project-money'

export const metadata: Metadata = { title: 'Faktury' }

// Faktury přes všechny zakázky klienta (KP15). Zatím z toho, co prostor už
// umí (KP13); souhrn a filtr doplní KP16.
export default async function KlientFakturyPage() {
  const ctx = await requireClient()
  const projects = await listClientProjects(ctx.clientId)
  const money = await Promise.all(projects.map((p) => loadClientMoney(ctx.clientId, p.id)))
  const withMoney = projects.map((p, i) => ({ project: p, ...money[i] })).filter((x) => x.money || x.invoices.length > 0)

  return (
    <ClientShell ctx={ctx} section="faktury">
      <ClientPageHeader title="Faktury" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {withMoney.length === 0 ? (
            <p className="mt-6 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">Zatím tu žádná faktura není.</p>
          ) : (
            withMoney.map((x) => (
              <section key={x.project.id} className="mt-6" aria-label={x.project.name}>
                <h2 className="text-base font-semibold text-ink">{x.project.name}</h2>
                <ProjectMoney money={x.money} invoices={x.invoices} />
              </section>
            ))
          )}
        </div>
      </div>
    </ClientShell>
  )
}
