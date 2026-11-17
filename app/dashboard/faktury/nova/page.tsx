import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssueInvoiceForm } from '@/components/admin/invoices/issue-form'
import { getInvoiceProjectOptions, getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'
import { loadIssueDraft, type IssueDraft } from '@/lib/admin/invoice-issue'
import { getDraft, isDraftsReady } from '@/lib/admin/invoice-drafts'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import { requireAuth } from '@/lib/auth'

/**
 * Vystavení faktury (AD12). Dřív fakturu vyrobil jiný nástroj a sem se jen
 * nahrálo PDF; tady vzniká rovnou — s číslem z vlastní řady, položkami,
 * QR kódem a PDF ke stažení.
 *
 * `?zakazka=<id>` předvyplní odběratele a částku ze zakázky (cena mínus
 * zaplacená záloha), takže odkaz jde dát kamkoli k zakázce.
 *
 * `?koncept=<id>` otevře koncept faktury (R-117) k úpravě. Formulář ho pak
 * jen ukládá; vystavuje se ve Fakturách › Ke schválení.
 */

export const metadata = { title: 'Nová faktura' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewInvoicePage(props: { searchParams: Promise<{ zakazka?: string; koncept?: string }> }) {
  await requireAuth()
  const searchParams = await props.searchParams
  const projectId = typeof searchParams.zakazka === 'string' && UUID.test(searchParams.zakazka) ? searchParams.zakazka : null
  const conceptId = typeof searchParams.koncept === 'string' && UUID.test(searchParams.koncept) ? searchParams.koncept : null

  const [{ profile, configured }, prefill, projects, draftsEnabled, concept] = await Promise.all([
    getIssuerSettings(),
    loadIssueDraft(projectId),
    getInvoiceProjectOptions(),
    isDraftsReady(),
    conceptId ? getDraft(conceptId) : Promise.resolve(null),
  ])
  // Koncept, který mezitím někdo vystavil nebo zahodil, se už neupravuje.
  const editable = concept && concept.status === 'draft' ? concept : null
  if (conceptId && !editable) {
    return (
      <PageShell width="narrow">
        <PageHeader title="Koncept faktury" subtitle="Tenhle koncept už je vystavený nebo zahozený." subtitleFont="sans" />
        <Link href="/dashboard/faktury" className="text-sm font-medium text-navy-700 underline underline-offset-4">
          Zpět na faktury
        </Link>
      </PageShell>
    )
  }

  const draft: IssueDraft = editable ? fromConcept(editable) : prefill

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
        title={editable ? 'Koncept faktury' : 'Nová faktura'}
        subtitle={
          draft.projectLabel
            ? `Za zakázku ${draft.projectLabel}`
            : editable
              ? 'Číslo dostane, až ji schválíte a pošlete.'
              : 'Číslo přidělím při vystavení.'
        }
        subtitleFont="sans"
        action={
          <Link href="/dashboard/faktury/dodavatel" className="text-sm text-quiet underline-offset-4 hover:text-ink hover:underline">
            Údaje dodavatele
          </Link>
        }
      />
      <IssueInvoiceForm
        draft={draft}
        projects={projects}
        vatPayer={profile.vatPayer}
        draftId={editable?.id ?? null}
        draftsEnabled={draftsEnabled}
        initial={editable ? { currency: editable.currency, note: editable.note } : undefined}
      />
    </PageShell>
  )
}

/** Koncept ve tvaru, kterým se plní formulář: dnešek, splatnost za N dní. */
function fromConcept(concept: NonNullable<Awaited<ReturnType<typeof getDraft>>>): IssueDraft {
  const today = getPragueTodayISO()
  return {
    issuedOn: today,
    suppliedOn: concept.suppliedOn || today,
    dueOn: addIsoDays(today, concept.dueDays),
    counterparty: concept.counterparty,
    email: concept.email,
    amount: 0,
    projectId: concept.projectId,
    projectLabel: concept.projectLabel,
    items: concept.items,
  }
}
