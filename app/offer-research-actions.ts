'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  deleteResearch,
  getResearch,
  retryFire,
  startResearch,
  type ResearchRow,
  type StartOutcome,
} from '@/lib/admin/offers/research'

/**
 * Navrhovač nabídek, krok N1: rozbor firmy u kontaktu (R-147, R-148).
 *
 * Každá akce stojí za přihlášením adminu. Spuštění stojí limit předplatného
 * Claude, proto jde jen na kliknutí a má strop za den (`DAILY_RUN_LIMIT`).
 */

const uuid = z.string().uuid()
const webInput = z.string().trim().max(300).nullable().optional()

const refresh = (contactId: string) => revalidatePath(`/dashboard/kontakty/${contactId}`)

export async function startOfferResearchAction(contactId: string, web?: string | null): Promise<StartOutcome> {
  await requireAuth()
  const id = uuid.safeParse(contactId)
  const site = webInput.safeParse(web)
  if (!id.success || !site.success) return { ok: false, error: 'not_found' }
  const outcome = await startResearch({ contactId: id.data, web: site.data === '' ? null : site.data })
  if (outcome.ok) refresh(id.data)
  return outcome
}

export async function refreshOfferResearchAction(researchId: string): Promise<ResearchRow | null> {
  await requireAuth()
  const id = uuid.safeParse(researchId)
  if (!id.success) return null
  return getResearch(id.data)
}

export async function retryOfferResearchAction(researchId: string): Promise<ResearchRow | null> {
  await requireAuth()
  const id = uuid.safeParse(researchId)
  if (!id.success) return null
  return retryFire(id.data)
}

export async function deleteOfferResearchAction(researchId: string, contactId: string): Promise<{ ok: boolean }> {
  await requireAuth()
  const id = uuid.safeParse(researchId)
  const contact = uuid.safeParse(contactId)
  if (!id.success || !contact.success) return { ok: false }
  const ok = await deleteResearch(id.data)
  refresh(contact.data)
  return { ok }
}
