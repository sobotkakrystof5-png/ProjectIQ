'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  createDraft,
  dismissDraft,
  isDraftsReady,
  restoreDraft,
  saveRecurring,
  setDraftEmail,
  setRecurringActive,
  updateDraft,
} from '@/lib/admin/invoice-drafts'
import { draftFieldsSchema, recurringFieldsSchema } from '@/lib/admin/invoice-draft-schema'

/**
 * Koncepty faktur a pravidelné faktury (R-117). Vystavení a odeslání tu
 * **není** — to dělá `/api/invoices/drafts/[id]/send`, protože k němu patří PDF.
 */

const PATH = '/dashboard/faktury'
const uuid = z.string().uuid()
const NOT_READY = 'Koncepty faktur ještě nejsou zapnuté (chybí migrace 117).'

type Result = { error?: string; id?: string }

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Něco v konceptu nesedí.'
}

/** Uložit rozepsanou fakturu: nový koncept, nebo úprava existujícího. */
export async function saveInvoiceDraft(draftId: string | null, raw: unknown): Promise<Result> {
  await requireAuth()
  if (!(await isDraftsReady())) return { error: NOT_READY }
  const parsed = draftFieldsSchema.safeParse(raw)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    if (draftId === null) {
      const id = await createDraft('manual', parsed.data)
      revalidatePath(PATH)
      return { id }
    }
    if (!uuid.safeParse(draftId).success) return { error: 'Koncept nenalezen.' }
    const ok = await updateDraft(draftId, parsed.data)
    if (!ok) return { error: 'Tenhle koncept už je vystavený nebo zahozený.' }
    revalidatePath(PATH)
    return { id: draftId }
  } catch (err) {
    console.error('[Faktury] Koncept se nepodařilo uložit.', err instanceof Error ? err.message : String(err))
    return { error: 'Koncept se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}

export async function saveDraftEmail(draftId: string, email: string): Promise<Result> {
  await requireAuth()
  if (!uuid.safeParse(draftId).success) return { error: 'Koncept nenalezen.' }
  const parsed = draftFieldsSchema.shape.email.safeParse(email)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const ok = await setDraftEmail(draftId, parsed.data)
  return ok ? {} : { error: 'Tenhle koncept už je vyřízený.' }
}

/** Zahodit — „Zpět" v toastu ho vrátí (`restoreInvoiceDraft`). */
export async function dismissInvoiceDraft(draftId: string): Promise<Result> {
  await requireAuth()
  if (!uuid.safeParse(draftId).success) return { error: 'Koncept nenalezen.' }
  const ok = await dismissDraft(draftId)
  revalidatePath(PATH)
  return ok ? {} : { error: 'Tenhle koncept už je vyřízený.' }
}

export async function restoreInvoiceDraft(draftId: string): Promise<Result> {
  await requireAuth()
  if (!uuid.safeParse(draftId).success) return { error: 'Koncept nenalezen.' }
  const ok = await restoreDraft(draftId)
  revalidatePath(PATH)
  return ok ? {} : { error: 'Koncept už vrátit nejde.' }
}

export async function saveRecurringInvoice(id: string | null, raw: unknown): Promise<Result> {
  await requireAuth()
  if (!(await isDraftsReady())) return { error: NOT_READY }
  if (id !== null && !uuid.safeParse(id).success) return { error: 'Pravidelná faktura nenalezena.' }
  const parsed = recurringFieldsSchema.safeParse(raw)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  try {
    const saved = await saveRecurring(id, parsed.data)
    revalidatePath(`${PATH}/pravidelne`)
    return { id: saved }
  } catch (err) {
    console.error('[Faktury] Pravidelnou fakturu se nepodařilo uložit.', err instanceof Error ? err.message : String(err))
    return { error: 'Pravidelnou fakturu se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}

export async function toggleRecurringInvoice(id: string, active: boolean): Promise<Result> {
  await requireAuth()
  if (!uuid.safeParse(id).success) return { error: 'Pravidelná faktura nenalezena.' }
  const ok = await setRecurringActive(id, active)
  revalidatePath(`${PATH}/pravidelne`)
  return ok ? {} : { error: 'Pravidelná faktura nenalezena.' }
}
