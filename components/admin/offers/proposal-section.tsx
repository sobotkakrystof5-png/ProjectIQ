import { ProposalCard } from '@/components/admin/offers/proposal-card'
import type { LeadEmailReadiness } from '@/components/LeadEmailDialog'
import { listResearchForContact } from '@/lib/admin/offers/research'
import { listProposalsForContact, listSimilarOffers, loadPricingRules, offerUrl } from '@/lib/admin/offers/proposals'
import type { SimilarOffer } from '@/lib/admin/offers/similar'

/**
 * Nabídka na kartě kontaktu (navrhovač nabídek, N2–N3, R-155). Načte nabídky,
 * cenová pravidla, stav posledního rozboru a ke konceptu podobné nabídky.
 * Bez migrace 142 se karta neukáže a zbytek stránky běží dál (stejně jako
 * rozbor bez 136/137).
 */
export async function ProposalSection({
  contactId,
  company,
  email,
  readiness,
}: {
  contactId: string
  company: string
  email: string | null
  readiness: LeadEmailReadiness
}) {
  const data = await Promise.all([listProposalsForContact(contactId), loadPricingRules(), listResearchForContact(contactId, 1)]).catch(
    (err: unknown) => {
      const code = (err as { code?: unknown })?.code
      if (code !== '42P01' && code !== '42703') {
        console.error('[navrhovac] karta nabídky se nenačetla:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
      }
      return null
    },
  )
  if (data === null) return null
  const [proposals, { rules }, research] = data
  const latest = research[0] ?? null
  const draft = proposals[0]?.status === 'draft' ? proposals[0] : null
  // Podobné nabídky jsou jen vzor: když se nenačtou, karta běží dál bez nich.
  const similar: SimilarOffer[] = draft
    ? await listSimilarOffers(draft, rules).catch((err: unknown) => {
        console.error('[navrhovac] podobné nabídky se nenačetly:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
        return []
      })
    : []
  return (
    <ProposalCard
      contactId={contactId}
      rules={rules}
      proposals={proposals.map((p) => ({ ...p, url: offerUrl(p.public_token) }))}
      similar={similar}
      researchDoneId={latest?.status === 'done' ? latest.id : null}
      researchOpen={latest?.status === 'queued' || latest?.status === 'running'}
      mail={{ company, email, readiness }}
    />
  )
}
