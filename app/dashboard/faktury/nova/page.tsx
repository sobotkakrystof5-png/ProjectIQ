import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssueInvoiceForm } from '@/components/admin/invoices/issue-form'
import { requireAuth } from '@/lib/auth'
import { loadIssueOptions } from '@/lib/admin/invoicing'
import { getPragueTodayISO } from '@/lib/prague-time'

/**
 * Vystavení faktury. Zakázku jde předat v adrese (`?zakazka=<id>`), takže
 * z detailu zakázky je faktura na jeden klik.
 */
export default async function NovaFakturaPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuth()
  const searchParams = await props.searchParams
  const raw = Array.isArray(searchParams.zakazka) ? searchParams.zakazka[0] : searchParams.zakazka
  const options = await loadIssueOptions()
  const presetProjectId = options.projects.some((project) => project.id === raw) ? (raw as string) : null

  return (
    <PageShell width="default">
      <Link
        href="/dashboard/faktury"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        Zpět na faktury
      </Link>

      <PageHeader
        title="Vystavit fakturu"
        subtitle="Číslo, datum i splatnost doplníme za vás."
        subtitleFont="sans"
        action={
          <Link href="/dashboard/faktury/nastaveni" className="min-h-11 px-3 py-3 text-sm text-quiet transition-colors hover:text-ink">
            Fakturační údaje
          </Link>
        }
      />

      {/* Pražský den, ne UTC: mezi 23:00 a půlnocí by se faktura vystavila na zítřek. */}
      <IssueInvoiceForm options={options} today={getPragueTodayISO()} presetProjectId={presetProjectId} />
    </PageShell>
  )
}
