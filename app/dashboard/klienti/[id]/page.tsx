import { notFound } from 'next/navigation'
import { getClientDetail } from '@/lib/ws/admin/clients'
import { ClientDetailView } from './detail-view'

// Detail účtu Workspace (S17). Admin layout ověřil NextAuth session.

export const dynamic = 'force-dynamic'

export default async function KlientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const client = await getClientDetail(params.id)
  if (!client) notFound()
  return <ClientDetailView client={client} />
}
