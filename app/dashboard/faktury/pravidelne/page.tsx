import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { RecurringManager } from '@/components/admin/invoices/recurring-manager'
import { getInvoiceProjectOptions, getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'
import { isDraftsReady, listRecurring } from '@/lib/admin/invoice-drafts'
import { requireAuth } from '@/lib/auth'

/**
 * Pravidelné faktury (R-117). Jednou za měsíc z nich denní cron připraví
 * koncept do Faktur › Ke schválení; odeslání zůstává na vás.
 */

export const metadata = { title: 'Pravidelné faktury' }

export default async function RecurringInvoicesPage() {
  await requireAuth()
  const [ready, recurring, projects, { profile }] = await Promise.all([
    isDraftsReady(),
    listRecurring(),
    getInvoiceProjectOptions(),
    getIssuerSettings(),
  ])

  return (
    <PageShell width="default">
      <PageHeader
        title="Pravidelné faktury"
        subtitle="Každý měsíc připravím koncept a počkám, až ho schválíte."
        subtitleFont="sans"
        action={
          <Link href="/dashboard/faktury" className="text-sm text-quiet underline-offset-4 hover:text-ink hover:underline">
            Zpět na faktury
          </Link>
        }
      />
      {ready ? (
        <RecurringManager recurring={recurring} projects={projects} vatPayer={profile.vatPayer} />
      ) : (
        <p className="text-sm text-ink">Pravidelné faktury se zapnou, až proběhne aktualizace databáze (migrace 117).</p>
      )}
    </PageShell>
  )
}
