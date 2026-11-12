import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { IssuerProfileForm } from '@/components/admin/invoices/issuer-profile-form'
import { requireAuth } from '@/lib/auth'
import { loadIssuerProfile } from '@/lib/admin/invoicing'

export default async function FakturacniUdajePage() {
  await requireAuth()
  const profile = await loadIssuerProfile()

  return (
    <PageShell width="narrow">
      <Link
        href="/dashboard/faktury"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        Zpět na faktury
      </Link>

      <PageHeader
        title="Fakturační údaje"
        subtitle="Takhle budete na každé vystavené faktuře. Už vystavené doklady se tím nezmění."
        subtitleFont="sans"
      />

      <IssuerProfileForm profile={profile} />
    </PageShell>
  )
}
