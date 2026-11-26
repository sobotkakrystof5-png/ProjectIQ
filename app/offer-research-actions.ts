'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  deleteResearch,
  refreshResearch,
  setupAgents,
  startResearch,
  type ResearchRow,
  type SetupOutcome,
  type StartOutcome,
} from '@/lib/admin/offers/research'

/**
 * Navrhovač nabídek, krok N1: rozbor firmy u kontaktu (R-147).
 *
 * Každá akce stojí za přihlášením adminu. Spuštění a nastavení agentů stojí
 * peníze v účtu Anthropicu, proto jdou jen na kliknutí a mají strop za den
 * (`DAILY_RUN_LIMIT`) a strop ceny jednoho běhu (`SESSION_BUDGET_CENTS`).
 */

const uuid = z.string().uuid()
const webInput = z.string().trim().max(300).nullable().optional()

const refresh = (contactId: string) => revalidatePath(`/dashboard/kontakty/${contactId}`)

export async function setupOfferAgentsAction(): Promise<SetupOutcome> {
  await requireAuth()
  return setupAgents()
}

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
  return refreshResearch(id.data)
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
