import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { PROPOSAL_STATUS_LABEL } from '@/lib/admin/offers/proposal-model'
import type { SimilarOffer } from '@/lib/admin/offers/similar'
import { OFFER_STATUS_TONE, toneVariant } from '@/lib/admin-status'

/**
 * Podobné nabídky u konceptu (navrhovač nabídek, N3): dřívější nabídky jiným
 * firmám se stejným oborem nebo pásmem, s poslanou cenou a výsledkem. Jen
 * vzor pro Kryštofa, nic se tím nepřepočítá. Bez shody se blok neukáže.
 */

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const dateText = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(iso))

const MATCH: Record<SimilarOffer['match'], string> = { both: 'stejný obor i pásmo', industry: 'stejný obor', band: 'stejné pásmo' }

export function SimilarOffers({ offers }: { offers: SimilarOffer[] }) {
  if (offers.length === 0) return null
  return (
    <section aria-labelledby="podobne-nabidky" className="flex flex-col gap-2">
      <h3 id="podobne-nabidky" className="text-sm font-semibold text-ink">
        Podobné nabídky
      </h3>
      <p className="text-xs text-quiet">Co jste poslal podobným firmám a jak to dopadlo. Ceny níž to nemění.</p>
      <ul className="flex flex-col divide-y divide-navy-100 rounded-chip border border-navy-100">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/dashboard/kontakty/${o.contactId}`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline-offset-2 hover:underline sm:min-h-0"
              >
                {o.company}
              </Link>
              <p className="text-xs text-quiet">
                {[o.industry, o.bandText, MATCH[o.match]].filter(Boolean).join(' · ')}
              </p>
              <p className="font-num text-xs text-ink">
                {dateText(o.sentAt)}
                {o.recommendedPrice !== null && ` · doporučená ${czk(o.recommendedPrice)}`}
                {o.chosen && ` · vybral ${o.chosen.name} ${czk(o.chosen.price)}`}
                {o.finalPrice !== null && ` · zakázka ${czk(o.finalPrice)}`}
              </p>
            </div>
            <Badge variant={toneVariant(OFFER_STATUS_TONE[o.status])}>{PROPOSAL_STATUS_LABEL[o.status]}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
