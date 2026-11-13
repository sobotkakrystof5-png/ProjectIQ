import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssueInvoiceForm } from '@/components/admin/invoices/issue-form'
import { getInvoiceProjectOptions, getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'
import { loadIssueDraft } from '@/lib/admin/invoice-issue'
import { requireAuth } from '@/lib/auth'

/**
 * Vystavení faktury (AD12). Dřív fakturu vyrobil jiný nástroj a sem se jen
 * nahrálo PDF; tady vzniká rovnou — s číslem z vlastní řady, položkami,
 * QR kódem a PDF ke stažení.
 *
 * `?zakazka=<id>` předvyplní odběratele a částku ze zakázky (cena mínus
 * zaplacená záloha), takže odkaz jde dát kamkoli k zakázce.
 */

export const metadata = { title: 'Nová faktura' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewInvoicePage(props: { searchParams: Promise<{ zakazka?: string }> }) {
  await requireAuth()
  const searchParams = await props.searchParams
  const projectId = typeof searchParams.zakazka === 'string' && UUID.test(searchParams.zakazka) ? searchParams.zakazka : null

  const [{ profile, configured }, draft, projects] = await Promise.all([
    getIssuerSettings(),
    loadIssueDraft(projectId),
    getInvoiceProjectOptions(),
  ])

  if (!configured) {
    return (
      <PageShell width="narrow">
        <PageHeader title="Nová faktura" subtitle="Nejdřív potřebuju vědět, kdo fakturu vystavuje." subtitleFont="sans" />
        <div className="rounded-box border border-navy-100 bg-surface p-5">
          <p className="text-sm text-ink">
            Doplňte jméno, adresu a IČO dodavatele. Je to jednou a pak už se jen fakturuje.
          </p>
          <Link
            href="/dashboard/faktury/dodavatel"
            className="mt-4 inline-flex h-11 items-center rounded-chip bg-navy-700 px-5 text-[15px] font-medium text-white hover:bg-navy-800"
          >
            Vyplnit údaje dodavatele
          </Link>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell width="default">
      <PageHeader
        title="Nová faktura"
        subtitle={draft.projectLabel ? `Za zakázku ${draft.projectLabel}` : 'Číslo přidělím při vystavení.'}
        subtitleFont="sans"
        action={
          <Link href="/dashboard/faktury/dodavatel" className="text-sm text-quiet underline-offset-4 hover:text-ink hover:underline">
            Údaje dodavatele
          </Link>
        }
      />
      <IssueInvoiceForm draft={draft} projects={projects} vatPayer={profile.vatPayer} />
    </PageShell>
  )
}
