import { getAllInvoices, getInvoiceProjectOptions } from '@/app/hub/finance/invoice-actions'
import { InvoiceRegistry } from '@/components/InvoiceRegistry'

/**
 * Evidence faktur. Záměrně ukazuje doklady napříč byznysy — VIZEON i ALTENO
 * fakturuje jedno IČO pod jedním přiznáním, takže rozdělený archiv by
 * znamenal, že by šlo fakturu hledat na špatném místě.
 */
export default async function FakturyPage() {
  const [invoices, projects] = await Promise.all([getAllInvoices(), getInvoiceProjectOptions()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Faktury</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Evidence všech vystavených faktur — klikni na fakturu pro kompletní údaje a PDF.
        </p>
      </div>

      <InvoiceRegistry invoices={invoices} projects={projects} />
    </div>
  )
}
