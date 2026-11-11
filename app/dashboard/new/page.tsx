import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/ProjectForm'

export default function NewProjectPage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        title="Nová zakázka"
        subtitle="Vyplňte, co o zakázce víte. Zbytek jde doplnit později."
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/zakazky"
            className="inline-flex min-h-11 items-center gap-2 rounded-chip px-3 text-sm text-quiet transition-colors hover:bg-navy-50 hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Zpět na zakázky
          </Link>
        }
      />
      <div className="rounded-panel border border-navy-100 bg-surface p-6">
        <ProjectForm />
      </div>
    </PageShell>
  )
}
