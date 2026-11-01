import { ProjectDetailView } from '@/components/admin/project-detail-view'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ zalozka?: string }>
}

// Detail zakázky ALTENO (KP02): stejné záložky jako VIZEON, bez Fakturace.
export default async function AltenoProjectDetailPage(props: PageProps) {
  const [{ id }, { zalozka }] = await Promise.all([props.params, props.searchParams])
  return <ProjectDetailView projectId={id} expectedBusiness="alteno" tabParam={zalozka} />
}
