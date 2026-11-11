import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { getAllInvoices, getInvoiceProjectOptions } from '@/app/dashboard/finance/invoice-actions'
import { InvoiceRegistry } from '@/components/InvoiceRegistry'

/**
 * Evidence faktur. Záměrně ukazuje doklady ze všech zdrojů poptávek
 * fakturuje jedno IČO pod jedním přiznáním, takže rozdělený archiv by
 * znamenal, že by šlo fakturu hledat na špatném místě.
 */
export default async function FakturyPage() {
  const [invoices, projects] = await Promise.all([getAllInvoices(), getInvoiceProjectOptions()])

  return (
    <PageShell width="wide">
      <PageHeader
        title="Faktury"
        subtitle="Evidence všech faktur. Klikněte na fakturu pro údaje a PDF."
        subtitleFont="sans"
      />
      <InvoiceRegistry invoices={invoices} projects={projects} />
    </PageShell>
  )
}
