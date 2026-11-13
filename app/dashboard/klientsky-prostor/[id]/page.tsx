import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { loadPortalClient } from '@/lib/portal/admin-queries'
import { isInviteConfigured } from '@/lib/portal/invite'
import { LEAD_ORIGINS, toLeadOrigin } from '@/lib/lead-origins'
import {
  InviteForm,
  LinkProjectForm,
  RemoveMemberButton,
  RevokeInviteButton,
  UnlinkButton,
} from '@/components/admin/portal-client-forms'
import { formatDate, formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const STATE_LABELS = { open: 'Čeká', used: 'Použitá', revoked: 'Zrušená', expired: 'Prošlá' } as const
const card = 'rounded-box border border-navy-100 bg-surface p-5'

export default async function PortalClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const detail = await loadPortalClient(id).catch(() => null)
  if (!detail) notFound()

  return (
    <PageShell width="narrow">
      <PageHeader
        title={detail.client.name}
        action={
          <Link
            href="/dashboard/klientsky-prostor"
            className="inline-flex min-h-11 items-center gap-2 rounded-chip px-3 text-sm text-quiet transition-colors hover:bg-navy-50 hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Zpět na klienty
          </Link>
        }
      />

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Zakázky v prostoru klienta</h2>
        {detail.projects.length === 0 ? (
          <p className="mb-3 text-sm text-quiet">Zatím žádná. Klient po přihlášení uvidí jen zakázky, které sem propojíte.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {detail.projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <UnlinkButton clientId={detail.client.id} projectId={p.id} />
              </li>
            ))}
          </ul>
        )}
        <LinkProjectForm
          clientId={detail.client.id}
          options={detail.unlinked.map((p) => ({ id: p.id, label: `${p.client_name} (${LEAD_ORIGINS[toLeadOrigin(p.lead_origin)].label})` }))}
        />
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Členové</h2>
        {detail.members.length === 0 ? (
          <p className="text-sm text-quiet">Nikdo se zatím nepřihlásil. Pošlete pozvánku níže.</p>
        ) : (
          <ul className="space-y-2">
            {detail.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{m.name ?? m.email ?? 'Bez jména'}</span>
                  <span className="block truncate text-xs text-quiet">
                    {m.email} · {m.role === 'owner' ? 'Vlastník' : 'Člen'} · od {formatDate(m.created_at)}
                  </span>
                </span>
                <RemoveMemberButton clientId={detail.client.id} memberId={m.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Pozvánky</h2>
        {!isInviteConfigured() && (
          <p className="mb-3 rounded-chip bg-signal-bg px-3 py-2 text-xs text-signal-ink">
            Chybí nastavení PORTAL_INVITE_PEPPER, pozvánku zatím nejde vytvořit.
          </p>
        )}
        <InviteForm clientId={detail.client.id} />
        {detail.invites.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-navy-100 pt-4">
            {detail.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{i.email ?? 'Bez vazby na e-mail'}</span>
                  <span className="block text-xs text-quiet">
                    {STATE_LABELS[i.state]} · platí do {formatDateTime(i.expires_at)}
                  </span>
                </span>
                {i.state === 'open' && <RevokeInviteButton clientId={detail.client.id} inviteId={i.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
