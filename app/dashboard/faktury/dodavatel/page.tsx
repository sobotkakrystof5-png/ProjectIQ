import { requireAdminPage } from '@/lib/auth'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssuerForm } from '@/components/admin/invoices/issuer-form'
import { InvoiceEmailTemplateForm } from '@/components/admin/invoices/email-template-form'
import { getInvoiceEmailTemplate, getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'

// Profil dodavatele (AD12): údaje, které se dosud opisovaly do každé faktury
// v cizím nástroji. Na doklad jdou jako snímek, takže změna tady se starších
// faktur nedotkne. Pod nimi je text e-mailu, kterým faktura odchází (R-139).

export const metadata = { title: 'Údaje dodavatele' }

export default async function IssuerSettingsPage() {
  await requireAdminPage()
  const [{ profile, configured }, { template }] = await Promise.all([getIssuerSettings(), getInvoiceEmailTemplate()])

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Údaje dodavatele"
        subtitle={
          configured
            ? 'Tyhle údaje se tisknou na každou vystavenou fakturu.'
            : 'Než vystavíte první fakturu, doplňte, kdo ji vystavuje.'
        }
        subtitleFont="sans"
        action={
          <Link href="/dashboard/faktury" className="text-sm text-quiet underline-offset-4 hover:text-ink hover:underline">
            Zpět na faktury
          </Link>
        }
      />
      <IssuerForm initial={profile} />

      <section className="mt-12 flex flex-col gap-5" aria-labelledby="email-faktury">
        <div>
          <h2 id="email-faktury" className="text-xl font-semibold text-ink">
            E-mail s fakturou
          </h2>
          <p className="mt-1 text-sm text-quiet">
            Tenhle text dostane klient k PDF — při „Poslat e-mailem“ i při „Schválit a poslat“.
          </p>
        </div>
        <InvoiceEmailTemplateForm initial={template} />
      </section>
    </PageShell>
  )
}
