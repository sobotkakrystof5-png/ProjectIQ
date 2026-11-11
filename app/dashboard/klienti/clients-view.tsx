import { Globe } from 'lucide-react'
import { DataTable, type AdminColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { BILLING_ACCESS_TONE, toneVariant } from '@/lib/admin-status'
import type { ClientList, ClientRow } from '@/lib/ws/admin/clients'
import type { TableLinks, TableParams } from '@/lib/admin-table'
import { InviteClientForm } from './invite-form'
import { ACCESS_LABEL, ago, plural } from './labels'

// Vykreslení /dashboard/klienti (S17) — bez načítání dat, aby šlo ukázat
// i s ukázkovými daty. Od AD07 jede na sdílené tabulce: řazení kliknutím
// do hlavičky, stránkování a prázdný stav jako jinde v adminu.

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-box border border-navy-100 bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-quiet">{label}</p>
      <p className="mt-0.5 font-num text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

const COLUMNS: AdminColumn<ClientRow>[] = [
  {
    key: 'ucet',
    header: 'Účet',
    sortable: true,
    mobile: 'title',
    cell: (client) => (
      <span className="block min-w-0">
        <span className="block truncate font-semibold text-ink">{client.name}</span>
        <span className="block text-xs text-quiet">
          {plural(client.businesses, 'byznys', 'byznysy', 'byznysů')} ·{' '}
          {client.members === 0 ? 'pozvánka čeká' : plural(client.members, 'člen', 'členové', 'členů')}
        </span>
      </span>
    ),
  },
  {
    key: 'obor',
    header: 'Obor',
    mobile: 'hidden',
    cell: (client) => <span className="block truncate text-quiet">{client.industries.join(', ') || '—'}</span>,
  },
  {
    key: 'predplatne',
    header: 'Předplatné',
    mobile: 'badge',
    cell: (client) => (
      <Badge variant={toneVariant(BILLING_ACCESS_TONE[client.access])}>{ACCESS_LABEL[client.access]}</Badge>
    ),
  },
  {
    key: 'aktivita',
    header: 'Aktivita',
    sortable: true,
    cell: (client) => <span className="text-quiet">{ago(client.lastActivity)}</span>,
  },
  {
    key: 'poptavky',
    header: 'Poptávky 30 dní',
    sortable: true,
    align: 'right',
    cell: (client) => <span className="font-num tabular-nums">{client.requests30d}</span>,
  },
  {
    key: 'web',
    header: 'Web',
    cell: (client) =>
      client.web === 'used' ? (
        <span className="inline-flex items-center gap-1 text-ink">
          <Globe size={13} strokeWidth={1.5} aria-hidden />
          posílá
        </span>
      ) : client.web === 'ready' ? (
        <span className="text-quiet">založeno</span>
      ) : (
        <span className="text-quiet/50">—</span>
      ),
  },
]

export function ClientsView({
  clients,
  total,
  byAccess,
  params,
  links,
  failed,
  industries,
}: {
  clients: ClientRow[]
  total: number
  byAccess: ClientList['byAccess']
  params: TableParams
  links: TableLinks
  failed: boolean
  industries: { key: string; label: string }[]
}) {
  // Čísla v hlavičce jsou přes všechny účty, ne jen přes otevřenou stránku.
  const count = (access: keyof ClientList['byAccess']) => byAccess[access] ?? 0

  return (
    <PageShell width="wide">
      <PageHeader
        title="Klienti"
        subtitle="Účty ZakazIQ Workspace: stav předplatného, aktivita a napojený web."
        subtitleFont="sans"
        action={<InviteClientForm industries={industries} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Účtů" value={total} />
        <Stat label="Platí" value={count('active')} />
        <Stat label="Zkušební doba" value={count('trialing')} />
        <Stat label="Neplatí" value={count('none') + count('read_only') + count('grace')} />
      </div>

      {failed ? (
        <div className="rounded-box border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          Data Workspace se nepodařilo načíst. Je aplikovaná migrace 083 a nastavená DATABASE_URL?
        </div>
      ) : (
        <DataTable
          rows={clients}
          columns={COLUMNS}
          rowKey={(client) => client.id}
          href={(client) => `/dashboard/klienti/${client.id}`}
          sort={{ params, links }}
          page={{ params, total, links }}
          empty={{
            title: 'Zatím žádný klient',
            description: 'Pozvěte prvního klienta tlačítkem nahoře, nebo počkejte na registraci z landing page.',
          }}
        />
      )}
    </PageShell>
  )
}
