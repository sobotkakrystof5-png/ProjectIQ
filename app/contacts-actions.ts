'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  mergeContact,
  saveContactFields,
  unmergeContact,
  type ContactWriteResult,
  type MergeResult,
} from '@/lib/admin/contacts'

/**
 * Kontakty (AD09): úprava údajů a sloučení duplicit.
 *
 * Sloučení se nikdy nedělá samo — vždy na kliknutí a vždy se dá vzít zpět
 * (`unmerge`), protože se při něm nic nemaže. Výsledek se vrací jako
 * `{ ok, error }`, ne výjimkou: obrazovka má co ukázat.
 */

const uuid = z.string().uuid()

const fieldsSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable(),
  email: z.string().trim().max(320).nullable(),
  phone: z.string().trim().max(40).nullable(),
  ico: z.string().trim().max(20).nullable(),
  dic: z.string().trim().max(20).nullable(),
  note: z.string().trim().max(2000).nullable(),
})

export type ContactFormValues = z.infer<typeof fieldsSchema>

function refresh(...ids: string[]) {
  revalidatePath('/dashboard/kontakty')
  for (const id of ids) revalidatePath(`/dashboard/kontakty/${id}`)
}

export async function saveContact(id: string, raw: unknown): Promise<ContactWriteResult> {
  await requireAuth()
  const contactId = uuid.safeParse(id)
  if (!contactId.success) return { ok: false, error: 'Kontakt neexistuje.' }

  const parsed = fieldsSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: 'Jméno musí být vyplněné a ostatní údaje kratší, než jsou teď.' }
  }

  const result = await saveContactFields(contactId.data, parsed.data)
  if (result.ok) refresh(contactId.data)
  return result
}

export async function mergeDuplicate(sourceId: string, targetId: string): Promise<MergeResult> {
  await requireAuth()
  const source = uuid.safeParse(sourceId)
  const target = uuid.safeParse(targetId)
  if (!source.success || !target.success) return { ok: false, error: 'Kontakt neexistuje.' }

  const result = await mergeContact(source.data, target.data)
  if (result.ok) refresh(source.data, target.data)
  return result
}

export async function undoMerge(sourceId: string): Promise<ContactWriteResult> {
  await requireAuth()
  const source = uuid.safeParse(sourceId)
  if (!source.success) return { ok: false, error: 'Kontakt neexistuje.' }

  const result = await unmergeContact(source.data)
  if (result.ok) refresh(source.data)
  return result
}
