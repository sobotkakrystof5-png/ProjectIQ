'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  mergeContact,
  saveContactFields,
  suggestContacts,
  unmergeContact,
  type ContactSuggestion,
  type ContactWriteResult,
  type MergeResult,
} from '@/lib/admin/contacts'
import { propagateContact } from '@/lib/admin/contact-sync'

/**
 * Kontakty (AD09): úprava údajů a sloučení duplicit.
 *
 * Kontakt je jediný zdroj e-mailu a telefonu klienta (R-141): po uložení se
 * nový údaj propíše do Hovorů, zakázek a budoucích schůzek. Selhání propisu
 * uložení nezruší — kontakt je uložený a propis doběhne při další úpravě.
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
  if (!result.ok) return result
  try {
    await propagateContact(result.id, result.previous)
  } catch (err) {
    console.error('[kontakty] propsání údajů do Hovorů a schůzek selhalo', (err as Error).message)
  }
  refresh(contactId.data)
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/ai-asistent')
  return { ok: true, id: result.id }
}

export async function mergeDuplicate(sourceId: string, targetId: string): Promise<MergeResult> {
  await requireAuth()
  const source = uuid.safeParse(sourceId)
  const target = uuid.safeParse(targetId)
  if (!source.success || !target.success) return { ok: false, error: 'Kontakt neexistuje.' }

  const result = await mergeContact(source.data, target.data)
  if (result.ok) {
    // Sloučené řádky dostanou údaje cíle jen tam, kde žádné nemají — sloučení jde vzít zpět, propis ne.
    try {
      await propagateContact(result.target)
    } catch (err) {
      console.error('[kontakty] doplnění údajů po sloučení selhalo', (err as Error).message)
    }
    refresh(source.data, target.data)
  }
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

/** Našeptávač kontaktů v okně události (R-141). */
export async function findContacts(raw: unknown): Promise<ContactSuggestion[]> {
  await requireAuth()
  const query = z.string().trim().min(2).max(80).safeParse(raw)
  if (!query.success) return []
  return suggestContacts(query.data)
}
