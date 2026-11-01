import type { Metadata } from 'next'
import Link from 'next/link'
import { requireClient } from '@/lib/portal/context'
import { listClientProjects } from '@/lib/portal/projects'
import { PortalFrame } from '@/components/portal/portal-frame'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Přehled' }

// Přehled klienta (KP06): stav, fáze a poslední aktivita každé zakázky na první obrazovce.
export default async function KlientPage() {
  const ctx = await requireClient()
  const projects = await listClientProjects(ctx.clientId)

  return (
    <PortalFrame clientName={ctx.clientName}>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Vaše projekty</h1>
      {projects.length === 0 ? (
        <div className="mt-6 rounded-box border border-navy-100 bg-surface p-6">
          <p className="font-medium text-ink">Zatím tu nic není.</p>
          <p className="mt-1 text-sm text-quiet">Jakmile na vašem projektu začneme pracovat, uvidíte ho tady.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/klient/projekt/${p.id}`}
                className="block rounded-box border border-navy-100 bg-surface p-5 transition-colors hover:border-navy-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-ink">{p.name}</span>
                  <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">{p.statusLabel}</span>
                </div>
                <div className="mt-3" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Postup projektu">
                  <div className="h-2 overflow-hidden rounded-full bg-navy-50">
                    <div className="h-full rounded-full bg-navy-700" style={{ width: `${p.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-quiet">Hotovo {p.progress} %{p.deadline ? ` · termín ${formatDate(p.deadline)}` : ''}</p>
                </div>
                {p.lastActivity && (
                  <p className="mt-3 text-sm text-ink">
                    <span className="text-quiet">Naposledy: </span>
                    {p.lastActivity.title}
                    <span className="text-quiet"> · {formatDate(p.lastActivity.publishedAt)}</span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PortalFrame>
  )
}
