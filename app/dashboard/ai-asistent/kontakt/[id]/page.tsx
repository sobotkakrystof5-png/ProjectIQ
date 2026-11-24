import { requireAdminPage } from '@/lib/auth'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { ContactDetailView } from '@/components/admin/ai-asistent/contact-detail'
import { AutoRefresh } from '@/components/admin/ai-asistent/auto-refresh'
import { loadContact } from '@/lib/admin/outreach-crm'
import { googleStatus } from '@/lib/admin/google/oauth'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'

// Detail klienta z Growth OS (R-120): ukázka, všechny hovory s přepisem,
// e-maily od asistenta a časová osa. Obnovuje se každých 30 s,
// ať hovor, který právě skončil, naskočí sám.

export default async function OutreachContactPage(props: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await props.params
  const [data, google] = await Promise.all([loadContact(id), googleStatus()])
  if (!data) notFound()

  const { lead } = data
  const subtitle = [lead.contactName, lead.industry, lead.city].filter(Boolean).join(' · ')

  return (
    <PageShell width="default" className="gap-6">
      <AutoRefresh seconds={30} />
      <Link
        href="/dashboard/ai-asistent?pohled=kontakty"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
      >
        <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        Kontakty od asistenta
      </Link>
      <PageHeader title={lead.company} subtitle={subtitle || undefined} subtitleFont="sans" />
      <ContactDetailView
        data={data}
        nowIso={new Date().toISOString()}
        meeting={{ google: google?.configured === true && google.connected, mail: vizeonMailConfigured() }}
      />
    </PageShell>
  )
}
