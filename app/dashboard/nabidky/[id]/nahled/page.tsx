import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/lib/auth'
import { loadOfferPreview } from '@/lib/admin/offers/proposals'
import { loadOfferIssuer } from '@/lib/admin/offers/issuer'
import { OfferDocument } from '@/components/offers/offer-document'

export const metadata: Metadata = { title: 'Náhled nabídky' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Náhled nabídky tak, jak ji uvidí klient (i konceptu). Nic nezapisuje, tlačítka jsou vypnutá. */
export default async function OfferPreviewPage(props: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await props.params
  if (!UUID.test(id)) notFound()
  const [data, issuer] = await Promise.all([loadOfferPreview(id), loadOfferIssuer()])
  if (data === null) notFound()
  return <OfferDocument offer={data.offer} issuer={issuer} token={null} preview />
}
