'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { VARIANT_KEYS, type PricingRules } from '@/lib/admin/offers/pricing'
import {
  acceptSuggestion,
  createProposalFromResearch,
  createSuggestions,
  deleteProposal,
  extendValidity,
  getProposal,
  publishProposal,
  rejectSuggestion,
  savePricingRules,
  setOutcome,
  setReferencePrice,
  undoSuggestion,
  updateProposal,
  type ProposalRow,
} from '@/lib/admin/offers/proposals'
import { pragueYearMonth } from '@/lib/admin/offers/review'

/**
 * Navrhovač nabídek, kroky N2–N4 (R-147, R-155): úprava návrhu, odeslání,
 * výsledek, cenová pravidla a návrhy jejich úprav. Všechno za přihlášením
 * adminu, vstupy přes Zod. Klientská stránka nabídky má vlastní akce
 * (`app/nabidka/[token]/actions.ts`).
 */

const uuid = z.string().uuid()
const variantKey = z.enum(VARIANT_KEYS)

const editSchema = z
  .object({
    inputs: z
      .object({
        kind: z.enum(['web', 'eshop']),
        typicalJobCzk: z.number().int().min(0).max(1_000_000_000).nullable(),
        // Zakázky z webu za měsíc; desetinné kvůli firmám s pár zakázkami za rok (0,3 = jedna za čtvrt roku).
        jobsPerMonth: z.number().min(0).max(10_000).transform((v) => Math.round(v * 10) / 10).nullable(),
        position: z.enum(['low', 'mid', 'high']),
        rush: z.boolean(),
        languages: z.number().int().min(0).max(5),
        showPayback: z.boolean(),
      })
      .strict(),
    variants: z
      .array(
        z
          .object({
            key: variantKey,
            price: z.number().int().min(0).max(1_000_000),
            includes: z.array(z.string().trim().min(1).max(160)).max(10),
          })
          .strict(),
      )
      .length(3)
      .refine((list) => new Set(list.map((v) => v.key)).size === 3, 'Každá varianta jen jednou.'),
    recommended: variantKey,
    intro: z.string().trim().max(2000),
    overCapConfirmed: z.boolean(),
  })
  .strict()

function refresh(contactId?: string) {
  if (contactId) revalidatePath(`/dashboard/kontakty/${contactId}`)
  revalidatePath('/dashboard/nabidky')
}

export async function createProposalAction(researchId: string): Promise<{ ok: true; id: string } | { ok: false }> {
  await requireAuth()
  const id = uuid.safeParse(researchId)
  if (!id.success) return { ok: false }
  const created = await createProposalFromResearch(id.data)
  if (created === null) return { ok: false }
  const row = await getProposal(created)
  refresh(row?.contact_id)
  return { ok: true, id: created }
}

export type SaveProposalResult = { ok: true; proposal: ProposalRow } | { ok: false; error: string }

export async function saveProposalAction(proposalId: string, raw: unknown): Promise<SaveProposalResult> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  const parsed = editSchema.safeParse(raw)
  if (!id.success) return { ok: false, error: 'Nabídka nenalezena. Obnovte stránku.' }
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje nabídky.' }
  const { overCapConfirmed, ...edit } = parsed.data
  const out = await updateProposal(id.data, edit, overCapConfirmed)
  if (!out.ok) {
    return {
      ok: false,
      error: out.error === 'not_draft' ? 'Nabídka už odešla, měnit ji nejde. Připravte novou.' : 'Nabídka nenalezena. Obnovte stránku.',
    }
  }
  refresh(out.proposal.contact_id)
  return out
}

export type PublishResult = { ok: true; url: string } | { ok: false; error: string }

/** „Zkopírovat odkaz": zveřejní nabídku a vrátí odkaz pro klienta. */
export async function publishProposalAction(proposalId: string): Promise<PublishResult> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  if (!id.success) return { ok: false, error: 'Nabídka nenalezena.' }
  const out = await publishProposal(id.data)
  if (!out.ok) {
    return {
      ok: false,
      error:
        out.error === 'needs_confirmation'
          ? 'Cena je nad 50 000 Kč. Potvrďte ji u nabídky, pak ji pošlete.'
          : 'Nabídka nenalezena. Obnovte stránku.',
    }
  }
  const row = await getProposal(id.data)
  refresh(row?.contact_id)
  return { ok: true, url: out.url }
}

export async function setOutcomeAction(
  proposalId: string,
  outcome: 'declined' | 'negotiating' | 'sent',
): Promise<ProposalRow | null> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  const next = z.enum(['declined', 'negotiating', 'sent']).safeParse(outcome)
  if (!id.success || !next.success) return null
  const row = await setOutcome(id.data, next.data)
  refresh(row?.contact_id)
  return row
}

export async function setReferenceAction(proposalId: string, value: boolean): Promise<{ ok: boolean }> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  if (!id.success || typeof value !== 'boolean') return { ok: false }
  const ok = await setReferencePrice(id.data, value)
  refresh()
  return { ok }
}

export async function extendProposalAction(proposalId: string): Promise<ProposalRow | null> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  if (!id.success) return null
  const row = await extendValidity(id.data)
  refresh(row?.contact_id)
  return row
}

export async function deleteProposalAction(proposalId: string, contactId: string): Promise<{ ok: boolean }> {
  await requireAuth()
  const id = uuid.safeParse(proposalId)
  const contact = uuid.safeParse(contactId)
  if (!id.success || !contact.success) return { ok: false }
  const ok = await deleteProposal(id.data)
  refresh(contact.data)
  return { ok }
}

/* ------------------------------------------------------------------ */
/* Pravidla a návrhy jejich úprav                                     */
/* ------------------------------------------------------------------ */

export async function savePricingRulesAction(raw: unknown): Promise<{ ok: true; rules: PricingRules } | { ok: false; error: string }> {
  await requireAuth()
  const saved = await savePricingRules(raw)
  if (saved === null) return { ok: false, error: 'Pravidla se neuložila. Zkontrolujte, že spodní cena není vyšší než horní.' }
  revalidatePath('/dashboard/nabidky')
  revalidatePath('/dashboard/nabidky/pravidla')
  return { ok: true, rules: saved }
}

export async function decideSuggestionAction(suggestionId: string, decision: 'accept' | 'reject'): Promise<{ ok: boolean }> {
  await requireAuth()
  const id = uuid.safeParse(suggestionId)
  if (!id.success) return { ok: false }
  const ok = decision === 'accept' ? (await acceptSuggestion(id.data)).ok : await rejectSuggestion(id.data)
  revalidatePath('/dashboard/nabidky')
  revalidatePath('/dashboard/nabidky/pravidla')
  return { ok }
}

export async function undoSuggestionAction(suggestionId: string): Promise<{ ok: boolean }> {
  await requireAuth()
  const id = uuid.safeParse(suggestionId)
  if (!id.success) return { ok: false }
  const ok = await undoSuggestion(id.data)
  revalidatePath('/dashboard/nabidky')
  revalidatePath('/dashboard/nabidky/pravidla')
  return { ok }
}

/** „Vyhodnotit teď": návrhy z posledních 3 měsíců, aniž by se čekalo na měsíční běh. */
export async function runReviewNowAction(): Promise<{ created: number }> {
  await requireAuth()
  const { created } = await createSuggestions(pragueYearMonth(new Date()))
  revalidatePath('/dashboard/nabidky')
  return { created }
}
