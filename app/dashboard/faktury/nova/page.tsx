import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssueInvoiceForm } from '@/components/admin/invoices/issue-form'
import { getInvoiceProjectOptions, getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'
import { loadCorrectionSource, loadIssueDraft, type CorrectionSource, type IssueDraft } from '@/lib/admin/invoice-issue'
import { DEFAULT_DUE_DAYS, replacementNote } from '@/lib/admin/invoice-issue-schema'
import { getDraft, isDraftsReady } from '@/lib/admin/invoice-drafts'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import { requireAdminPage } from '@/lib/auth'
import { isInvoiceKind, kindItemDescription, type InvoiceKind } from '@/lib/admin/invoice-kinds'
import { isKindsReady, loadProjectBilling } from '@/lib/admin/project-billing'

/**
 * Vystavení faktury (AD12). Dřív fakturu vyrobil jiný nástroj a sem se jen
 * nahrálo PDF; tady vzniká rovnou — s číslem z vlastní řady, položkami,
 * QR kódem a PDF ke stažení.
 *
 * `?zakazka=<id>` předvyplní odběratele (i se sídlem z rejstříku, R-153)
 * a částku ze zakázky (cena mínus zaplacená záloha), takže odkaz jde dát
 * kamkoli k zakázce. Stejné údaje formulář dotáhne i po výběru zakázky.
 *
 * `?koncept=<id>` otevře koncept faktury (R-117) k úpravě. Formulář ho pak
 * jen ukládá; vystavuje se ve Fakturách › Ke schválení.
 *
 * `?druh=deposit|partial|final|single` předvybere druh faktury (R-143) —
 * tlačítka v detailu zakázky. Bez něj se druh vybírá ve formuláři, vždy.
 *
 * `?oprava=<id>` je oprava vystavené faktury (R-148): formulář se vyplní
 * jejími údaji a po vystavení nové se původní v témže příkazu stornuje.
 */

export const metadata = { title: 'Nová faktura' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewInvoicePage(props: {
  searchParams: Promise<{ zakazka?: string; koncept?: string; druh?: string; oprava?: string }>
}) {
  await requireAdminPage()
  const searchParams = await props.searchParams
  const correctionId = typeof searchParams.oprava === 'string' && UUID.test(searchParams.oprava) ? searchParams.oprava : null
  const projectId =
    correctionId === null && typeof searchParams.zakazka === 'string' && UUID.test(searchParams.zakazka) ? searchParams.zakazka : null
  const conceptId =
    correctionId === null && typeof searchParams.koncept === 'string' && UUID.test(searchParams.koncept) ? searchParams.koncept : null
  const wantedKind: InvoiceKind | null = isInvoiceKind(searchParams.druh) ? searchParams.druh : null

  const [{ profile, configured }, prefill, projects, draftsEnabled, kindsEnabled, concept, correction] = await Promise.all([
    getIssuerSettings(),
    loadIssueDraft(projectId, { registry: true }),
    getInvoiceProjectOptions(),
    isDraftsReady(),
    isKindsReady(),
    conceptId ? getDraft(conceptId) : Promise.resolve(null),
    correctionId ? loadCorrectionSource(correctionId) : Promise.resolve(null),
  ])

  if (correctionId && correction && !correction.ok) {
    const why = {
      missing: 'Tuhle fakturu tu nenajdu.',
      cancelled: 'Faktura je stornovaná, opravu už nejde vystavit.',
      paid: 'Faktura je zaplacená. Opravte ji stornem a novou fakturou.',
    }[correction.reason]
    return (
      <PageShell width="narrow">
        <PageHeader title="Oprava faktury" subtitle={why} subtitleFont="sans" />
        <Link
          href={correction.reason === 'missing' ? '/dashboard/faktury' : `/dashboard/faktury/${correctionId}`}
          className="text-sm font-medium text-navy-700 underline underline-offset-4"
        >
          {correction.reason === 'missing' ? 'Zpět na faktury' : 'Zpět na fakturu'}
        </Link>
      </PageShell>
    )
  }
  const source = correction?.ok ? correction.source : null
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

  const draft: IssueDraft = source
    ? fromCorrection(
        source,
        source.projectId ? await loadProjectBilling(source.projectId, source.id) : null,
        projectLabelOf(projects, source.projectId),
      )
    : editable
      ? fromConcept(editable, editable.projectId ? await loadProjectBilling(editable.projectId) : null)
      : prefill

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
        title={source ? `Oprava faktury ${source.number}` : editable ? 'Koncept faktury' : 'Nová faktura'}
        subtitle={
          source
            ? 'Údaje jsou z původní faktury. Opravte, co potřebujete, a vystavte.'
            : draft.projectLabel
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
        kindsEnabled={kindsEnabled}
        initial={
          source
            ? {
                currency: source.currency,
                note: replacementNote(source.note, source.number),
                kind: isInvoiceKind(source.kind) ? source.kind : null,
                percent: source.percent,
              }
            : editable
              ? { currency: editable.currency, note: editable.note, kind: editable.kind ?? null, percent: editable.percent ?? null }
              : { currency: 'CZK', note: '', kind: wantedKind }
        }
        replaces={source ? { id: source.id, number: source.number } : null}
      />
    </PageShell>
  )
}

/** Koncept ve tvaru, kterým se plní formulář: dnešek, splatnost za N dní. */
function fromConcept(concept: NonNullable<Awaited<ReturnType<typeof getDraft>>>, billing: IssueDraft['billing']): IssueDraft {
  const today = getPragueTodayISO()
  return {
    issuedOn: today,
    suppliedOn: concept.suppliedOn || today,
    dueOn: addIsoDays(today, concept.dueDays),
    counterparty: { ...concept.counterparty, phone: concept.counterparty.phone ?? '' },
    email: concept.email,
    amount: 0,
    projectId: concept.projectId,
    projectLabel: concept.projectLabel,
    items: concept.items,
    billing,
    sources: null,
  }
}

/**
 * Oprava ve tvaru formuláře (R-148): vystavuje se dnes, plnění zůstává
 * z původní faktury a splatnost taky, pokud ještě neuplynula.
 */
function fromCorrection(source: CorrectionSource, billing: IssueDraft['billing'], projectLabel: string | null): IssueDraft {
  const today = getPragueTodayISO()
  // Popis, který si formulář složil sám („Web — záloha 30 %"), se nepřebírá:
  // po změně procenta by na faktuře zůstalo staré číslo. Vlastní popis ano.
  const auto =
    isInvoiceKind(source.kind) && source.kind !== 'single'
      ? kindItemDescription(source.kind, billing?.description ?? '', source.percent)
      : null
  const items = auto !== null && source.items.length === 1 && source.items[0].description === auto ? [] : source.items
  return {
    issuedOn: today,
    suppliedOn: source.suppliedOn ?? today,
    dueOn: source.dueOn && source.dueOn >= today ? source.dueOn : addIsoDays(today, DEFAULT_DUE_DAYS),
    counterparty: source.counterparty,
    email: source.email,
    amount: 0,
    projectId: source.projectId,
    projectLabel,
    items,
    billing,
    sources: null,
  }
}

function projectLabelOf(
  projects: Awaited<ReturnType<typeof getInvoiceProjectOptions>>,
  projectId: string | null,
): string | null {
  const project = projectId ? projects.find(p => p.id === projectId) : undefined
  if (!project) return null
  return project.description ? `${project.client_name} — ${project.description}` : project.client_name
}
