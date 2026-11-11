import { ProjectDetailView } from '@/components/admin/project-detail-view'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ zalozka?: string }>
}

// Detail zakázky VIZEON (KP02): záložky Přehled · Aktivita · Požadavky · Zprávy · Fakturace.
export default async function ProjectDetailPage(props: PageProps) {
  const [{ id }, { zalozka }] = await Promise.all([props.params, props.searchParams])
  return <ProjectDetailView projectId={id} tabParam={zalozka} />
}
