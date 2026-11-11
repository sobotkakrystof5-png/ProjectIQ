import Link from 'next/link'
import { listPortalClients } from '@/lib/portal/admin-queries'
import { CreateClientForm } from '@/components/admin/portal-client-forms'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Klientské prostory (KP05): firmy, které se přihlašují na /klient.
export default async function PortalClientsPage() {
  const { ready, clients } = await listPortalClients()
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Klientský prostor</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Klient se přihlásí na přehled svých zakázek. Vidí jen to, co schválíte.
        </p>
      </header>

      {!ready ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Klientský prostor ještě není v databázi nastaven (chybí migrace 095).
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Nový klient</h2>
            <CreateClientForm />
          </section>

          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím žádný klient. Založte prvního výše.</p>
          ) : (
            <ul className="space-y-2">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/klientsky-prostor/${c.id}`}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-navy-300"
                  >
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.members} členů · {c.projects} zakázek · od {formatDate(c.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
