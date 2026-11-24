import { requireAdminPage } from '@/lib/auth'
import { ProjectsList } from '@/components/admin/projects-list'

// Dokončené zakázky (R-109): hotové a zaplacené, odděleně od rozpracované
// práce v /dashboard/zakazky. Dokončená = `closed_at` nebo stav hotovo/zaplaceno.

export default async function FinishedProjectsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdminPage()
  return <ProjectsList scope="finished" searchParams={await props.searchParams} />
}
