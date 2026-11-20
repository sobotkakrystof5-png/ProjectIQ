import type { Metadata } from 'next'
import { requireClient } from '@/lib/portal/context'
import { listClientThreads } from '@/lib/portal/chat'
import { loadClientOverview } from '@/lib/portal/overview'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { OverviewProjectCard, WaitingCard } from '@/components/portal/overview'

export const metadata: Metadata = { title: 'Přehled' }

// Přehled klienta (KP16, R-121, R-123): nahoře co od klienta teď potřebujeme,
// pod tím karta každé zakázky. Rozpracované zakázky první, hotové pod nimi.
export default async function KlientPage() {
  const ctx = await requireClient()
  const threads = await listClientThreads(ctx.clientId).catch(() => [])
  const overview = await loadClientOverview(ctx.clientId, ctx.memberId, threads)
  const today = getPragueTodayISO()
  const isDone = (s: string) => s === 'done' || s === 'paid'
  const active = overview.projects.filter((p) => !isDone(p.project.status))
  const finished = overview.projects.filter((p) => isDone(p.project.status))

  return (
    <ClientShell ctx={ctx} section="prehled" threads={threads}>
      <ClientPageHeader title="Přehled" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {overview.projects.length === 0 ? (
            <section className="mt-6 rounded-box border border-navy-100 bg-surface p-6">
              <h2 className="text-lg font-semibold text-ink">Zatím tu žádná zakázka není.</h2>
              <p className="mt-1 text-sm text-quiet">
                Jakmile na vaší zakázce začneme pracovat, uvidíte ji tady. Hned potom mi můžete psát ve Zprávách.
              </p>
            </section>
          ) : (
            <>
              <div className="mt-6">
                <WaitingCard items={overview.waiting} />
              </div>
              {active.length > 0 && (
                <section className="mt-8" aria-labelledby="rozpracovane">
                  <h2 id="rozpracovane" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">
                    {active.length === 1 ? 'Vaše zakázka' : 'Vaše zakázky'}
                  </h2>
                  <ul className="space-y-3">
                    {active.map((p) => (
                      <OverviewProjectCard key={p.project.id} p={p} today={today} />
                    ))}
                  </ul>
                </section>
              )}
              {finished.length > 0 && (
                <section className="mt-8" aria-labelledby="hotove">
                  <h2 id="hotove" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">Hotové</h2>
                  <ul className="space-y-3">
                    {finished.map((p) => (
                      <OverviewProjectCard key={p.project.id} p={p} today={today} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </ClientShell>
  )
}
