import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssuerForm } from '@/components/admin/invoices/issuer-form'
import { getIssuerSettings } from '@/app/dashboard/finance/invoice-actions'

// Profil dodavatele (AD12): údaje, které se dosud opisovaly do každé faktury
// v cizím nástroji. Na doklad jdou jako snímek, takže změna tady se starších
// faktur nedotkne.

export const metadata = { title: 'Údaje dodavatele' }

export default async function IssuerSettingsPage() {
  const { profile, configured } = await getIssuerSettings()

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
    </PageShell>
  )
}
