import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { publicToken } from '@/lib/public-token'
import { loadPublicOffer } from '@/lib/admin/offers/proposals'
import { loadOfferIssuer } from '@/lib/admin/offers/issuer'
import { OfferDocument } from '@/components/offers/offer-document'

/**
 * Nabídka pro klienta (navrhovač nabídek, N2, R-155). Bez přihlášení, přístup
 * jen přes odkaz s náhodným tokenem. Koncept (neodeslaná nabídka) je 404.
 * Vyhledávače sem nesmí (`X-Robots-Tag` v next.config.mjs i meta značka).
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nabídka webu',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function OfferPage(props: { params: Promise<{ token: string }> }) {
  const { token: raw } = await props.params
  const token = publicToken(raw)
  if (token === null) notFound()
  const [data, issuer] = await Promise.all([loadPublicOffer(token), loadOfferIssuer()])
  if (data === null) notFound()
  return <OfferDocument offer={data.offer} issuer={issuer} token={token} />
}
