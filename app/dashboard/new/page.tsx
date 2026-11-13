import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/ProjectForm'
import { loadProjectPrefill } from '@/lib/admin/memory/prefill'
import { requireAuth } from '@/lib/auth'

/**
 * Nová zakázka. S `?kontakt=<id>` se formulář předvyplní z historie klienta
 * (AD15): jméno a kontakt z karty, druh práce a cena z jeho poslední
 * zakázky. Všechno jde přepsat — je to nápověda, ne rozhodnutí.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewProjectPage(props: { searchParams: Promise<{ kontakt?: string }> }) {
  // Stránka od AD15 čte data klienta, ne jen prázdný formulář — přihlášení
  // se proto ověřuje i tady, ne jen v `proxy.ts`.
  await requireAuth()
  const searchParams = await props.searchParams
  const contactId = typeof searchParams.kontakt === 'string' && UUID.test(searchParams.kontakt)
    ? searchParams.kontakt
    : null
  const prefill = contactId === null ? null : await loadProjectPrefill(contactId)

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Nová zakázka"
        subtitle={
          prefill
            ? `Co víme z minula, je předvyplněné. ${prefill.clientName} — přepište, co nesedí.`
            : 'Vyplňte, co o zakázce víte. Zbytek jde doplnit později.'
        }
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/zakazky"
            className="inline-flex min-h-11 items-center gap-2 rounded-chip px-3 text-sm text-quiet transition-colors hover:bg-navy-50 hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Zpět na zakázky
          </Link>
        }
      />
      {prefill && prefill.lines.length > 0 && (
        <div className="rounded-box border border-navy-100 bg-navy-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-quiet">Co víme z historie</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
            {prefill.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-panel border border-navy-100 bg-surface p-6">
        <ProjectForm prefill={prefill ?? undefined} />
      </div>
    </PageShell>
  )
}
