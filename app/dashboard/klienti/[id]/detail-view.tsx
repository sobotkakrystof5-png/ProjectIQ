import Link from 'next/link'
import { ChevronLeft, ExternalLink, Globe } from 'lucide-react'
import type { ClientDetail } from '@/lib/ws/admin/clients'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { BILLING_ACCESS_TONE, toneVariant } from '@/lib/admin-status'
import { ACCESS_LABEL, AUDIT_LABEL, ago, formatDate, formatDateTime } from '../labels'
import { ResendInviteForm, WebKeysPanel } from './panels'
import { ContactActions } from '@/components/admin/contact-actions'

// Vykreslení detailu účtu Workspace (S17) — bez načítání dat.

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-border rounded-2xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-[12px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  )
}

export function ClientDetailView({ client }: { client: ClientDetail }) {
  return (
    <PageShell width="wide">
      <Link href="/dashboard/klienti" className="inline-flex items-center gap-1 text-sm text-quiet hover:text-ink">
        <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        Klienti
      </Link>

      <PageHeader
        title={client.name}
        subtitle={
          <>
            Účet od {formatDate(client.createdAt)}
            {client.ico ? ` · IČO ${client.ico}` : ''} · {client.clerkOrgId}
          </>
        }
        action={
          <Badge variant={toneVariant(BILLING_ACCESS_TONE[client.access])}>
            {ACCESS_LABEL[client.access]}
            {client.periodEnd && (client.access === 'trialing' || client.access === 'active')
              ? ` · ${client.cancelAtPeriodEnd ? 'končí' : 'další platba'} ${formatDate(client.periodEnd)}`
              : ''}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Fact label="Poptávky 30 dní" value={client.requests30d} />
        <Fact label="Poslední aktivita" value={ago(client.lastActivity)} />
        <Fact label="Členové" value={client.members === 0 ? 'pozvánka čeká' : client.members} />
        <Fact label="Novinky e-mailem" value={client.newsEmails ? 'ano' : 'vypnuté'} />
      </div>

      <Section title="Byznysy" hint="Klíče a prompt: stejné jako Nastavení › Napojený web u klienta. Nový tajný klíč zneplatní starý.">
        <ul className="divide-y divide-border">
          {client.businessesList.map((b) => (
            <li key={b.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {b.name}
                    {b.archived && <span className="ml-2 text-[11px] font-medium text-muted-foreground">archivovaný</span>}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {b.industry} · <span className="font-mono">{b.slug}</span> ·{' '}
                    {b.webUsedAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Globe size={12} strokeWidth={1.5} />
                        web poslal poptávku {ago(b.webUsedAt)}
                      </span>
                    ) : b.webReady ? (
                      'napojení založené, web zatím nic neposlal'
                    ) : (
                      'web nenapojený'
                    )}
                  </p>
                </div>
                <a
                  href={`/r/${b.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-navy-700 hover:underline"
                >
                  Objednávací stránka
                  <ExternalLink size={12} strokeWidth={1.5} />
                </a>
              </div>
              {!b.archived && <WebKeysPanel accountId={client.id} businessId={b.id} hasSecret={b.hasSecret} />}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Členové" hint={client.members === 0 ? 'Nikdo se zatím nepřihlásil. Pozvánku jde poslat znovu.' : undefined}>
        {client.membersList.length > 0 && (
          <ul className="space-y-1.5">
            {client.membersList.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {m.name ?? m.email ?? 'bez jména'}
                  {m.name && m.email && <span className="text-muted-foreground"> · {m.email}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {/* Napsat klientovi jedním klikem (AD10). Telefon na členy
                      Workspace nemáme — ten zůstává jen u klientů adminu. */}
                  <ContactActions variant="compact" email={m.email} />
                  <span className="text-[11px] text-muted-foreground shrink-0">{m.role === 'owner' ? 'vlastník' : 'pracovník'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <ResendInviteForm accountId={client.id} />
      </Section>

      <Section title="Historie" hint="Posledních 30 záznamů z auditu účtu.">
        {client.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím nic.</p>
        ) : (
          <ul className="space-y-1.5">
            {client.audit.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>{AUDIT_LABEL[a.action] ?? a.action}</span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {formatDateTime(a.at)} · {a.actor === 'admin' || a.actor.startsWith('admin:') ? 'admin' : 'klient'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  )
}
