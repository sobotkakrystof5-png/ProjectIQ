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
import { startOfferForFirm } from '@/lib/admin/offers/new-firm'

/**
 * Navrhovač nabídek, krok N1: rozbor firmy u kontaktu (R-147, R-149).
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

/* ------------------------------------------------------------------ */
/* Nová nabídka pro firmu (R-160)                                       */
/* ------------------------------------------------------------------ */

const firmSchema = z
  .object({
    web: z.string().max(300).optional(),
    ico: z.string().max(20).optional(),
    name: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(40).optional(),
  })
  .strict()

export type NewOfferResult =
  | { ok: true; contactId: string; message: string; warning?: string }
  | { ok: false; error: string }

const RESEARCH_ERROR_TEXT: Record<Exclude<StartOutcome, { ok: true }>['error'], string> = {
  not_connected: 'Kontakt je založený, ale rozbor zatím nejde spustit: chybí napojení na cloudovou úlohu.',
  not_found: 'Kontakt je založený, ale rozbor se nespustil. Spusťte ho na kartě kontaktu.',
  already_running: 'Rozbor téhle firmy už běží. Nabídka se připraví sama, až doběhne.',
  daily_limit: 'Kontakt je založený, ale dnešní strop rozborů je vyčerpaný. Rozbor spusťte zítra na kartě kontaktu.',
}

/** „Připravit nabídku" na stránce Nabídky: firma → kontakt → rozbor → návrh nabídky sám. */
export async function startOfferForFirmAction(raw: unknown): Promise<NewOfferResult> {
  await requireAuth()
  const parsed = firmSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Zkontrolujte prosím údaje o firmě.' }
  const out = await startOfferForFirm(parsed.data)
  if (!out.ok) return out
  refresh(out.contactId)
  revalidatePath('/dashboard/nabidky')
  if (out.research.ok) {
    return {
      ok: true,
      contactId: out.contactId,
      message: out.created ? 'Firma je v Kontaktech a rozbor běží.' : 'Firmu už znám, rozbor běží u jejího kontaktu.',
    }
  }
  return {
    ok: true,
    contactId: out.contactId,
    message: out.created ? 'Firma je v Kontaktech.' : 'Firmu už znám.',
    warning: RESEARCH_ERROR_TEXT[out.research.error],
  }
}
