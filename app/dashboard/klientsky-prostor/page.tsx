import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import Link from 'next/link'
import { listPortalClients } from '@/lib/portal/admin-queries'
import { CreateClientForm } from '@/components/admin/portal-client-forms'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Klientské prostory (KP05): firmy, které se přihlašují na /klient.
export default async function PortalClientsPage() {
  const { ready, clients } = await listPortalClients()
  return (
    <PageShell width="narrow">
      <PageHeader
        title="Klientský prostor"
        subtitle="Klient se přihlásí na přehled svých zakázek. Vidí jen to, co schválíte."
        subtitleFont="sans"
      />

      {!ready ? (
        <p className="rounded-chip border border-signal-line bg-signal-bg p-4 text-sm text-signal-ink">
          Klientský prostor ještě není v databázi nastaven (chybí migrace 095).
        </p>
      ) : (
        <>
          <section className="rounded-panel border border-navy-100 bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Nový klient</h2>
            <CreateClientForm />
          </section>

          {clients.length === 0 ? (
            <p className="text-sm text-quiet">Zatím žádný klient. Založte prvního výše.</p>
          ) : (
            <ul className="space-y-2">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/klientsky-prostor/${c.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-chip border border-navy-100 bg-surface px-4 py-3 hover:border-navy-300"
                  >
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="font-num text-xs text-quiet">
                      {c.members} členů · {c.projects} zakázek · od {formatDate(c.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageShell>
  )
}
