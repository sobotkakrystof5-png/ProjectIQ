import { bandLabel, type OfferKind, type PricingRules, type VariantKey } from './pricing'
import { variantOf, type ProposalStatus, type ProposalVariant } from './proposal-model'
import { slug } from './review'

/**
 * Podobné nabídky (navrhovač nabídek, N3, plán oddíl 6). Ke konceptu najde
 * nejvýš tři dřívější odeslané nabídky jiným firmám se stejným oborem nebo
 * pásmem ceny a ukáže, jakou cenu Kryštof poslal a jak nabídka dopadla.
 * Slouží jen jako vzor, cenu nemění: tu dál počítají pravidla.
 *
 * Čistá funkce bez databáze. Vynechává referenční ceny (navrhovač se z nich
 * neučí) a nabídky téhož kontaktu (ty jsou ve „Starší nabídky").
 */

export const SIMILAR_LIMIT = 3

export type SimilarCandidate = {
  id: string
  contact_id: string
  company: string
  industry: string | null
  kind: OfferKind
  band: number | null
  status: ProposalStatus
  sent_at: string | null
  recommended: VariantKey
  sent_variants: ProposalVariant[] | null
  chosen_variant: VariantKey | null
  final_price_czk: number | null
  reference_price: boolean
}

export type SimilarTarget = {
  kind: OfferKind
  band: number | null
  industry: string | null
  /** Kontakt konceptu a kontakty s ním sloučené. */
  contactIds: string[]
}

export type SimilarOffer = {
  id: string
  contactId: string
  company: string
  industry: string | null
  bandText: string
  status: ProposalStatus
  sentAt: string
  recommendedPrice: number | null
  chosen: { name: string; price: number } | null
  finalPrice: number | null
  /** Čím je podobná: obor, pásmo, nebo obojí. */
  match: 'both' | 'industry' | 'band'
}

const RESOLVED = new Set<ProposalStatus>(['accepted', 'declined', 'no_reply', 'negotiating'])

export function pickSimilar(
  target: SimilarTarget,
  candidates: SimilarCandidate[],
  rules: PricingRules,
  limit = SIMILAR_LIMIT,
): SimilarOffer[] {
  const industryKey = slug(target.industry ?? '')
  const own = new Set(target.contactIds)
  const scored: { offer: SimilarOffer; score: number; at: number }[] = []

  for (const c of candidates) {
    if (c.status === 'draft' || c.sent_at === null || c.reference_price) continue
    if (c.kind !== target.kind || own.has(c.contact_id)) continue
    const sameIndustry = industryKey !== '' && slug(c.industry ?? '') === industryKey
    // E-shop má v pravidlech jedno pásmo, takže si jsou podobné všechny e-shopy.
    const sameBand = target.kind === 'eshop' || (target.band !== null && c.band === target.band)
    if (!sameIndustry && !sameBand) continue

    const variants = c.sent_variants ?? []
    const chosen = c.chosen_variant ? variantOf(variants, c.chosen_variant) : null
    const at = Date.parse(c.sent_at)
    scored.push({
      score: (sameIndustry ? 2 : 0) + (sameBand ? 2 : 0) + (RESOLVED.has(c.status) ? 1 : 0),
      at: Number.isFinite(at) ? at : 0,
      offer: {
        id: c.id,
        contactId: c.contact_id,
        company: c.company,
        industry: c.industry,
        bandText: c.kind === 'eshop' ? 'E-shop' : c.band === null ? '' : bandLabel(rules, c.band),
        status: c.status,
        sentAt: c.sent_at,
        recommendedPrice: variantOf(variants, c.recommended)?.price ?? null,
        chosen: chosen ? { name: chosen.name, price: chosen.price } : null,
        finalPrice: c.final_price_czk,
        match: sameIndustry && sameBand ? 'both' : sameIndustry ? 'industry' : 'band',
      },
    })
  }

  return scored
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, limit)
    .map((s) => s.offer)
}
