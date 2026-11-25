import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Card } from '@/components/admin/card'
import { ManualNoteForm } from '@/components/admin/meeting-notes/manual-note-form'
import { getPragueTodayISO } from '@/lib/prague-time'

export const dynamic = 'force-dynamic'

function pragueNowHm(): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date())
    .replace(/\s/g, '')
}

export default async function NovaSchuzkaPage() {
  await requireAdminPage()
  return (
    <PageShell width="default">
      <Link
        href="/dashboard/schuzky"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
        Schůzky
      </Link>
      <PageHeader title="Vložit přepis" subtitle="Pro schůzku, která nepřišla z Wispr Flow sama." subtitleFont="sans" />
      <Card>
        <ManualNoteForm today={getPragueTodayISO()} now={pragueNowHm()} />
      </Card>
    </PageShell>
  )
}
